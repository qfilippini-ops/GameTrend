import { createClient } from "@/lib/supabase/server";

/**
 * Liste des UUIDs autorisés à accéder au dashboard admin.
 * Lue depuis ADMIN_USER_IDS (CSV). Trim + filter pour tolérer les espaces et
 * les valeurs vides.
 */
function getAdminUserIds(): Set<string> {
  const raw = process.env.ADMIN_USER_IDS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  );
}

export type AdminAuthResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "unauthenticated" | "forbidden" | "no_admins_configured" };

/**
 * À appeler en haut de toute route/page admin server-side.
 *
 * Retourne :
 *   - ok=true + userId si l'utilisateur courant a son UUID dans ADMIN_USER_IDS
 *   - ok=false sinon, avec une raison parlante (à mapper en 401/403/notFound)
 *
 * Sécurité :
 *   - Renvoie "no_admins_configured" si ADMIN_USER_IDS est vide → permet de
 *     savoir d'où vient le 403 sans leak côté client (toujours mapper en
 *     `notFound()` pour ne pas révéler que la route existe).
 */
export async function requireAdmin(): Promise<AdminAuthResult> {
  const allowed = getAdminUserIds();
  if (allowed.size === 0) {
    return { ok: false, reason: "no_admins_configured" };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) {
    return { ok: false, reason: "unauthenticated" };
  }

  if (!allowed.has(user.id)) {
    return { ok: false, reason: "forbidden" };
  }

  return { ok: true, userId: user.id };
}
