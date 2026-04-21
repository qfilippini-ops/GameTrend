"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useSubscription } from "@/hooks/useSubscription";

/**
 * Bouton "Voir les analytics" affiché côté owner.
 * - Premium → lien direct vers la page analytics
 * - Free    → lien vers /premium (paywall implicite)
 */
export default function PresetAnalyticsButton({ presetId }: { presetId: string }) {
  const t = useTranslations("premium.analytics");
  const { isPremium } = useSubscription();

  const href = isPremium ? `/premium/analytics/${presetId}` : `/premium`;

  return (
    <Link
      href={href}
      className="flex items-center justify-center gap-2 w-full bg-surface-800/60 hover:bg-surface-700/60 text-white font-semibold py-3 rounded-2xl border border-surface-700/40 transition-colors text-sm"
    >
      📊 {t("viewAnalytics")}
      {!isPremium && (
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-gradient-brand text-white font-bold ml-1">
          PREMIUM
        </span>
      )}
    </Link>
  );
}
