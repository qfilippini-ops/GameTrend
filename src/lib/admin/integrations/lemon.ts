/**
 * Reconciliation des revenus Lemon Squeezy : agrège les rows
 * `subscription_payments` du jour J (1 row = 1 paiement effectif) et upsert
 * dans `revenue_snapshots(date, 'lemon_squeezy')`.
 *
 * Source de vérité : la BD locale (alimentée par le webhook), pas l'API
 * Lemon. C'est plus rapide et 100% fidèle (webhook insère en temps réel).
 *
 * On utilise `subscription_payments` (pas `subscriptions`) pour ne pas
 * manquer les renouvellements et ne pas compter les checkouts annulés à 0€.
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

  type PaymentRow = {
    amount_cents: number;
    currency: string;
    plan: string;
  };
  // Cast any : table absente du Database type généré.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: paymentsRaw, error } = await (admin as any)
    .from("subscription_payments")
    .select("amount_cents, currency, plan")
    .gte("paid_at", dayStart)
    .lt("paid_at", dayEnd);
  const payments = (paymentsRaw as PaymentRow[] | null) ?? [];

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
  const rows = payments;
  for (const p of rows) {
    let cents = p.amount_cents;
    if (p.currency === "USD") cents = Math.round(cents * USD_TO_EUR);
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
        transaction_count: rows.length,
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
      transactionCount: rows.length,
      error: upErr.message,
    };
  }

  return {
    ok: true,
    date,
    grossCents,
    feesCents,
    transactionCount: rows.length,
  };
}
