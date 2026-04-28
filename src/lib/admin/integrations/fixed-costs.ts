/**
 * Snapshot quotidien des coûts fixes mensuels.
 *
 * Pour chaque service de FIXED_MONTHLY_COSTS_EUR, on insère/upsert dans
 * cost_snapshots la part journalière (monthly / daysInMonth).
 *
 * Avantage vs calcul à la volée côté GET :
 *   - Snapshot historique immuable (si on change le tarif fixé en config, les
 *     anciens jours conservent leur valeur d'origine)
 *   - Permet le graph 12 mois sans re-générer rétroactivement
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { FIXED_MONTHLY_COSTS_EUR } from "../pricing";

export type FixedCostsSnapshotResult = {
  ok: boolean;
  date: string;
  servicesWritten: number;
  totalCents: number;
  error?: string;
};

export async function snapshotFixedCostsForDate(
  date: string
): Promise<FixedCostsSnapshotResult> {
  const admin = createAdminClient();

  // Calcule le nombre de jours du mois auquel appartient `date` pour faire
  // le prorata correct.
  const d = new Date(`${date}T00:00:00Z`);
  const daysInMonth = new Date(
    d.getUTCFullYear(),
    d.getUTCMonth() + 1,
    0
  ).getUTCDate();

  const rows = FIXED_MONTHLY_COSTS_EUR.map((fc) => ({
    snapshot_date: date,
    service: fc.service,
    amount_cents: Math.round(fc.monthly_cents / daysInMonth),
    currency: "EUR" as const,
    source: "fixed" as const,
    metadata: {
      label: fc.label,
      monthly_cents: fc.monthly_cents,
      days_in_month: daysInMonth,
    },
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin.from("cost_snapshots") as any).upsert(rows, {
    onConflict: "snapshot_date,service",
  });

  if (error) {
    return {
      ok: false,
      date,
      servicesWritten: 0,
      totalCents: 0,
      error: error.message,
    };
  }

  return {
    ok: true,
    date,
    servicesWritten: rows.length,
    totalCents: rows.reduce((sum, r) => sum + r.amount_cents, 0),
  };
}

/**
 * Persiste un snapshot ad hoc dans cost_snapshots (utilisé pour Vercel et
 * OpenAI dont les valeurs viennent d'APIs externes).
 */
export async function upsertCostSnapshot(input: {
  date: string;
  service: string;
  amountCents: number;
  source: "api" | "manual" | "cron" | "fixed";
  metadata?: Record<string, unknown>;
  currency?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin.from("cost_snapshots") as any).upsert(
    {
      snapshot_date: input.date,
      service: input.service,
      amount_cents: input.amountCents,
      currency: input.currency ?? "EUR",
      source: input.source,
      metadata: input.metadata ?? null,
    },
    { onConflict: "snapshot_date,service" }
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
