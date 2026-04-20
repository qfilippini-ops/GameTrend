"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { AFFILIATE_CONFIG } from "@/lib/affiliate/config";

/**
 * Composant invisible monté dans le layout. Détecte une session fraîche
 * + un cookie `gt_ref` présent, puis appelle la RPC `claim_referral` une
 * unique fois par session navigateur.
 *
 * Pourquoi pas dans le trigger handle_new_user côté SQL ? Parce qu'un
 * trigger Postgres n'a pas accès aux cookies HTTP. Cette approche client
 * marche uniformément pour email, OAuth Google et magic link.
 *
 * Pourquoi pas dans /auth/callback ? Le callback ne s'exécute que pour
 * email/OAuth, pas pour le password signup direct (qui auto-loggue sans
 * passer par le callback). Le placer dans le layout couvre tous les cas.
 *
 * Anti-double-call :
 *   - localStorage flag pour éviter de retenter dans la même session
 *     navigateur (évite les warnings inutiles si le user clear son cookie
 *     `gt_ref` via les devtools mais qu'on a déjà claim).
 *   - La RPC est elle-même idempotente (UNIQUE sur referrals.referred_id),
 *     donc même sans flag aucun risque de doublon DB.
 */
export default function ReferralClaimer() {
  const { user, loading } = useAuth();
  const claimedRef = useRef(false);

  useEffect(() => {
    if (loading || !user || user.is_anonymous) return;
    if (claimedRef.current) return;

    const code = readCookie(AFFILIATE_CONFIG.COOKIE_NAME);
    if (!code) return;

    const flag = `${AFFILIATE_CONFIG.CLAIMED_FLAG_KEY}:${user.id}`;
    if (typeof window !== "undefined" && window.localStorage.getItem(flag)) {
      deleteCookie(AFFILIATE_CONFIG.COOKIE_NAME);
      return;
    }

    claimedRef.current = true;

    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.rpc("claim_referral", { code });
        if (error) {
          console.warn("[ReferralClaimer] RPC error", error.message);
        } else {
          console.info("[ReferralClaimer] claim result", data);
        }
      } catch (e) {
        console.warn("[ReferralClaimer] unexpected error", e);
      } finally {
        // Quel que soit le résultat (success, already_referred, code_not_found,
        // self_referral) on supprime le cookie + on marque le flag pour ne pas
        // retenter à chaque page view.
        deleteCookie(AFFILIATE_CONFIG.COOKIE_NAME);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(flag, "1");
        }
      }
    })();
  }, [user, loading]);

  return null;
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp("(?:^|;\\s*)" + escapeRegex(name) + "=([^;]*)")
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function deleteCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
