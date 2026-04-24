/**
 * Wrapper minimal autour de l'API OpenAI Chat Completions.
 *
 * Volontairement sans dépendance npm : un simple fetch suffit. À utiliser
 * uniquement côté serveur (Route Handlers / Server Actions), jamais côté
 * client (la clé est secrète).
 *
 * Modèle par défaut : gpt-5-nano (configurable via NAVI_MODEL).
 */

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string | null };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  };
  error?: { message?: string; code?: string; type?: string };
}

export interface CallLLMOptions {
  model?: string;
  messages: ChatMessage[];
  /**
   * Budget total de tokens en sortie. Pour les modèles de reasoning
   * (gpt-5-*, o1-*) ce budget est partagé entre les tokens de réflexion
   * INVISIBLES et le texte final. Mettre large (≥ 1500) pour éviter
   * d'épuiser le budget en reasoning et finir avec un message vide.
   */
  maxTokens?: number;
  /**
   * Effort de raisonnement. Valeurs supportées varient selon le modèle :
   *   - gpt-5-* : minimal | low | medium | high
   *   - gpt-5.4-* (et plus récents) : none | low | medium | high | xhigh
   * Default = "low" : valide partout, et donne une qualité bien
   * supérieure à "minimal"/"none" pour un coût modéré en reasoning tokens.
   * Ignoré silencieusement par les modèles non-reasoning.
   */
  reasoningEffort?:
    | "none"
    | "minimal"
    | "low"
    | "medium"
    | "high"
    | "xhigh";
  /** Timeout réseau en ms. Défaut 25 s. */
  timeoutMs?: number;
}

export type CallLLMResult =
  | { ok: true; text: string; model: string }
  | { ok: false; error: string };

function isReasoningModel(model: string): boolean {
  // Familles connues de modèles de reasoning : gpt-5-*, o1-*, o3-*
  return /^(gpt-5|o1|o3)/i.test(model);
}

/**
 * Appelle un modèle OpenAI compatible Chat Completions et retourne le
 * contenu textuel de la première réponse.
 */
export async function callLLM(opts: CallLLMOptions): Promise<CallLLMResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, error: "openai_not_configured" };
  }

  const model = opts.model ?? process.env.NAVI_MODEL?.trim() ?? "gpt-5-nano";
  const reasoning = isReasoningModel(model);
  // Pour les reasoning models, il faut du marge : reasoning peut prendre
  // des centaines de tokens avant que le texte final apparaisse.
  const maxTokens = opts.maxTokens ?? (reasoning ? 2000 : 600);
  const timeoutMs = opts.timeoutMs ?? 25_000;

  const body: Record<string, unknown> = {
    model,
    messages: opts.messages,
    max_completion_tokens: maxTokens,
  };
  if (reasoning) {
    // "low" est valide sur tous les modèles reasoning (gpt-5, gpt-5.4, o1, o3).
    // Évite l'erreur unsupported_value sur gpt-5.4-* qui ne connaît plus "minimal".
    body.reasoning_effort = opts.reasoningEffort ?? "low";
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });

    const json = (await res.json().catch(() => null)) as
      | ChatCompletionResponse
      | null;

    if (!res.ok) {
      const msg = json?.error?.message ?? `http_${res.status}`;
      const code = json?.error?.code ?? "unknown";
      console.error("[callLLM] openai_error", res.status, code, msg);
      return { ok: false, error: `${code}: ${msg}` };
    }

    const choice = json?.choices?.[0];
    const text = choice?.message?.content?.trim();
    if (!text) {
      const finish = choice?.finish_reason ?? "unknown";
      const reasoningTokens =
        json?.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
      const completion = json?.usage?.completion_tokens ?? 0;
      console.error(
        "[callLLM] empty_response finish=%s completion=%d reasoning=%d",
        finish,
        completion,
        reasoningTokens
      );
      return {
        ok: false,
        error: `empty_response (finish=${finish}, reasoning_tokens=${reasoningTokens})`,
      };
    }
    return { ok: true, text, model };
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      return { ok: false, error: "timeout" };
    }
    return { ok: false, error: String((e as Error).message ?? e) };
  } finally {
    clearTimeout(timer);
  }
}
