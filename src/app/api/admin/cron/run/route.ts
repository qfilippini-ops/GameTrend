import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { runDailySnapshot, yesterdayUtc } from "@/lib/admin/daily-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/admin/cron/run
 * Body : { date?: 'YYYY-MM-DD' } (défaut J-1 UTC)
 *
 * Déclenchement manuel du snapshot quotidien depuis le dashboard admin.
 * Utile pour :
 *   - Backfiller un jour qui aurait été manqué (ex: cron en panne)
 *   - Tester l'orchestration sans attendre 03:00 UTC
 *   - Forcer un re-run après changement de tarifs en config
 *
 * Sécurité : requireAdmin (ADMIN_USER_IDS). 404 opaque sinon.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let body: { date?: string } = {};
  try {
    body = await req.json();
  } catch {
    // Body optionnel : on continue avec date = J-1
  }

  const date = body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
    ? body.date
    : yesterdayUtc();

  try {
    const result = await runDailySnapshot(date);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[cron/run] failed", detail);
    return NextResponse.json(
      { error: "snapshot_failed", detail },
      { status: 500 }
    );
  }
}
