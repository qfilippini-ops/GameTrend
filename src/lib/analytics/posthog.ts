/**
 * Wrapper PostHog client-side. Conformité RGPD : opt-in via cookie banner.
 *
 * - Le snippet est chargé uniquement après acceptation analytics.
 * - Si refus → tous les .capture() sont des no-op.
 * - Pas de side-effect au require() : tout passe par initPostHog().
 */

"use client";

import posthog from "posthog-js";

let initialized = false;

export function initPostHog() {
  if (typeof window === "undefined") return;
  if (initialized) return;

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com";

  if (!key) {
    console.warn("[posthog] NEXT_PUBLIC_POSTHOG_KEY manquant, analytics désactivées");
    return;
  }

  posthog.init(key, {
    api_host: host,
    person_profiles: "identified_only",
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: false,
    disable_session_recording: true,
    // Désactive le module surveys (chargé en lazy par le SDK PostHog mais
    // tout de même téléchargé dès l'init = ~29 KiB inutile sur la landing).
    // À réactiver explicitement si on veut pousser des surveys un jour.
    disable_surveys: true,
    persistence: "localStorage+cookie",
    loaded: () => {
      initialized = true;
    },
  });
}

export function identifyUser(userId: string, props?: Record<string, unknown>) {
  if (!initialized) return;
  try {
    posthog.identify(userId, props);
  } catch (e) {
    console.warn("[posthog] identify failed", e);
  }
}

export function resetUser() {
  if (!initialized) return;
  try {
    posthog.reset();
  } catch {}
}

export type AnalyticsEvent =
  | "pricing_page_viewed"
  | "checkout_started"
  | "subscription_started"
  | "subscription_cancelled"
  | "payment_failed"
  | "paywall_shown"
  | "paywall_clicked_upgrade"
  | "feature_used_premium";

export function track(event: AnalyticsEvent, props?: Record<string, unknown>) {
  if (!initialized) return;
  try {
    posthog.capture(event, props);
  } catch (e) {
    console.warn("[posthog] capture failed", e);
  }
}
