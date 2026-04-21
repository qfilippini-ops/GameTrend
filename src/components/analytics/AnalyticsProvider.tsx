"use client";

import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { initPostHog, identifyUser, resetUser } from "@/lib/analytics/posthog";

const COOKIE_CONSENT_KEY = "cookie-consent";

/**
 * Initialise PostHog côté client uniquement si l'utilisateur a accepté
 * "tous les cookies" via le CookieBanner.
 *
 * Identifie l'utilisateur connecté et reset à la déconnexion.
 *
 * À monter dans le layout `[locale]/layout.tsx`.
 */
export default function AnalyticsProvider() {
  const { user, profile } = useAuth();

  useEffect(() => {
    if (typeof window === "undefined") return;

    function checkConsent() {
      const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
      if (consent === "all") {
        initPostHog();
      }
    }

    checkConsent();

    function onStorage(e: StorageEvent) {
      if (e.key === COOKIE_CONSENT_KEY) checkConsent();
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
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
  }, [user, profile?.subscription_status, profile?.subscription_plan, profile?.username]);

  return null;
}
