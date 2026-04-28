/**
 * Reconciliation des revenus Lemon Squeezy : agrège les rows
 * `subscriptions` du jour J et upsert dans `revenue_snapshots(date,
 * 'lemon_squeezy')`.
 *
 * Cette source de vérité est la BD locale (alimentée par le webhook), pas
 * l'API Lemon. C'est plus rapide et identique à 100% (le webhook insère
 * la ligne en temps réel).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { estimateLemonFeesCents, USD_TO_EUR } from "../pricing";

export type LemonReconcileResult = {
  ok: boolean;
  date: string;
  grossCents: number;
  feesCents: number;
  transactionCount: number;
  error?: string;
};

export async function reconcileLemonForDate(
  date: string
): Promise<LemonReconcileResult> {
  const admin = createAdminClient();
  const dayStart = `${date}T00:00:00Z`;
  const dayEnd = new Date(
    new Date(`${date}T00:00:00Z`).getTime() + 24 * 60 * 60 * 1000
  ).toISOString();

  type SubRow = {
    amount_cents: number;
    currency: string;
    plan: string;
    status: string;
  };
  const { data: subs, error } = await admin
    .from("subscriptions")
    .select("amount_cents, currency, plan, status")
    .gte("created_at", dayStart)
    .lt("created_at", dayEnd)
    .returns<SubRow[]>();

  if (error) {
    return {
      ok: false,
      date,
      grossCents: 0,
      feesCents: 0,
      transactionCount: 0,
      error: error.message,
    };
  }

  let grossCents = 0;
  let feesCents = 0;
  for (const s of subs ?? []) {
    let cents = s.amount_cents;
    if (s.currency === "USD") cents = Math.round(cents * USD_TO_EUR);
    grossCents += cents;
    feesCents += estimateLemonFeesCents(cents, "EUR");
  }

  // Upsert dans revenue_snapshots (cast any : table absente du Database type
  // généré, à régénérer après application du schéma).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: upErr } = await (
    admin.from("revenue_snapshots") as any
  ).upsert(
    {
      snapshot_date: date,
      source: "lemon_squeezy",
      amount_cents: grossCents,
      fees_cents: feesCents,
      currency: "EUR",
      metadata: {
        transaction_count: subs?.length ?? 0,
        source: "cron_reconcile",
      },
    },
    { onConflict: "snapshot_date,source" }
  );

  if (upErr) {
    return {
      ok: false,
      date,
      grossCents,
      feesCents,
      transactionCount: subs?.length ?? 0,
      error: upErr.message,
    };
  }

  return {
    ok: true,
    date,
    grossCents,
    feesCents,
    transactionCount: subs?.length ?? 0,
  };
}
