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
  error?: { message?: string };
}

export interface CallLLMOptions {
  model?: string;
  messages: ChatMessage[];
  /** Tokens max à générer. Défaut 600 (suffisant pour un verdict court). */
  maxTokens?: number;
  /** Timeout réseau en ms. Défaut 25 s. */
  timeoutMs?: number;
}

export type CallLLMResult =
  | { ok: true; text: string; model: string }
  | { ok: false; error: string };

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
  const maxTokens = opts.maxTokens ?? 600;
  const timeoutMs = opts.timeoutMs ?? 25_000;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: opts.messages,
        max_completion_tokens: maxTokens,
      }),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => null)) as
        | ChatCompletionResponse
        | null;
      const msg = errBody?.error?.message ?? `http_${res.status}`;
      return { ok: false, error: msg };
    }

    const json = (await res.json()) as ChatCompletionResponse;
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) {
      return { ok: false, error: "empty_response" };
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
