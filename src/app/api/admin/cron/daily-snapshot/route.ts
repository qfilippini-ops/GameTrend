import { NextResponse } from "next/server";
import { runDailySnapshot, yesterdayUtc } from "@/lib/admin/daily-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel Cron a une limite de 60s sur Hobby, 5min sur Pro. Notre job est
// largement < 30s en pratique.
export const maxDuration = 60;

/**
 * GET /api/admin/cron/daily-snapshot
 *
 * Endpoint déclenché par Vercel Cron tous les jours à 03:00 UTC (cf.
 * vercel.json). Snapshot J-1.
 *
 * Sécurité :
 *   - Vercel Cron envoie automatiquement le header
 *     `Authorization: Bearer ${CRON_SECRET}` si la variable est définie.
 *   - On accepte aussi un appel sans header SI on est en preview/dev local
 *     (NEXT_PUBLIC_VERCEL_ENV !== "production"), pour faciliter les tests.
 *   - En prod sans CRON_SECRET → on refuse (sinon n'importe qui pourrait
 *     déclencher le snapshot).
 *
 * Doc : https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs
 */
export async function GET(req: Request) {
  const isProduction = process.env.NEXT_PUBLIC_VERCEL_ENV === "production";
  const secret = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get("authorization");

  if (isProduction) {
    if (!secret) {
      return NextResponse.json(
        { error: "CRON_SECRET not configured" },
        { status: 500 }
      );
    }
    if (auth !== `Bearer ${secret}`) {
      // Réponse opaque (404) pour ne pas leaker l'existence de la route.
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
  } else if (secret && auth !== `Bearer ${secret}`) {
    // En preview/dev, si CRON_SECRET est set, on l'exige aussi pour cohérence.
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const result = await runDailySnapshot(yesterdayUtc());
    console.log(
      "[cron/daily-snapshot] OK",
      JSON.stringify({
        date: result.date,
        durationMs: result.durationMs,
        vercel_ok: result.vercel.ok,
        vercel_source: result.vercel.source,
        openai_ok: result.openai.ok,
        openai_source: result.openai.source,
        lemon_count: result.lemon.transactionCount,
        fixed_services: result.fixed.servicesWritten,
      })
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[cron/daily-snapshot] failed", detail);
    return NextResponse.json(
      { error: "snapshot_failed", detail },
      { status: 500 }
    );
  }
}
