"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useSubscription } from "@/hooks/useSubscription";
import { useConsent } from "@/hooks/useConsent";

export type AdPlacement = "feed-inline" | "explore-grid" | "preset-detail";

interface AdSlotProps {
  placement: AdPlacement;
  /** Index dans la liste — distingue les instances pour les data-attrs / debug. */
  index?: number;
  className?: string;
}

const SLOT_IDS: Record<AdPlacement, string | undefined> = {
  "feed-inline": process.env.NEXT_PUBLIC_ADSENSE_SLOT_FEED,
  "explore-grid": process.env.NEXT_PUBLIC_ADSENSE_SLOT_EXPLORE,
  "preset-detail": process.env.NEXT_PUBLIC_ADSENSE_SLOT_PRESET,
};

const CLIENT_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;

/**
 * Slot publicitaire Google AdSense.
 *
 * Conditions d'affichage (toutes doivent être vraies) :
 *   - L'utilisateur n'est PAS Premium
 *   - Une décision de consentement est connue (`consent.ready`)
 *   - L'utilisateur a consenti aux ads (`consent.adsConsent`)
 *     → purposes 1 + 2 + 3 + 4 dans la CMP Google,
 *     → OU consentement implicite hors EEE
 *   - Les env vars `NEXT_PUBLIC_ADSENSE_CLIENT_ID` et le slot ID
 *     correspondant au placement sont définies
 *
 * Sinon : `return null` complet, aucune trace dans le DOM.
 *
 * Anti-CLS : un `min-height` est appliqué pour réserver l'espace pendant le
 * chargement de l'annonce (évite les sauts visuels).
 */
export default function AdSlot({ placement, index, className = "" }: AdSlotProps) {
  const t = useTranslations("ads");
  const { isPremium, loading: subLoading } = useSubscription();
  const { ready: consentReady, adsConsent } = useConsent();
  const insRef = useRef<HTMLModElement | null>(null);
  const pushedRef = useRef(false);

  const slotId = SLOT_IDS[placement];
  const enabled =
    !subLoading &&
    consentReady &&
    !isPremium &&
    adsConsent &&
    !!CLIENT_ID &&
    !!slotId;

  useEffect(() => {
    if (!enabled || pushedRef.current) return;
    if (typeof window === "undefined") return;
    if (!insRef.current) return;

    try {
      const w = window as Window & { adsbygoogle?: unknown[] };
      w.adsbygoogle = w.adsbygoogle || [];
      w.adsbygoogle.push({});
      pushedRef.current = true;
    } catch (e) {
      console.warn("[adsense] push failed", e);
    }
  }, [enabled]);

  if (!enabled) return null;

  const minHeight = placement === "explore-grid" ? 250 : 100;

  return (
    <div
      className={`relative my-2 ${className}`}
      data-ad-placement={placement}
      data-ad-index={index}
    >
      <p className="text-surface-700 text-[9px] uppercase tracking-[0.18em] text-center mb-1 select-none">
        {t("label")}
      </p>
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: "block", minHeight }}
        data-ad-client={CLIENT_ID}
        data-ad-slot={slotId}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
