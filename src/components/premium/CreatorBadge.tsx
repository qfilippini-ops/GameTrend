"use client";

import { useTranslations } from "next-intl";
import type { SubscriptionStatus } from "@/types/database";

interface CreatorBadgeProps {
  /** Status d'abonnement de l'auteur. Si non premium, le composant renvoie null. */
  status: SubscriptionStatus | null | undefined;
  /** Variante d'affichage compacte (icône seule) ou complète (icône + label). */
  variant?: "compact" | "full";
  className?: string;
}

const PREMIUM_STATUSES: SubscriptionStatus[] = ["trialing", "active", "lifetime"];

/**
 * Badge "Creator" affiché à côté du pseudo pour les comptes Premium.
 *
 * Usage : `<CreatorBadge status={profile.subscription_status} />`
 *
 * Visible dans le feed, le profil, les notifications, les commentaires et
 * les listes utilisateurs. Pas affiché pour les comptes free / past_due /
 * cancelled.
 */
export default function CreatorBadge({
  status,
  variant = "compact",
  className = "",
}: CreatorBadgeProps) {
  const t = useTranslations("premium");

  if (!status || !PREMIUM_STATUSES.includes(status)) return null;

  const label = status === "lifetime" ? t("badgeLifetime") : t("badgeCreator");

  if (variant === "compact") {
    return (
      <span
        title={label}
        className={`inline-flex items-center justify-center w-4 h-4 rounded-full bg-gradient-brand text-[9px] font-bold text-white shrink-0 ${className}`}
      >
        ★
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-brand text-[10px] font-bold text-white uppercase tracking-wider ${className}`}
    >
      <span>★</span>
      <span>{label}</span>
    </span>
  );
}
