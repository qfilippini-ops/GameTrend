/**
 * Helper PostHog côté serveur (capture d'events depuis le webhook).
 * Utilise l'API REST publique : pas besoin d'identifier_only ici.
 */

export type ServerEvent =
  | "subscription_started"
  | "subscription_renewed"
  | "subscription_cancelled"
  | "subscription_expired"
  | "payment_failed"
  | "payment_refunded"
  | "lifetime_purchased";

export async function captureServerEvent(
  userId: string,
  event: ServerEvent,
  props?: Record<string, unknown>
): Promise<void> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";

  if (!key) return;

  try {
    await fetch(`${host}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        event,
        distinct_id: userId,
        properties: {
          $lib: "gametrend-server",
          ...props,
        },
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.warn("[posthog-server] capture failed", e);
  }
}
