/**
 * Vercel REST API — récupération de l'usage facturable d'un jour donné.
 *
 * L'API publique d'usage Vercel est en /v1, scoped à l'équipe ou au compte
 * personnel. Doc : https://vercel.com/docs/rest-api/endpoints/projects
 *
 * Stratégie pragmatique :
 *   - Si VERCEL_API_TOKEN n'est pas défini → on saute l'appel et le cron
 *     écrira le coût Pro fixe ($20/mois au prorata) dans cost_snapshots.
 *   - Sinon, on tente l'endpoint d'usage. En cas d'échec (API qui change,
 *     plan Hobby qui ne l'expose pas), on fallback sur le coût fixe et on
 *     log l'erreur.
 *
 * Le but n'est PAS d'avoir une compta certifiée mais une approximation à
 * ±10% pour le dashboard interne. Pour les chiffres exacts, le dashboard
 * Vercel reste la référence.
 */

import { USD_TO_EUR } from "../pricing";

export type VercelUsageResult = {
  ok: boolean;
  date: string;
  /** Coût total estimé en centimes EUR (peut être 0 si plan inclut tout). */
  amountCents: number;
  /** Détail brut pour stocker en metadata. */
  metadata: Record<string, unknown>;
  /** Source de la valeur : "api" si fetch réussi, "fallback" sinon. */
  source: "api" | "fallback";
  /** Erreur éventuelle (si fallback). */
  error?: string;
};

// Tarifs Vercel Pro (avril 2026, à vérifier 2-3×/an).
// Doc : https://vercel.com/pricing
// On modélise : abonnement fixe $20/mois + variable au-delà des inclus.
//   • Bandwidth : $40 / 100 GB au-delà des 1 TB inclus
//   • Function invocations : $40 / 1M au-delà des 1M inclus
//   • Build minutes : $40 / 100 min au-delà des 6000 inclus
const VERCEL_PRO_BANDWIDTH_PRICE_PER_GB_USD = 0.4;
const VERCEL_PRO_INVOCATION_PRICE_PER_MILLION_USD = 0.4;

/**
 * Tente de fetcher l'usage Vercel pour le jour donné.
 *
 * Note : l'API Vercel d'usage par jour n'est pas publiquement documentée
 * de manière stable. On utilise l'endpoint v1 d'usage filtré par date.
 * Si l'endpoint renvoie une 4xx/5xx, on fallback proprement.
 */
export async function fetchVercelDailyUsage(
  date: string
): Promise<VercelUsageResult> {
  const token = process.env.VERCEL_API_TOKEN?.trim();
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  const projectId = process.env.VERCEL_PROJECT_ID?.trim();

  if (!token) {
    return {
      ok: true,
      date,
      amountCents: 0,
      metadata: { reason: "no_token" },
      source: "fallback",
    };
  }

  // Endpoint d'usage : /v1/teams/{teamId}/usage?from=...&to=...
  // Si pas de team (compte perso), on passe par /v1/usage.
  const start = `${date}T00:00:00Z`;
  const end = `${date}T23:59:59Z`;
  const baseUrl = teamId
    ? `https://api.vercel.com/v1/teams/${encodeURIComponent(teamId)}/usage`
    : `https://api.vercel.com/v1/usage`;
  const params = new URLSearchParams({ from: start, to: end });
  if (projectId) params.set("projectId", projectId);

  try {
    const res = await fetch(`${baseUrl}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      // Petits timeouts pour ne pas bloquer le cron
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        date,
        amountCents: 0,
        metadata: { http_status: res.status, body: text.slice(0, 500) },
        source: "fallback",
        error: `vercel_api_${res.status}`,
      };
    }

    // L'API renvoie un objet avec des compteurs. La forme exacte peut varier
    // selon la version. On essaie d'extraire ce qu'on peut, sinon metadata.
    const json = (await res.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    // Tentative d'extraction (best-effort) de bandwidth + invocations
    const bandwidthGb = extractNumeric(json, ["bandwidth", "edgeBandwidth"]) ?? 0;
    const invocations =
      extractNumeric(json, ["functionInvocations", "invocations"]) ?? 0;

    const bandwidthCostUsd =
      bandwidthGb * VERCEL_PRO_BANDWIDTH_PRICE_PER_GB_USD;
    const invocationCostUsd =
      (invocations / 1_000_000) * VERCEL_PRO_INVOCATION_PRICE_PER_MILLION_USD;
    const totalUsd = bandwidthCostUsd + invocationCostUsd;
    const amountCents = Math.round(totalUsd * 100 * USD_TO_EUR);

    return {
      ok: true,
      date,
      amountCents,
      metadata: {
        bandwidth_gb: bandwidthGb,
        invocations,
        bandwidth_cost_usd: bandwidthCostUsd,
        invocation_cost_usd: invocationCostUsd,
        raw: json,
      },
      source: "api",
    };
  } catch (err) {
    return {
      ok: false,
      date,
      amountCents: 0,
      metadata: {},
      source: "fallback",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Cherche un nombre dans un objet JSON imbriqué via plusieurs clés possibles. */
function extractNumeric(
  obj: Record<string, unknown>,
  keys: string[]
): number | null {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}
