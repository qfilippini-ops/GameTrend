import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeOpenAINaviCostMicros,
  LIVEKIT_COST_MICROS_PER_TOKEN_MINT,
  RESEND_COST_MICROS_PER_EMAIL,
  SIGHTENGINE_COST_MICROS_PER_CHECK,
} from "./pricing";

/**
 * Helper d'écriture dans `usage_log`.
 *
 * Volontairement "fire and forget" : on n'attend PAS la fin de l'insert pour
 * ne pas ralentir les routes critiques (chaque appel ajoute typiquement
 * 30-80ms de latence Supabase). Erreur silencieuse → on log en console
 * uniquement, le métier n'est pas bloquant.
 *
 * On utilise le service_role pour bypasser la RLS (les tables admin sont
 * fermées aux rôles authenticated/anon).
 */
type LogUsageInput = {
  eventType:
    | "openai_navi"
    | "sightengine_check"
    | "resend_email"
    | "livekit_token_mint";
  userId?: string | null;
  units?: number;
  unitCostMicros?: number;
  estimatedCostMicros?: number;
  currency?: "USD" | "EUR";
  metadata?: Record<string, unknown>;
};

function fireLog(input: LogUsageInput) {
  // Pas d'await pour ne pas bloquer le caller. On loggue les erreurs en cas
  // de souci (pour le monitoring Vercel logs).
  void (async () => {
    try {
      const supabase = createAdminClient();
      // Cast en any : la table `usage_log` (créée par schema_admin_v1.sql)
      // n'est pas encore dans le type Database généré. À regénérer via
      // `supabase gen types typescript` après application du schéma.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("usage_log") as any).insert({
        event_type: input.eventType,
        user_id: input.userId ?? null,
        units: input.units ?? 1,
        unit_cost_micros: input.unitCostMicros ?? 0,
        estimated_cost_micros: input.estimatedCostMicros ?? 0,
        currency: input.currency ?? "USD",
        metadata: input.metadata ?? null,
      });
      if (error) {
        console.error("[usage-log] insert failed", input.eventType, error);
      }
    } catch (err) {
      console.error("[usage-log] unexpected error", input.eventType, err);
    }
  })();
}

// ─── Wrappers spécialisés par service ───────────────────────────────────────

export function logOpenAINaviUsage(opts: {
  userId?: string | null;
  promptTokens: number;
  completionTokens: number;
  model: string;
  metadata?: Record<string, unknown>;
}) {
  const totalTokens = opts.promptTokens + opts.completionTokens;
  const estimated = computeOpenAINaviCostMicros(
    opts.promptTokens,
    opts.completionTokens
  );
  fireLog({
    eventType: "openai_navi",
    userId: opts.userId,
    units: totalTokens,
    unitCostMicros: 0, // mixte input/output, voir metadata pour le détail
    estimatedCostMicros: estimated,
    currency: "USD",
    metadata: {
      model: opts.model,
      prompt_tokens: opts.promptTokens,
      completion_tokens: opts.completionTokens,
      ...(opts.metadata ?? {}),
    },
  });
}

export function logSightengineUsage(opts: {
  userId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  fireLog({
    eventType: "sightengine_check",
    userId: opts.userId,
    units: 1,
    unitCostMicros: SIGHTENGINE_COST_MICROS_PER_CHECK,
    estimatedCostMicros: SIGHTENGINE_COST_MICROS_PER_CHECK,
    currency: "USD",
    metadata: opts.metadata,
  });
}

export function logResendEmailUsage(opts: {
  userId?: string | null;
  emailType?: string;
  metadata?: Record<string, unknown>;
}) {
  fireLog({
    eventType: "resend_email",
    userId: opts.userId,
    units: 1,
    unitCostMicros: RESEND_COST_MICROS_PER_EMAIL,
    estimatedCostMicros: RESEND_COST_MICROS_PER_EMAIL,
    currency: "USD",
    metadata: { email_type: opts.emailType, ...(opts.metadata ?? {}) },
  });
}

export function logLiveKitTokenMint(opts: {
  userId?: string | null;
  groupId: string;
  isHost: boolean;
}) {
  fireLog({
    eventType: "livekit_token_mint",
    userId: opts.userId,
    units: 1,
    unitCostMicros: LIVEKIT_COST_MICROS_PER_TOKEN_MINT,
    estimatedCostMicros: LIVEKIT_COST_MICROS_PER_TOKEN_MINT,
    currency: "EUR",
    metadata: { group_id: opts.groupId, is_host: opts.isHost },
  });
}
