"use client";

import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useConsent } from "@/hooks/useConsent";
import { initPostHog, identifyUser, resetUser } from "@/lib/analytics/posthog";

/**
 * Initialise PostHog côté client uniquement si :
 *   - On est hors EEE (consentement implicite, géré par useConsent), OU
 *   - L'utilisateur a accepté les purposes 1 + 8 dans la CMP Google (TCF v2.2).
 *
 * Identifie l'utilisateur connecté et reset à la déconnexion.
 *
 * À monter dans le layout `[locale]/layout.tsx`.
 */
export default function AnalyticsProvider() {
  const { user, profile } = useAuth();
  const { ready, analyticsConsent } = useConsent();

  useEffect(() => {
    if (!ready) return;
    if (!analyticsConsent) return;
    initPostHog();
  }, [ready, analyticsConsent]);

  useEffect(() => {
    if (!ready || !analyticsConsent) return;
    if (!user) {
      resetUser();
      return;
    }
    if (user.is_anonymous) return;

    identifyUser(user.id, {
      username: profile?.username ?? undefined,
      subscription_status: profile?.subscription_status ?? "free",
      subscription_plan: profile?.subscription_plan ?? null,
    });
  }, [
    ready,
    analyticsConsent,
    user,
    profile?.subscription_status,
    profile?.subscription_plan,
    profile?.username,
  ]);

  return null;
}
