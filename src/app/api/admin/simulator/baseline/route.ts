import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { microsToCents, USD_TO_EUR } from "@/lib/admin/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/simulator/baseline
 *
 * Retourne les valeurs RÉELLES actuelles du projet pour pré-remplir le
 * simulateur (bouton "Charger valeurs actuelles"). Permet de partir d'une
 * baseline fidèle puis de jouer sur les paramètres pour voir l'évolution.
 *
 * Sécurité : requireAdmin (404 opaque sinon).
 */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const admin = createAdminClient();

  // Période : 30 derniers jours (pour les ratios par MAU)
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

  // ─── Coûts variables réels (sur 30 derniers jours) ──────────────────────
  // On agrège usage_log par event_type puis on divise par MAU pour avoir un
  // coût par utilisateur représentatif.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: usageRowsRaw } = await (admin as any)
    .from("usage_log")
    .select("event_type, estimated_cost_micros, currency")
    .gte("created_at", thirtyDaysAgo.toISOString());
  type UsageRow = {
    event_type: string;
    estimated_cost_micros: number;
    currency: string;
  };
  const usageRows = (usageRowsRaw as UsageRow[] | null) ?? [];

  const totalsByEvent: Record<string, number> = {};
  for (const u of usageRows) {
    const cur = (u.currency === "EUR" ? "EUR" : "USD") as "EUR" | "USD";
    const eurCents = microsToCents(u.estimated_cost_micros, cur);
    totalsByEvent[u.event_type] =
      (totalsByEvent[u.event_type] ?? 0) + eurCents;
  }

  const safeMau = mau && mau > 0 ? mau : 1;
  const safePremium = premiumActive && premiumActive > 0 ? premiumActive : 1;

  const naviCostPerPremiumCents = Math.round(
    (totalsByEvent.openai_navi ?? 0) / safePremium
  );
  const moderationCostPerMauCents = Math.round(
    (totalsByEvent.sightengine_check ?? 0) / safeMau
  );
  const emailCostPerMauCents = Math.round(
    (totalsByEvent.resend_email ?? 0) / safeMau
  );
  const voiceBandwidthCostPerPremiumCents = Math.round(
    (totalsByEvent.livekit_token_mint ?? 0) / safePremium
  );

  // Note : USD_TO_EUR utilisé par microsToCents en interne, on le référence
  // ici pour signaler que les conversions ont été appliquées.
  void USD_TO_EUR;

  return NextResponse.json({
    audience: {
      totalUsers: totalUsers ?? 0,
      mau: mau ?? 0,
      mauRatePct: totalUsers && totalUsers > 0
        ? Math.round(((mau ?? 0) / totalUsers) * 100)
        : 0,
      premiumActive: premiumActive ?? 0,
      premiumConversionPct: mau && mau > 0
        ? Math.round(((premiumActive ?? 0) / mau) * 100)
        : 0,
    },
    mix: {
      monthlySharePct: totalPlans > 0
        ? Math.round((monthlyN / totalPlans) * 100)
        : 60,
      yearlySharePct: totalPlans > 0
        ? Math.round((yearlyN / totalPlans) * 100)
        : 30,
      lifetimeSharePct: totalPlans > 0
        ? Math.round((lifetimeN / totalPlans) * 100)
        : 10,
    },
    variableCosts: {
      naviCostPerPremiumCents,
      moderationCostPerMauCents,
      emailCostPerMauCents,
      voiceBandwidthCostPerPremiumCents,
    },
    raw: {
      totalsByEvent,
      windowDays: 30,
    },
  });
}
