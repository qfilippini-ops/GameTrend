import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Client Supabase avec la clé service-role.
 *
 * À UTILISER UNIQUEMENT côté serveur (route handlers / server actions / webhooks).
 * Bypass entièrement la RLS — manipuler avec précaution.
 *
 * Cas d'usage :
 *   - Webhook Lemon Squeezy : update profiles.subscription_status pour un user
 *     que la session ne représente pas (le webhook arrive sans cookie auth).
 *   - Insertion automatique dans referral_earnings depuis ce même webhook.
 */
let adminInstance: ReturnType<typeof createSupabaseClient<Database>> | null = null;

export function createAdminClient() {
  if (adminInstance) return adminInstance;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "createAdminClient: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant."
    );
  }

  adminInstance = createSupabaseClient<Database>(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return adminInstance;
}
