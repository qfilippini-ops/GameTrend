/**
 * OpenAI Usage API — récupération des tokens consommés sur un jour donné.
 *
 * Doc : https://platform.openai.com/docs/api-reference/usage
 *
 * Stratégie :
 *   - L'endpoint legacy `/v1/usage?date=YYYY-MM-DD` accepte une regular API
 *     key (sk-proj-... ou sk-...) ; c'est ce qu'on utilise ici, en réutilisant
 *     OPENAI_API_KEY.
 *   - Les nouveaux endpoints `/v1/organization/usage/completions` exigent une
 *     **admin key** distincte (sk-admin-...) qui n'est PAS la même que la clé
 *     d'inférence. Si tu veux ce niveau de détail, set OPENAI_ADMIN_KEY.
 *   - Si l'API renvoie une erreur, on fallback sur l'agrégat de `usage_log`
 *     (déjà enregistré côté GameTrend lors de chaque appel Navi).
 */

import { USD_TO_EUR } from "../pricing";

export type OpenAIUsageResult = {
  ok: boolean;
  date: string;
  amountCents: number;
  promptTokens: number;
  completionTokens: number;
  metadata: Record<string, unknown>;
  source: "api" | "fallback" | "admin_api";
  error?: string;
};

/**
 * Tente d'utiliser l'admin key d'organisation si disponible (plus fiable),
 * sinon retombe sur l'API legacy avec la clé d'inférence.
 */
export async function fetchOpenAIDailyUsage(
  date: string
): Promise<OpenAIUsageResult> {
  const adminKey = process.env.OPENAI_ADMIN_KEY?.trim();
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (adminKey) {
    const result = await fetchViaAdminKey(date, adminKey);
    if (result.ok) return result;
    // Si l'admin key foire, on tente le legacy en fallback
  }

  if (apiKey) {
    return fetchViaLegacy(date, apiKey);
  }

  return {
    ok: false,
    date,
    amountCents: 0,
    promptTokens: 0,
    completionTokens: 0,
    metadata: { reason: "no_key" },
    source: "fallback",
    error: "openai_not_configured",
  };
}

// ─── Endpoint legacy (1 appel = usage agrégé du jour entier) ───────────────
async function fetchViaLegacy(
  date: string,
  apiKey: string
): Promise<OpenAIUsageResult> {
  try {
    const res = await fetch(
      `https://api.openai.com/v1/usage?date=${encodeURIComponent(date)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        date,
        amountCents: 0,
        promptTokens: 0,
        completionTokens: 0,
        metadata: { http_status: res.status, body: body.slice(0, 500) },
        source: "fallback",
        error: `openai_legacy_${res.status}`,
      };
    }

    type LegacyData = {
      data?: Array<{
        n_context_tokens_total?: number;
        n_generated_tokens_total?: number;
        snapshot_id?: string;
      }>;
    };
    const json = (await res.json().catch(() => ({}))) as LegacyData;

    let prompt = 0;
    let completion = 0;
    for (const row of json.data ?? []) {
      prompt += row.n_context_tokens_total ?? 0;
      completion += row.n_generated_tokens_total ?? 0;
    }

    // L'endpoint legacy ne renvoie pas le coût direct ; on le recalcule
    // d'après les tarifs gpt-5-nano (notre modèle principal).
    // Cf. pricing.ts. C'est une approximation : si un jour tu utilises
    // d'autres modèles, le chiffre exact diverge. Acceptable pour un
    // dashboard interne.
    const usdCost =
      (prompt * 0.05 + completion * 0.4) / 1_000_000;
    const amountCents = Math.round(usdCost * 100 * USD_TO_EUR);

    return {
      ok: true,
      date,
      amountCents,
      promptTokens: prompt,
      completionTokens: completion,
      metadata: {
        rows: json.data?.length ?? 0,
        usd_cost_estimated: usdCost,
      },
      source: "api",
    };
  } catch (err) {
    return {
      ok: false,
      date,
      amountCents: 0,
      promptTokens: 0,
      completionTokens: 0,
      metadata: {},
      source: "fallback",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ─── Endpoint admin (granularité par modèle, coût exact) ────────────────────
async function fetchViaAdminKey(
  date: string,
  adminKey: string
): Promise<OpenAIUsageResult> {
  // Doc : https://platform.openai.com/docs/api-reference/usage/completions
  // Endpoint : GET /v1/organization/usage/completions?start_time=...&end_time=...
  const start = Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);
  const end = Math.floor(new Date(`${date}T23:59:59Z`).getTime() / 1000);

  try {
    const res = await fetch(
      `https://api.openai.com/v1/organization/usage/completions?start_time=${start}&end_time=${end}&bucket_width=1d`,
      {
        headers: { Authorization: `Bearer ${adminKey}` },
        signal: AbortSignal.timeout(15_000),
      }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        date,
        amountCents: 0,
        promptTokens: 0,
        completionTokens: 0,
        metadata: { http_status: res.status, body: body.slice(0, 500) },
        source: "fallback",
        error: `openai_admin_${res.status}`,
      };
    }

    type AdminData = {
      data?: Array<{
        results?: Array<{
          input_tokens?: number;
          output_tokens?: number;
        }>;
      }>;
    };
    const json = (await res.json().catch(() => ({}))) as AdminData;

    let prompt = 0;
    let completion = 0;
    for (const bucket of json.data ?? []) {
      for (const row of bucket.results ?? []) {
        prompt += row.input_tokens ?? 0;
        completion += row.output_tokens ?? 0;
      }
    }

    const usdCost =
      (prompt * 0.05 + completion * 0.4) / 1_000_000;
    const amountCents = Math.round(usdCost * 100 * USD_TO_EUR);

    return {
      ok: true,
      date,
      amountCents,
      promptTokens: prompt,
      completionTokens: completion,
      metadata: { admin_api: true, usd_cost_estimated: usdCost },
      source: "admin_api",
    };
  } catch (err) {
    return {
      ok: false,
      date,
      amountCents: 0,
      promptTokens: 0,
      completionTokens: 0,
      metadata: {},
      source: "fallback",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
