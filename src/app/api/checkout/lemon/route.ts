import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createCheckoutUrl, LS_PLANS, type LemonPlan } from "@/lib/lemon/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPPORTED_LOCALES = ["fr", "en"] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];

function resolveAppUrl(): { url: string } | { error: string } {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) return { error: "missing_app_url" };
  if (!/^https:\/\//i.test(raw)) {
    // Lemon Squeezy refuse les URLs http:// et localhost dans redirect_url.
    return { error: "invalid_app_url" };
  }
  return { url: raw.replace(/\/+$/, "") };
}

function pickLocale(input: unknown): Locale {
  return typeof input === "string" && (SUPPORTED_LOCALES as readonly string[]).includes(input)
    ? (input as Locale)
    : "fr";
}

/**
 * POST /api/checkout/lemon
 * Body : { plan: 'monthly' | 'yearly' | 'lifetime', locale?: 'fr' | 'en' }
 *
 * Crée un checkout Lemon Squeezy et retourne l'URL.
 *
 * Sécurité :
 *   - Auth requis (anonymes refusés)
 *   - Lifetime refusé si user pas eligible
 *
 * Redirect post-paiement : `${NEXT_PUBLIC_APP_URL}/${locale}/profile?checkout=success`
 * → impératif HTTPS, sinon LS rejette en 422.
 */
export async function POST(req: Request) {
  let body: { plan?: LemonPlan; locale?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const plan = body.plan;
  if (!plan || !["monthly", "yearly", "lifetime"].includes(plan)) {
    return NextResponse.json({ error: "invalid_plan" }, { status: 400 });
  }

  const variantId = LS_PLANS[plan];
  if (!variantId) {
    return NextResponse.json({ error: "plan_not_configured" }, { status: 500 });
  }

  const appUrlResult = resolveAppUrl();
  if ("error" in appUrlResult) {
    console.error("[checkout/lemon]", appUrlResult.error, "NEXT_PUBLIC_APP_URL =", process.env.NEXT_PUBLIC_APP_URL);
    return NextResponse.json({ error: appUrlResult.error }, { status: 500 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  if (plan === "lifetime") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("lifetime_eligible")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.lifetime_eligible) {
      return NextResponse.json({ error: "not_eligible" }, { status: 403 });
    }
  }

  const locale = pickLocale(body.locale);
  const result = await createCheckoutUrl({
    variantId,
    userId: user.id,
    email: user.email,
    redirectUrl: `${appUrlResult.url}/${locale}/profile?checkout=success`,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ url: result.url });
}
