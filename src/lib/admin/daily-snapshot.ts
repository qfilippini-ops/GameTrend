/**
 * Orchestration du snapshot quotidien : fetch toutes les sources et persiste
 * dans cost_snapshots / revenue_snapshots pour une date donnée (J-1 par défaut).
 *
 * Appelé par :
 *   - /api/admin/cron/daily-snapshot (Vercel Cron, 1×/jour à 03:00 UTC)
 *   - /api/admin/cron/run (déclenchement manuel admin-only)
 *
 * Toutes les sources sont indépendantes et exécutées en parallèle. Une
 * source en échec n'empêche pas les autres de réussir : chaque résultat est
 * retourné dans le summary pour debug.
 */

import { fetchVercelDailyUsage } from "./integrations/vercel";
import { fetchOpenAIDailyUsage } from "./integrations/openai";
import { reconcileLemonForDate } from "./integrations/lemon";
import {
  snapshotFixedCostsForDate,
  upsertCostSnapshot,
} from "./integrations/fixed-costs";

export type DailySnapshotResult = {
  date: string;
  vercel: Awaited<ReturnType<typeof fetchVercelDailyUsage>> & {
    persisted: boolean;
  };
  openai: Awaited<ReturnType<typeof fetchOpenAIDailyUsage>> & {
    persisted: boolean;
  };
  lemon: Awaited<ReturnType<typeof reconcileLemonForDate>>;
  fixed: Awaited<ReturnType<typeof snapshotFixedCostsForDate>>;
  durationMs: number;
};

/** Calcule la date J-1 en UTC au format YYYY-MM-DD. */
export function yesterdayUtc(): string {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

/**
 * Lance le snapshot quotidien pour une date donnée (YYYY-MM-DD UTC).
 * Si date est omis → J-1.
 */
export async function runDailySnapshot(
  date: string = yesterdayUtc()
): Promise<DailySnapshotResult> {
  const start = Date.now();

  // Toutes les sources en parallèle
  const [vercelRes, openaiRes, lemonRes, fixedRes] = await Promise.all([
    fetchVercelDailyUsage(date),
    fetchOpenAIDailyUsage(date),
    reconcileLemonForDate(date),
    snapshotFixedCostsForDate(date),
  ]);

  // Persistance des résultats Vercel et OpenAI dans cost_snapshots si OK
  let vercelPersisted = false;
  if (vercelRes.ok && vercelRes.source === "api") {
    const r = await upsertCostSnapshot({
      date,
      service: "vercel",
      amountCents: vercelRes.amountCents,
      source: "api",
      metadata: vercelRes.metadata,
    });
    vercelPersisted = r.ok;
  }

  let openaiPersisted = false;
  if (openaiRes.ok && (openaiRes.source === "api" || openaiRes.source === "admin_api")) {
    const r = await upsertCostSnapshot({
      date,
      service: "openai",
      amountCents: openaiRes.amountCents,
      source: "api",
      metadata: {
        prompt_tokens: openaiRes.promptTokens,
        completion_tokens: openaiRes.completionTokens,
        ...openaiRes.metadata,
      },
    });
    openaiPersisted = r.ok;
  }

  return {
    date,
    vercel: { ...vercelRes, persisted: vercelPersisted },
    openai: { ...openaiRes, persisted: openaiPersisted },
    lemon: lemonRes,
    fixed: fixedRes,
    durationMs: Date.now() - start,
  };
}
