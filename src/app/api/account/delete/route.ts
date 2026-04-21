import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cancelSubscription } from "@/lib/lemon/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Suppression complète d'un compte utilisateur.
 *
 * Étapes :
 *   1. Auth check (l'user doit être connecté).
 *   2. Si abonnement Lemon Squeezy actif (non lifetime) → DELETE LS API.
 *      L'accès Premium est immédiatement révoqué côté GameTrend, mais LS
 *      laisse le client utiliser son abo jusqu'à la fin de la période en
 *      cours côté facturation. Pas de remboursement automatique.
 *   3. Nettoyage storage : avatars, profile-banners, covers.
 *   4. Suppression de auth.users via service-role → CASCADE supprime
 *      profiles + toutes les tables liées (presets, follows, referrals,
 *      pinned_presets, subscriptions, etc.).
 *
 * Réponse :
 *   200 { ok: true, lemon_cancelled: boolean }
 *   401 { error: "unauthenticated" }
 *   500 { error: "delete_failed" } (le compte peut être partiellement supprimé)
 */
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const userId = user.id;
  const admin = createAdminClient();

  // ── 1. Annulation des abonnements LS actifs (sauf lifetime, qui n'a pas de récurrence) ──
  let lemonCancelled = false;
  try {
    const { data: subs } = await admin
      .from("subscriptions")
      .select("ls_subscription_id, plan, status")
      .eq("user_id", userId)
      .in("status", ["trialing", "active", "past_due"]);

    if (subs && subs.length > 0) {
      for (const sub of subs) {
        if (sub.plan === "lifetime") continue; // pas de récurrence à annuler
        if (!sub.ls_subscription_id) continue;
        const result = await cancelSubscription(String(sub.ls_subscription_id));
        if (result.ok) lemonCancelled = true;
        else {
          // On log mais on continue : on préfère supprimer le compte plutôt
          // que bloquer le RGPD. L'admin pourra reconcilier manuellement.
          console.error("[account/delete] LS cancel failed for user", userId, result.error);
        }
      }
    }
  } catch (e) {
    console.error("[account/delete] LS cancel exception", e);
  }

  // ── 2. Nettoyage du storage (les buckets ne cascadent pas) ──
  try {
    // Avatar
    await admin.storage.from("avatars").remove([`${userId}/avatar.webp`]);
    // Bannière
    await admin.storage.from("profile-banners").remove([`${userId}/banner.webp`]);

    // Covers de presets (multiples possibles)
    const { data: presets } = await admin
      .from("presets")
      .select("cover_url")
      .eq("author_id", userId);

    if (presets && presets.length > 0) {
      const coverPaths = presets
        .map((p) => p.cover_url as string | null)
        .filter(Boolean)
        .map((url) => {
          const parts = (url as string).split("/covers/");
          return parts[1] ?? null;
        })
        .filter(Boolean) as string[];

      if (coverPaths.length > 0) {
        await admin.storage.from("covers").remove(coverPaths);
      }
    }
  } catch (e) {
    console.error("[account/delete] storage cleanup exception", e);
  }

  // ── 3. Suppression de l'auth user → CASCADE supprime profiles + dépendances ──
  const { error: deleteErr } = await admin.auth.admin.deleteUser(userId);

  if (deleteErr) {
    console.error("[account/delete] auth.admin.deleteUser failed", deleteErr);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, lemon_cancelled: lemonCancelled });
}
