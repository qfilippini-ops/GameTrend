import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSignature, variantIdToPlan, getCustomerPortalUrl } from "@/lib/lemon/client";
import { sendEmail } from "@/lib/email/resend";
import { welcomeEmail, paymentFailedEmail, cancelledEmail } from "@/lib/email/templates";
import { captureServerEvent } from "@/lib/analytics/posthog-server";
import { COMMISSION_RATE, AFFILIATE_PENDING_DAYS } from "@/lib/affiliate/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook Lemon Squeezy.
 *
 * Sécurité : signature HMAC-SHA256 vérifiée via LEMON_WEBHOOK_SECRET.
 * Idempotence : upsert sur ls_subscription_id UNIQUE.
 *
 * Events gérés :
 *   - subscription_created            → trialing
 *   - subscription_updated            → maj statut + dates
 *   - subscription_cancelled          → cancel_at posé
 *   - subscription_resumed            → reprise active
 *   - subscription_expired            → free
 *   - subscription_paused / unpaused  → maj statut
 *   - subscription_payment_success    → renouvellement + commission affilié
 *   - subscription_payment_failed     → past_due + email
 *   - subscription_payment_recovered  → active
 *   - subscription_payment_refunded   → marquer earnings concernés en reversed
 *   - order_created (lifetime)        → lifetime
 *   - order_refunded                  → free
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  const sig = headers().get("x-signature");

  if (!verifyWebhookSignature(rawBody, sig)) {
    console.warn("[lemon-webhook] signature invalide");
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const eventName = event?.meta?.event_name as string | undefined;
  const customData = event?.meta?.custom_data ?? {};
  const data = event?.data ?? {};
  const attributes = data?.attributes ?? {};

  if (!eventName) {
    return NextResponse.json({ error: "no_event_name" }, { status: 400 });
  }

  const userId =
    customData?.user_id ??
    attributes?.first_subscription_item?.subscription?.custom_data?.user_id ??
    null;

  const supabase = createAdminClient();

  console.log(`[lemon-webhook] ${eventName} user=${userId ?? "?"}`);

  try {
    switch (eventName) {
      case "subscription_created":
      case "subscription_updated":
      case "subscription_resumed":
      case "subscription_paused":
      case "subscription_unpaused": {
        await handleSubscriptionLifecycle(supabase, eventName, data, userId);
        break;
      }

      case "subscription_cancelled": {
        await handleSubscriptionCancelled(supabase, data, userId);
        break;
      }

      case "subscription_expired": {
        await handleSubscriptionExpired(supabase, data, userId);
        break;
      }

      case "subscription_payment_success":
      case "subscription_payment_recovered": {
        await handlePaymentSuccess(supabase, data, userId);
        break;
      }

      case "subscription_payment_failed": {
        await handlePaymentFailed(supabase, data, userId);
        break;
      }

      case "subscription_payment_refunded": {
        await handlePaymentRefunded(supabase, data, userId);
        break;
      }

      case "order_created": {
        await handleOrderCreated(supabase, data, userId);
        break;
      }

      case "order_refunded": {
        await handleOrderRefunded(supabase, data, userId);
        break;
      }

      default:
        console.log(`[lemon-webhook] event ignoré : ${eventName}`);
    }
  } catch (e) {
    console.error(`[lemon-webhook] erreur traitement ${eventName}`, e);
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// ─── Handlers ──────────────────────────────────────────────────────────────

async function handleSubscriptionLifecycle(
  supabase: ReturnType<typeof createAdminClient>,
  eventName: string,
  data: any,
  userId: string | null
) {
  if (!userId) {
    console.warn("[lemon-webhook] subscription event sans user_id");
    return;
  }

  const attrs = data.attributes;
  const variantId = String(attrs.variant_id);
  const plan = variantIdToPlan(variantId);
  if (!plan) {
    console.warn(`[lemon-webhook] variant inconnu : ${variantId}`);
    return;
  }

  const lsSubId = String(data.id);
  const lsCustomerId = attrs.customer_id ? String(attrs.customer_id) : null;
  const lsOrderId = attrs.order_id ? String(attrs.order_id) : null;
  const lsStatus = String(attrs.status); // on_trial, active, paused, cancelled, expired, past_due

  const subscriptionStatus = mapLsStatusToProfile(lsStatus);

  // Upsert dans subscriptions (idempotent via UNIQUE ls_subscription_id)
  await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      ls_subscription_id: lsSubId,
      ls_customer_id: lsCustomerId,
      ls_order_id: lsOrderId,
      variant_id: variantId,
      plan,
      status: lsStatus,
      amount_cents: 0,
      currency: attrs.currency ?? "EUR",
      trial_ends_at: attrs.trial_ends_at ?? null,
      renews_at: attrs.renews_at ?? null,
      ends_at: attrs.ends_at ?? null,
      raw_event: data,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "ls_subscription_id" }
  );

  // Update profile
  await supabase
    .from("profiles")
    .update({
      subscription_status: subscriptionStatus,
      subscription_plan: plan,
      subscription_current_period_end: attrs.renews_at ?? attrs.ends_at ?? null,
      subscription_cancel_at: null,
      ls_customer_id: lsCustomerId,
    })
    .eq("id", userId);

  // Notification + email + analytics uniquement à la création initiale
  if (eventName === "subscription_created") {
    await supabase.from("notifications").insert({
      user_id: userId,
      type: "subscription_started",
      payload: { plan },
    });

    const profile = await fetchProfileForEmail(supabase, userId);
    if (profile?.email) {
      const tpl = welcomeEmail({ locale: profile.locale, name: profile.name });
      await sendEmail({ to: profile.email, ...tpl });
    }

    await captureServerEvent(userId, "subscription_started", { plan, ls_status: lsStatus });
  }
}

async function handleSubscriptionCancelled(
  supabase: ReturnType<typeof createAdminClient>,
  data: any,
  userId: string | null
) {
  if (!userId) return;
  const attrs = data.attributes;
  const lsSubId = String(data.id);
  const endsAt = attrs.ends_at ?? attrs.renews_at ?? null;

  await supabase
    .from("subscriptions")
    .update({
      status: String(attrs.status),
      ends_at: endsAt,
      updated_at: new Date().toISOString(),
    })
    .eq("ls_subscription_id", lsSubId);

  await supabase
    .from("profiles")
    .update({
      subscription_cancel_at: endsAt,
    })
    .eq("id", userId);

  const profile = await fetchProfileForEmail(supabase, userId);
  if (profile?.email && endsAt) {
    const endDate = new Date(endsAt).toLocaleDateString(
      profile.locale === "fr" ? "fr-FR" : "en-US",
      { day: "numeric", month: "long", year: "numeric" }
    );
    const tpl = cancelledEmail({ locale: profile.locale, name: profile.name, endDate });
    await sendEmail({ to: profile.email, ...tpl });
  }

  await captureServerEvent(userId, "subscription_cancelled", { ends_at: endsAt });
}

async function handleSubscriptionExpired(
  supabase: ReturnType<typeof createAdminClient>,
  data: any,
  userId: string | null
) {
  if (!userId) return;
  const lsSubId = String(data.id);

  await supabase
    .from("subscriptions")
    .update({ status: "expired", updated_at: new Date().toISOString() })
    .eq("ls_subscription_id", lsSubId);

  await supabase
    .from("profiles")
    .update({
      subscription_status: "free",
      subscription_plan: null,
      subscription_current_period_end: null,
      subscription_cancel_at: null,
    })
    .eq("id", userId);

  await captureServerEvent(userId, "subscription_expired");
}

async function handlePaymentSuccess(
  supabase: ReturnType<typeof createAdminClient>,
  data: any,
  userId: string | null
) {
  if (!userId) return;
  const attrs = data.attributes;
  const lsSubId = attrs.subscription_id ? String(attrs.subscription_id) : null;
  const totalCents = Number(attrs.total ?? 0);
  const currency = attrs.currency ?? "EUR";
  const lsInvoiceId = String(data.id);
  const paidAt = attrs.created_at ?? new Date().toISOString();

  // Récupère plan + sub_id depuis la sub existante (créée par
  // subscription_created en amont). Tolère le cas où la sub n'existerait
  // pas encore (ordre webhook inversé) en fallback "monthly".
  let plan: string = "monthly";
  let subId: string | null = null;
  if (lsSubId) {
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("id, plan")
      .eq("ls_subscription_id", lsSubId)
      .maybeSingle<{ id: string; plan: string }>();
    if (sub) {
      plan = sub.plan;
      subId = sub.id;
    }
  }

  // INSERT idempotent dans subscription_payments. UNIQUE sur ls_invoice_id
  // garantit qu'un même paiement ne soit pas compté deux fois si le webhook
  // est rejoué (Lemon retry sur 5xx).
  // Cast any : table absente du type Database généré, à régénérer après
  // application de schema_subscription_payments_v1.sql.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: payErr } = await (
    supabase.from("subscription_payments") as any
  ).upsert(
    {
      user_id: userId,
      subscription_id: subId,
      ls_invoice_id: lsInvoiceId,
      ls_subscription_id: lsSubId,
      ls_order_id: attrs.order_id ? String(attrs.order_id) : null,
      plan,
      amount_cents: totalCents,
      currency,
      paid_at: paidAt,
      raw_event: data,
    },
    { onConflict: "ls_invoice_id" }
  );
  if (payErr) {
    console.error("[lemon-webhook] subscription_payments upsert failed", payErr);
  }

  if (lsSubId) {
    await supabase
      .from("subscriptions")
      .update({
        status: "active",
        amount_cents: totalCents,
        renews_at: attrs.renews_at ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("ls_subscription_id", lsSubId);
  }

  await supabase
    .from("profiles")
    .update({
      subscription_status: "active",
      subscription_current_period_end: attrs.renews_at ?? null,
    })
    .eq("id", userId);

  // Commission affilié : 40% du net (après 5% LS) sur abonnements uniquement
  const { data: ref } = await supabase
    .from("referrals")
    .select("id, referrer_id")
    .eq("referred_id", userId)
    .maybeSingle();

  if (ref) {
    const netCents = Math.round(totalCents * 0.95);
    const commissionCents = Math.round(netCents * COMMISSION_RATE);

    if (commissionCents > 0) {
      const eligibleAt = new Date(
        Date.now() + AFFILIATE_PENDING_DAYS * 24 * 60 * 60 * 1000
      ).toISOString();

      await supabase.from("referral_earnings").insert({
        referral_id: ref.id,
        amount_cents: commissionCents,
        currency,
        source_type: "subscription_payment",
        source_id: lsInvoiceId,
        commission_rate: COMMISSION_RATE,
        status: "pending",
        eligible_at: eligibleAt,
      });
    }
  }

  await captureServerEvent(userId, "subscription_renewed", { amount_cents: totalCents, currency });
}

async function handlePaymentFailed(
  supabase: ReturnType<typeof createAdminClient>,
  data: any,
  userId: string | null
) {
  if (!userId) return;
  const attrs = data.attributes;
  const lsSubId = attrs.subscription_id ? String(attrs.subscription_id) : null;

  if (lsSubId) {
    await supabase
      .from("subscriptions")
      .update({ status: "past_due", updated_at: new Date().toISOString() })
      .eq("ls_subscription_id", lsSubId);
  }

  await supabase
    .from("profiles")
    .update({ subscription_status: "past_due" })
    .eq("id", userId);

  const profile = await fetchProfileForEmail(supabase, userId);
  if (profile?.email && profile.lsCustomerId) {
    const portalUrl =
      (await getCustomerPortalUrl(profile.lsCustomerId)) ??
      `${process.env.NEXT_PUBLIC_APP_URL}/${profile.locale}/profile`;
    const tpl = paymentFailedEmail({ locale: profile.locale, name: profile.name, portalUrl });
    await sendEmail({ to: profile.email, ...tpl });
  }

  await captureServerEvent(userId, "payment_failed");
}

async function handlePaymentRefunded(
  supabase: ReturnType<typeof createAdminClient>,
  data: any,
  userId: string | null
) {
  if (!userId) return;
  const lsInvoiceId = String(data.id);

  // Marque les commissions liées en reversed
  await supabase
    .from("referral_earnings")
    .update({ status: "reversed" })
    .eq("source_id", lsInvoiceId);

  await captureServerEvent(userId, "payment_refunded");
}

async function handleOrderCreated(
  supabase: ReturnType<typeof createAdminClient>,
  data: any,
  userId: string | null
) {
  if (!userId) return;
  const attrs = data.attributes;
  const variantId = String(attrs.first_order_item?.variant_id ?? "");
  const plan = variantIdToPlan(variantId);

  // Order_created concerne aussi les abos (premier paiement). On filtre sur lifetime.
  if (plan !== "lifetime") {
    return;
  }

  const lsOrderId = String(data.id);
  const lsCustomerId = attrs.customer_id ? String(attrs.customer_id) : null;
  const totalCents = Number(attrs.total ?? 0);

  const { data: subRow } = await supabase
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        ls_subscription_id: `lifetime_${lsOrderId}`,
        ls_customer_id: lsCustomerId,
        ls_order_id: lsOrderId,
        variant_id: variantId,
        plan: "lifetime",
        status: "active",
        amount_cents: totalCents,
        currency: attrs.currency ?? "EUR",
        trial_ends_at: null,
        renews_at: null,
        ends_at: null,
        raw_event: data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "ls_subscription_id" }
    )
    .select("id")
    .maybeSingle<{ id: string }>();

  // INSERT idempotent dans subscription_payments pour le paiement lifetime
  // (one-shot, jamais de renouvellement). On utilise lsOrderId comme
  // pseudo-invoice_id (le order Lemon n'a pas d'invoice distinct).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: payErr } = await (
    supabase.from("subscription_payments") as any
  ).upsert(
    {
      user_id: userId,
      subscription_id: subRow?.id ?? null,
      ls_invoice_id: `lifetime_order_${lsOrderId}`,
      ls_subscription_id: `lifetime_${lsOrderId}`,
      ls_order_id: lsOrderId,
      plan: "lifetime",
      amount_cents: totalCents,
      currency: attrs.currency ?? "EUR",
      paid_at: attrs.created_at ?? new Date().toISOString(),
      raw_event: data,
    },
    { onConflict: "ls_invoice_id" }
  );
  if (payErr) {
    console.error(
      "[lemon-webhook] subscription_payments lifetime upsert failed",
      payErr
    );
  }

  await supabase
    .from("profiles")
    .update({
      subscription_status: "lifetime",
      subscription_plan: "lifetime",
      subscription_current_period_end: null,
      subscription_cancel_at: null,
      ls_customer_id: lsCustomerId,
    })
    .eq("id", userId);

  await supabase.from("notifications").insert({
    user_id: userId,
    type: "subscription_started",
    payload: { plan: "lifetime" },
  });

  // Commission affilié sur l'achat lifetime (one-shot)
  const { data: ref } = await supabase
    .from("referrals")
    .select("id, referrer_id")
    .eq("referred_id", userId)
    .maybeSingle();

  if (ref) {
    const netCents = Math.round(totalCents * 0.95);
    const commissionCents = Math.round(netCents * COMMISSION_RATE);
    if (commissionCents > 0) {
      const eligibleAt = new Date(
        Date.now() + AFFILIATE_PENDING_DAYS * 24 * 60 * 60 * 1000
      ).toISOString();
      await supabase.from("referral_earnings").insert({
        referral_id: ref.id,
        amount_cents: commissionCents,
        currency: attrs.currency ?? "EUR",
        source_type: "lifetime_purchase",
        source_id: lsOrderId,
        commission_rate: COMMISSION_RATE,
        status: "pending",
        eligible_at: eligibleAt,
      });
    }
  }

  const profile = await fetchProfileForEmail(supabase, userId);
  if (profile?.email) {
    const tpl = welcomeEmail({ locale: profile.locale, name: profile.name });
    await sendEmail({ to: profile.email, ...tpl });
  }

  await captureServerEvent(userId, "lifetime_purchased", { amount_cents: totalCents });
}

async function handleOrderRefunded(
  supabase: ReturnType<typeof createAdminClient>,
  data: any,
  userId: string | null
) {
  if (!userId) return;
  const lsOrderId = String(data.id);

  // Si lifetime → downgrade
  await supabase
    .from("subscriptions")
    .update({ status: "refunded", updated_at: new Date().toISOString() })
    .eq("ls_order_id", lsOrderId);

  await supabase
    .from("profiles")
    .update({
      subscription_status: "free",
      subscription_plan: null,
    })
    .eq("id", userId)
    .eq("subscription_status", "lifetime");

  await supabase
    .from("referral_earnings")
    .update({ status: "reversed" })
    .eq("source_id", lsOrderId);

  await captureServerEvent(userId, "payment_refunded", { reason: "order_refunded" });
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function mapLsStatusToProfile(lsStatus: string): string {
  switch (lsStatus) {
    case "on_trial":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "cancelled":
      return "active";
    case "paused":
      return "active";
    case "expired":
      return "free";
    case "unpaid":
      return "past_due";
    default:
      return "active";
  }
}

async function fetchProfileForEmail(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<{ email: string; name: string; locale: "fr" | "en"; lsCustomerId: string | null } | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("username, ls_customer_id")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) return null;

  const { data: userRes } = await supabase.auth.admin.getUserById(userId);
  const email = userRes?.user?.email;
  const locale = (userRes?.user?.user_metadata?.locale as "fr" | "en" | undefined) ?? "fr";

  if (!email) return null;

  return {
    email,
    name: profile.username ?? "Joueur",
    locale: locale === "en" ? "en" : "fr",
    lsCustomerId: profile.ls_customer_id ?? null,
  };
}
