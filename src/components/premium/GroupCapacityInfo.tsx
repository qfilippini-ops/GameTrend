"use client";

/**
 * Pendant de LobbyCapacityInfo, dédié aux groupes.
 * Affiche un (ⓘ) qui ouvre un popover Premium quand le groupe a la
 * capacité freemium (4). Rendu via portal pour éviter les coupes liées
 * à `overflow-hidden` sur les conteneurs parents.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { FREE_GROUP_CAPACITY } from "@/lib/premium/groupCapacity";

interface Props {
  capacity: number;
}

const POPOVER_WIDTH = 240;
const POPOVER_GAP = 8;

export default function GroupCapacityInfo({ capacity }: Props) {
  const t = useTranslations("common.groupCapacity");
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const shouldShow = capacity === FREE_GROUP_CAPACITY;

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
              zIndex: 400,
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
