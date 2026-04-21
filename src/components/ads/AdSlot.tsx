"use client";

import { useSubscription } from "@/hooks/useSubscription";

export type AdPlacement = "feed-inline" | "explore-grid" | "preset-detail";

interface AdSlotProps {
  placement: AdPlacement;
  /** Index dans la liste (utile pour ne pas afficher 2 ads consécutives). */
  index?: number;
  className?: string;
}

/**
 * Slot publicitaire conditionnel.
 *
 * Pour le moment :
 *   - Premium → no-op (return null), garanti par useSubscription
 *   - Free    → placeholder visuel discret + console log (ready for ads)
 *
 * Quand le chantier "Ads" démarrera, on remplacera le placeholder par
 * le code de la régie (Google AdSense, Ezoic, etc.) sans avoir à modifier
 * les composants qui consomment ce slot.
 */
export default function AdSlot({ placement, index, className = "" }: AdSlotProps) {
  const { isPremium, loading } = useSubscription();

  if (loading) return null;
  if (isPremium) return null;

  // Placeholder visuel léger en dev. À remplacer par le code de la régie en prod.
  if (process.env.NODE_ENV === "development") {
    return (
      <div
        className={`rounded-2xl border border-dashed border-surface-700/40 bg-surface-900/30 p-4 text-center ${className}`}
        data-ad-placement={placement}
        data-ad-index={index}
      >
        <p className="text-surface-600 text-[10px] uppercase tracking-widest font-medium">
          Ad slot · {placement}
        </p>
      </div>
    );
  }

  return null;
}
