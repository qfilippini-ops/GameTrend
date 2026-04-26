"use client";

/**
 * Petite icône (ⓘ) affichée à côté du compteur joueurs d'un lobby.
 *
 * Visible uniquement quand la capacité du lobby est la capacité freemium
 * (FREE_LOBBY_CAPACITY = 4). Les lobbies premium (16) ou hardcodés
 * (Outbid = 2) ne déclenchent pas l'upsell.
 *
 * Au clic : popover ancré sous l'icône, fermable par clic extérieur ou Échap,
 * avec un CTA vers /premium.
 */

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  FREE_LOBBY_CAPACITY,
  PREMIUM_LOBBY_CAPACITY,
} from "@/lib/premium/lobbyCapacity";

interface Props {
  capacity: number;
}

export default function LobbyCapacityInfo({ capacity }: Props) {
  const t = useTranslations("common.lobbyCapacity");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Affiché uniquement quand on est sur la capacité freemium standard.
  const shouldShow = capacity === FREE_LOBBY_CAPACITY;

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!shouldShow) return null;

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        type="button"
        aria-label={t("infoAria")}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/10 text-[10px] font-bold text-amber-300 hover:bg-amber-500/20 hover:border-amber-400/60 transition-colors"
      >
        i
      </button>

      {open && (
        <div
          role="dialog"
          className="absolute right-0 top-full z-30 mt-2 w-60 rounded-xl border border-amber-500/30 bg-surface-900/95 backdrop-blur-md p-3 shadow-xl"
        >
          <p className="text-[12px] leading-snug text-amber-100">
            {t("popoverMessage")}
          </p>
          <Link
            href="/premium"
            onClick={() => setOpen(false)}
            className="mt-2 inline-block w-full rounded-lg bg-gradient-to-r from-amber-500 to-amber-400 px-3 py-1.5 text-center text-[12px] font-bold text-surface-950 hover:opacity-90 transition-opacity"
          >
            {t("upsellCta")}
          </Link>
        </div>
      )}
    </div>
  );
}

// Export pour le caller qui voudrait gate sans monter le composant
export const LOBBY_CAPACITY_PREMIUM = PREMIUM_LOBBY_CAPACITY;
