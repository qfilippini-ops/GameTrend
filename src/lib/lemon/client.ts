/**
 * Helpers Lemon Squeezy : pas de SDK, fetch direct sur l'API REST.
 * Doc API : https://docs.lemonsqueezy.com/api
 *
 * Évite la dépendance au package @lemonsqueezy/lemonsqueezy.js qui drag plein
 * d'utilitaires inutiles côté serveur Next.js.
 */

import crypto from "crypto";

const LS_API_BASE = "https://api.lemonsqueezy.com/v1";

export const LS_PLANS = {
  monthly: process.env.LEMON_VARIANT_ID_MONTHLY,
  yearly: process.env.LEMON_VARIANT_ID_YEARLY,
  lifetime: process.env.LEMON_VARIANT_ID_LIFETIME,
} as const;

export type LemonPlan = keyof typeof LS_PLANS;

export function variantIdToPlan(variantId: string | number): LemonPlan | null {
  const id = String(variantId);
  if (id === LS_PLANS.monthly) return "monthly";
  if (id === LS_PLANS.yearly) return "yearly";
  if (id === LS_PLANS.lifetime) return "lifetime";
  return null;
}

/**
 * Vérifie la signature HMAC d'un webhook Lemon Squeezy.
 * Header attendu : x-signature
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.LEMON_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const hmac = crypto.createHmac("sha256", secret);
  const digest = Buffer.from(hmac.update(rawBody).digest("hex"), "utf8");
  const sig = Buffer.from(signature, "utf8");

  if (digest.length !== sig.length) return false;
  return crypto.timingSafeEqual(digest, sig);
}

/**
 * Crée une URL de checkout signée avec custom data (user_id) et redirect.
 * Utilise l'endpoint POST /v1/checkouts.
 */
export async function createCheckoutUrl({
  variantId,
  userId,
  email,
  redirectUrl,
}: {
  variantId: string;
  userId: string;
  email?: string | null;
  redirectUrl?: string;
}): Promise<{ url: string } | { error: string }> {
  const apiKey = process.env.LEMON_API_KEY;
  const storeId = process.env.LEMON_STORE_ID;

  if (!apiKey || !storeId) {
    return { error: "missing_config" };
  }

  const body = {
    data: {
      type: "checkouts",
      attributes: {
        checkout_data: {
          email: email ?? undefined,
          custom: {
            user_id: userId,
          },
        },
        product_options: redirectUrl
          ? { redirect_url: redirectUrl }
          : undefined,
        checkout_options: {
          embed: false,
          dark: true,
        },
      },
      relationships: {
        store: { data: { type: "stores", id: String(storeId) } },
        variant: { data: { type: "variants", id: String(variantId) } },
      },
    },
  };

  try {
    const res = await fetch(`${LS_API_BASE}/checkouts`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error("[lemon] createCheckoutUrl failed", res.status, errBody);
      return { error: `lemon_${res.status}` };
    }

    const json = await res.json();
    const url = json?.data?.attributes?.url;
    if (!url) return { error: "no_url_returned" };
    return { url };
  } catch (e) {
    console.error("[lemon] createCheckoutUrl exception", e);
    return { error: "fetch_failed" };
  }
}

/**
 * Récupère l'URL du customer portal pour un client donné.
 */
export async function getCustomerPortalUrl(customerId: string): Promise<string | null> {
  const apiKey = process.env.LEMON_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(`${LS_API_BASE}/customers/${customerId}`, {
      headers: {
        Accept: "application/vnd.api+json",
        Authorization: `Bearer ${apiKey}`,
      },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.data?.attributes?.urls?.customer_portal ?? null;
  } catch {
    return null;
  }
}
