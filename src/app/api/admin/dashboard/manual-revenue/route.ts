import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/dashboard/manual-revenue
 * Body : { source: 'adsense' | 'sponsoring' | 'autre',
 *          snapshot_date: 'YYYY-MM-DD',
 *          amount_cents: number,
 *          currency?: 'EUR' | 'USD',
 *          fees_cents?: number,
 *          metadata?: Record<string, unknown> }
 *
 * Saisie manuelle d'un revenu (typiquement AdSense, dont l'API OAuth est
 * lourde et la latence 24-48h). Upsert sur (snapshot_date, source).
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let body: {
    source?: string;
    snapshot_date?: string;
    amount_cents?: number;
    currency?: string;
    fees_cents?: number;
    metadata?: Record<string, unknown>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const source = body.source;
  const snapshotDate = body.snapshot_date;
  const amountCents = body.amount_cents;
  const currency = body.currency ?? "EUR";
  const feesCents = body.fees_cents ?? 0;

  if (
    !source ||
    !["adsense", "sponsoring", "autre"].includes(source) ||
    !snapshotDate ||
    !/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate) ||
    typeof amountCents !== "number" ||
    amountCents < 0
  ) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const admin = createAdminClient();
  // Cast en any : `revenue_snapshots` (créée par schema_admin_v1.sql) n'est
  // pas encore dans le type Database généré. À regénérer après migration.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (admin.from("revenue_snapshots") as any).upsert(
    {
      snapshot_date: snapshotDate,
      source,
      amount_cents: amountCents,
      currency,
      fees_cents: feesCents,
      metadata: {
        entered_by: auth.userId,
        entered_at: new Date().toISOString(),
        ...(body.metadata ?? {}),
      },
    },
    { onConflict: "snapshot_date,source" }
  );

  if (error) {
    console.error("[admin/manual-revenue] upsert failed", error);
    return NextResponse.json(
      { error: "upsert_failed", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
