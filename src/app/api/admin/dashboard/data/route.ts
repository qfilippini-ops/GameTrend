import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  estimateLemonFeesCents,
  fixedMonthlyTotalEurCents,
  FIXED_MONTHLY_COSTS_EUR,
  microsToCents,
  USD_TO_EUR,
} from "@/lib/admin/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/dashboard/data
 *
 * Retourne un snapshot temps-réel pour le dashboard admin :
 *   - KPI principaux (MRR, ARR, MAU, ventes mois, marge mois, runway)
 *   - Breakdown coûts (mensuels fixes + variables depuis usage_log)
 *   - Breakdown revenus (Lemon depuis subscriptions + AdSense saisis manuels)
 *   - Compteurs d'usage du mois courant (calls IA, modérations, emails, vocaux)
 *
 * Sécurité : `requireAdmin()` check ADMIN_USER_IDS. Réponse `notFound`
 * équivalente à 404 si non-autorisé pour ne pas révéler que la route existe.
 */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    // Réponse opaque (404 plutôt que 403 pour ne pas leaker l'existence).
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const admin = createAdminClient();

  // Période : mois courant (du 1er au dernier jour)
  const now = new Date();
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  );
  const nextMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
  );
  const dayOfMonth = now.getUTCDate();
  const daysInMonth = new Date(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    0
  ).getUTCDate();

  // ─── 1. Users + MAU ───────────────────────────────────────────────────────
  // last_seen_at est mis à jour par le heartbeat → MAU = users vus dans
  // les 30 derniers jours.
  const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [{ count: totalUsers }, { count: mau }, { count: premiumActive }] =
    await Promise.all([
      admin.from("profiles").select("*", { count: "exact", head: true }),
      admin
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .gte("last_seen_at", last30.toISOString()),
      admin
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .in("subscription_status", ["trialing", "active", "lifetime"]),
    ]);

  // ─── 2. MRR / ARR depuis profiles + variantes Lemon ──────────────────────
  // On reconstruit le MRR depuis la table `profiles` (état courant) plutôt
  // que `subscriptions` (historique) : un user qui annule ne contribue plus.
  // Tarifs FR HT (ces valeurs doivent matcher tes variantes Lemon).
  const PLAN_MONTHLY_EUR_CENTS = 699; // 6,99 €/mois
  const PLAN_YEARLY_EUR_CENTS = 4900; // 49 €/an → 4900/12 ≈ 408 €/mois MRR
  const PLAN_LIFETIME_EUR_CENTS = 9900; // 99 € unique (pas de MRR récurrent)

  type ActiveSubRow = { subscription_plan: string | null };
  const { data: activeSubs } = await admin
    .from("profiles")
    .select("subscription_plan")
    .in("subscription_status", ["trialing", "active"])
    .returns<ActiveSubRow[]>();

  let mrrCents = 0;
  let yearlyCount = 0;
  let monthlyCount = 0;
  for (const s of activeSubs ?? []) {
    if (s.subscription_plan === "monthly") {
      mrrCents += PLAN_MONTHLY_EUR_CENTS;
      monthlyCount++;
    } else if (s.subscription_plan === "yearly") {
      mrrCents += Math.round(PLAN_YEARLY_EUR_CENTS / 12);
      yearlyCount++;
    }
  }
  const arrCents = mrrCents * 12;

  // ─── 3. Revenus mois courant depuis subscriptions ────────────────────────
  // Toutes les transactions Lemon enregistrées via le webhook ce mois.
  type SubRow = {
    plan: string;
    amount_cents: number;
    currency: string;
    status: string;
    created_at: string;
  };
  const { data: monthSubs } = await admin
    .from("subscriptions")
    .select("plan, amount_cents, currency, status, created_at")
    .gte("created_at", monthStart.toISOString())
    .lt("created_at", nextMonthStart.toISOString())
    .returns<SubRow[]>();

  let lemonGrossCents = 0;
  let lemonFeesCents = 0;
  const revenueByPlan: Record<string, number> = {};
  for (const s of monthSubs ?? []) {
    // Lemon stocke le montant brut du paiement. On convertit en EUR si USD
    // (Lemon facture en USD, on utilise le taux du pricing.ts).
    let cents = s.amount_cents;
    if (s.currency === "USD") cents = Math.round(cents * USD_TO_EUR);
    lemonGrossCents += cents;
    lemonFeesCents += estimateLemonFeesCents(cents, "EUR");
    revenueByPlan[s.plan] = (revenueByPlan[s.plan] ?? 0) + cents;
  }

  // ─── 4. Revenus AdSense / autres depuis revenue_snapshots ────────────────
  const { data: extraRevenue } = await admin
    .from("revenue_snapshots")
    .select("source, amount_cents")
    .gte("snapshot_date", monthStart.toISOString().slice(0, 10))
    .lt("snapshot_date", nextMonthStart.toISOString().slice(0, 10))
    .neq("source", "lemon_squeezy")
    .returns<{ source: string; amount_cents: number }[]>();
  const extraRevenueCents = (extraRevenue ?? []).reduce(
    (sum, r) => sum + r.amount_cents,
    0
  );
  const extraRevenueBySource: Record<string, number> = {};
  for (const r of extraRevenue ?? []) {
    extraRevenueBySource[r.source] =
      (extraRevenueBySource[r.source] ?? 0) + r.amount_cents;
  }

  // ─── 5. Coûts mois courant ───────────────────────────────────────────────
  // Coûts fixes au prorata jour : on assume que le mois est terminé pour le
  // total mensuel, et on prorate au jour pour le "consommé jusqu'à ici".
  const fixedMonthlyTotal = fixedMonthlyTotalEurCents();
  const fixedConsumedToDate = Math.round(
    fixedMonthlyTotal * (dayOfMonth / daysInMonth)
  );

  // Coûts variables = somme des estimated_cost_micros de usage_log ce mois,
  // groupés par event_type.
  const { data: usageRows } = await admin
    .from("usage_log")
    .select("event_type, units, estimated_cost_micros, currency")
    .gte("created_at", monthStart.toISOString())
    .lt("created_at", nextMonthStart.toISOString())
    .returns<
      {
        event_type: string;
        units: number;
        estimated_cost_micros: number;
        currency: string;
      }[]
    >();

  type UsageAggregate = {
    event_type: string;
    units: number;
    cost_eur_cents: number;
    call_count: number;
  };
  const usageAgg = new Map<string, UsageAggregate>();
  for (const u of usageRows ?? []) {
    const cur = (u.currency === "EUR" ? "EUR" : "USD") as "EUR" | "USD";
    const eurCents = microsToCents(u.estimated_cost_micros, cur);
    const existing = usageAgg.get(u.event_type) ?? {
      event_type: u.event_type,
      units: 0,
      cost_eur_cents: 0,
      call_count: 0,
    };
    existing.units += Number(u.units ?? 0);
    existing.cost_eur_cents += eurCents;
    existing.call_count += 1;
    usageAgg.set(u.event_type, existing);
  }
  const usageByEvent = Array.from(usageAgg.values());
  const variableCostCents = usageByEvent.reduce(
    (sum, u) => sum + u.cost_eur_cents,
    0
  );

  // ─── 6. Coûts mensuels effectifs (variables + saisis dans cost_snapshots) ─
  // On lit aussi cost_snapshots du mois (rempli par cron/manuel) pour récup
  // les coûts fixes "officiels" (Vercel API par ex.) vs estimations.
  const { data: snapshotCosts } = await admin
    .from("cost_snapshots")
    .select("service, amount_cents")
    .gte("snapshot_date", monthStart.toISOString().slice(0, 10))
    .lt("snapshot_date", nextMonthStart.toISOString().slice(0, 10))
    .returns<{ service: string; amount_cents: number }[]>();
  const snapshotCostBySvc: Record<string, number> = {};
  for (const c of snapshotCosts ?? []) {
    snapshotCostBySvc[c.service] =
      (snapshotCostBySvc[c.service] ?? 0) + c.amount_cents;
  }
  const snapshotCostTotal = (snapshotCosts ?? []).reduce(
    (sum, c) => sum + c.amount_cents,
    0
  );

  // ─── 7. Calculs synthèse ─────────────────────────────────────────────────
  const totalRevenueCents = lemonGrossCents + extraRevenueCents;
  const totalNetRevenueCents = totalRevenueCents - lemonFeesCents;
  // Total coût = fixes au prorata + variables consommés + snapshots du cron
  const totalCostCents =
    fixedConsumedToDate + variableCostCents + snapshotCostTotal;
  const grossMarginCents = totalNetRevenueCents - totalCostCents;
  const grossMarginPct =
    totalNetRevenueCents > 0
      ? (grossMarginCents / totalNetRevenueCents) * 100
      : 0;

  // Cost per MAU sur le mois (variable cost only, pas les fixes amortis)
  const costPerMauCents = mau && mau > 0 ? Math.round(variableCostCents / mau) : 0;

  // Runway approximatif : on n'a pas le cash dispo en BD, on retourne null
  // (à saisir manuellement ou plus tard).
  const runwayMonths: number | null = null;

  return NextResponse.json({
    period: {
      month_start: monthStart.toISOString(),
      next_month_start: nextMonthStart.toISOString(),
      day_of_month: dayOfMonth,
      days_in_month: daysInMonth,
    },
    users: {
      total: totalUsers ?? 0,
      mau: mau ?? 0,
      premium_active: premiumActive ?? 0,
      monthly_subs: monthlyCount,
      yearly_subs: yearlyCount,
    },
    revenue: {
      mrr_eur_cents: mrrCents,
      arr_eur_cents: arrCents,
      gross_month_eur_cents: totalRevenueCents,
      net_month_eur_cents: totalNetRevenueCents,
      lemon_gross_eur_cents: lemonGrossCents,
      lemon_fees_eur_cents: lemonFeesCents,
      extra_eur_cents: extraRevenueCents,
      by_plan_eur_cents: revenueByPlan,
      extra_by_source_eur_cents: extraRevenueBySource,
      transaction_count: monthSubs?.length ?? 0,
    },
    costs: {
      fixed_monthly_total_eur_cents: fixedMonthlyTotal,
      fixed_consumed_to_date_eur_cents: fixedConsumedToDate,
      variable_eur_cents: variableCostCents,
      snapshot_eur_cents: snapshotCostTotal,
      total_to_date_eur_cents: totalCostCents,
      fixed_breakdown: FIXED_MONTHLY_COSTS_EUR,
      snapshot_by_service_eur_cents: snapshotCostBySvc,
    },
    usage: {
      // Compteurs du mois (calls + units + coût agrégé EUR)
      by_event: usageByEvent,
      lifetime_constants: {
        plan_monthly_eur_cents: PLAN_MONTHLY_EUR_CENTS,
        plan_yearly_eur_cents: PLAN_YEARLY_EUR_CENTS,
        plan_lifetime_eur_cents: PLAN_LIFETIME_EUR_CENTS,
      },
    },
    summary: {
      gross_margin_eur_cents: grossMarginCents,
      gross_margin_pct: Number(grossMarginPct.toFixed(1)),
      cost_per_mau_eur_cents: costPerMauCents,
      runway_months: runwayMonths,
    },
  });
}
