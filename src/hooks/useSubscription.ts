"use client";

import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import type { SubscriptionStatus, SubscriptionPlan } from "@/types/database";

const PREMIUM_STATUSES: SubscriptionStatus[] = ["trialing", "active", "lifetime"];

export interface SubscriptionState {
  loading: boolean;
  status: SubscriptionStatus;
  plan: SubscriptionPlan | null;
  isPremium: boolean;
  isTrialing: boolean;
  isLifetime: boolean;
  isPastDue: boolean;
  willCancel: boolean;
  currentPeriodEnd: Date | null;
  cancelAt: Date | null;
  lifetimeEligible: boolean;
  lsCustomerId: string | null;
}

/**
 * Hook central pour interroger l'état d'abonnement de l'utilisateur connecté.
 *
 * Source de vérité : useAuth().profile (qui hydrate depuis la table profiles).
 * Pas de fetch additionnel — pas de Realtime non plus pour éviter les WS
 * supplémentaires. Le webhook met à jour profiles, et au prochain refresh
 * (refreshProfile, navigation, signin) l'état se met à jour.
 *
 * Si on veut du temps réel (ex: après checkout overlay), on peut rappeler
 * `refreshProfile()` depuis useAuth.
 */
export function useSubscription(): SubscriptionState {
  const { profile, loading } = useAuth();

  return useMemo(() => {
    const status = (profile?.subscription_status ?? "free") as SubscriptionStatus;
    const plan = (profile?.subscription_plan ?? null) as SubscriptionPlan | null;
    const periodEnd = profile?.subscription_current_period_end
      ? new Date(profile.subscription_current_period_end)
      : null;
    const cancelAt = profile?.subscription_cancel_at
      ? new Date(profile.subscription_cancel_at)
      : null;

    return {
      loading,
      status,
      plan,
      isPremium: PREMIUM_STATUSES.includes(status),
      isTrialing: status === "trialing",
      isLifetime: status === "lifetime",
      isPastDue: status === "past_due",
      willCancel: cancelAt !== null && status !== "lifetime",
      currentPeriodEnd: periodEnd,
      cancelAt,
      lifetimeEligible: profile?.lifetime_eligible ?? false,
      lsCustomerId: profile?.ls_customer_id ?? null,
    };
  }, [profile, loading]);
}
