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
 *
 * Implémentation note : le popover est rendu via un portal dans <body> et
 * positionné en `fixed` car les conteneurs parents (carte joueurs) ont
 * `overflow-hidden` pour garder leurs `rounded-2xl` propres, ce qui clippait
 * un popover en `absolute`.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  FREE_LOBBY_CAPACITY,
  PREMIUM_LOBBY_CAPACITY,
} from "@/lib/premium/lobbyCapacity";

interface Props {
  capacity: number;
}

const POPOVER_WIDTH = 240; // doit matcher w-60 (15rem)
const POPOVER_GAP = 8;

export default function LobbyCapacityInfo({ capacity }: Props) {
  const t = useTranslations("common.lobbyCapacity");
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Le portail n'est mounté que côté client.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Affiché uniquement quand on est sur la capacité freemium standard.
  const shouldShow = capacity === FREE_LOBBY_CAPACITY;

  // Recalcule la position du popover (sous le bouton, aligné à droite).
  const updateCoords = () => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const left = Math.max(
      8,
      Math.min(
        window.innerWidth - POPOVER_WIDTH - 8,
        rect.right - POPOVER_WIDTH
      )
    );
    setCoords({ top: rect.bottom + POPOVER_GAP, left });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updateCoords();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onReposition() {
      updateCoords();
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [open]);

  if (!shouldShow) return null;

  return (
    <>
      <button
        ref={buttonRef}
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

      {mounted && open && coords &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              width: POPOVER_WIDTH,
              zIndex: 100,
            }}
            className="rounded-xl border border-amber-500/30 bg-surface-900/95 backdrop-blur-md p-3 shadow-xl"
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
          </div>,
          document.body
        )}
    </>
  );
}

export const LOBBY_CAPACITY_PREMIUM = PREMIUM_LOBBY_CAPACITY;
