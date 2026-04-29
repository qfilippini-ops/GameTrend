import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/simulator/baseline
 *
 * Retourne les valeurs RÉELLES actuelles du projet pour pré-remplir le
 * simulateur (bouton "Charger valeurs actuelles") :
 *   - audience (totalUsers, MAU, % conversion)
 *   - mix premium réel (% monthly/yearly/lifetime)
 *   - usage RÉEL par utilisateur sur les 30 derniers jours
 *     (calls Navi, images modérées, emails envoyés, joins vocal)
 *
 * Le simulateur recalcule les coûts via les tarifs unitaires en interne, ce
 * qui évite les divergences si Lemon/OpenAI/etc changent leurs tarifs.
 */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // ─── Audience ────────────────────────────────────────────────────────────
  const [
    { count: totalUsers },
    { count: mau },
    { count: premiumActive },
  ] = await Promise.all([
    admin.from("profiles").select("*", { count: "exact", head: true }),
    admin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gte("last_seen_at", thirtyDaysAgo.toISOString()),
    admin
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .in("subscription_status", ["trialing", "active", "lifetime"]),
  ]);

  // Mix actuel des premium
  type PlanRow = { subscription_plan: string | null };
  const { data: planRows } = await admin
    .from("profiles")
    .select("subscription_plan")
    .in("subscription_status", ["trialing", "active", "lifetime"])
    .returns<PlanRow[]>();
  let monthlyN = 0;
  let yearlyN = 0;
  let lifetimeN = 0;
  for (const r of planRows ?? []) {
    if (r.subscription_plan === "monthly") monthlyN++;
    else if (r.subscription_plan === "yearly") yearlyN++;
    else if (r.subscription_plan === "lifetime") lifetimeN++;
  }
  const totalPlans = monthlyN + yearlyN + lifetimeN;

  // ─── Usage réel sur 30 jours depuis usage_log ───────────────────────────
  // On compte les appels par event_type (pas le coût en € qui est dérivé).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: usageRowsRaw } = await (admin as any)
    .from("usage_log")
    .select("event_type")
    .gte("created_at", thirtyDaysAgo.toISOString());
  type UsageRow = { event_type: string };
  const usageRows = (usageRowsRaw as UsageRow[] | null) ?? [];

  const callsByEvent: Record<string, number> = {};
  for (const u of usageRows) {
    callsByEvent[u.event_type] = (callsByEvent[u.event_type] ?? 0) + 1;
  }

  const safeMau = mau && mau > 0 ? mau : 1;
  const safePremium = premiumActive && premiumActive > 0 ? premiumActive : 1;

  // Ramène l'usage en "unités par utilisateur par mois"
  const naviCallsPerPremiumPerMonth = Math.round(
    (callsByEvent.openai_navi ?? 0) / safePremium
  );
  const imagesUploadedPerMauPerMonth = Math.round(
    (callsByEvent.sightengine_check ?? 0) / safeMau
  );
  const emailsPerMauPerMonth = Math.round(
    (callsByEvent.resend_email ?? 0) / safeMau
  );
  // Pour le voice, 1 token mint ≈ 1 join. On approxime 5 minutes/join (à
  // affiner quand on aura les durées).
  const voiceMinutesPerPremiumPerMonth = Math.round(
    ((callsByEvent.livekit_token_mint ?? 0) * 5) / safePremium
  );

  return NextResponse.json({
    audience: {
      totalUsers: totalUsers ?? 0,
      mau: mau ?? 0,
      mauRatePct:
        totalUsers && totalUsers > 0
          ? Math.round(((mau ?? 0) / totalUsers) * 100)
          : 0,
      premiumActive: premiumActive ?? 0,
      premiumConversionPct:
        mau && mau > 0
          ? Math.round(((premiumActive ?? 0) / mau) * 100)
          : 0,
    },
    mix: {
      monthlySharePct:
        totalPlans > 0 ? Math.round((monthlyN / totalPlans) * 100) : 60,
      yearlySharePct:
        totalPlans > 0 ? Math.round((yearlyN / totalPlans) * 100) : 30,
      lifetimeSharePct:
        totalPlans > 0 ? Math.round((lifetimeN / totalPlans) * 100) : 10,
    },
    usage: {
      naviCallsPerPremiumPerMonth,
      imagesUploadedPerMauPerMonth,
      emailsPerMauPerMonth,
      voiceMinutesPerPremiumPerMonth,
    },
    raw: {
      callsByEvent,
      windowDays: 30,
    },
  });
}
