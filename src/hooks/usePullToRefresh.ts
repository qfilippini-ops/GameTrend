"use client";

import { useEffect, useRef, useState } from "react";

// Hook "pull-to-refresh" universel desktop + mobile.
//
// Comportement :
//   - Active uniquement quand window scrollY === 0 (en haut de page).
//   - Mobile (touchstart/touchmove) : on suit la distance de tirage. Quand
//     elle dépasse `threshold`, le release déclenche `onRefresh`.
//   - Desktop (wheel négatif accumulé) : on accumule le delta vers le haut
//     pendant qu'on est tout en haut. Au-delà du seuil, on déclenche
//     `onRefresh` (et on attend que le pointeur soit "au repos" avant de
//     pouvoir rejouer).
//   - Pendant le refresh, `pulling` est figé à false et `refreshing` est true
//     pour permettre à l'UI d'afficher un spinner. Quand `onRefresh` résout,
//     on remet à zéro et on attend un wheel "neutre" (delta == 0) avant de
//     ré-armer.
//
// Retourne :
//   - bind : props à appliquer sur l'élément racine du feed (touch handlers).
//   - pullPx : distance de tirage actuelle (0..threshold * 1.5).
//   - refreshing : true pendant l'exécution de onRefresh.

interface UsePullToRefreshOptions {
  // Callback async déclenché quand le seuil est atteint.
  onRefresh: () => Promise<unknown>;
  // Pixels nécessaires pour déclencher (par défaut 80).
  threshold?: number;
  // Désactive le hook (par exemple si une modale est ouverte).
  disabled?: boolean;
}

interface UsePullToRefreshReturn {
  bind: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
  };
  pullPx: number;
  refreshing: boolean;
}

export function usePullToRefresh({
  onRefresh,
  threshold = 80,
  disabled = false,
}: UsePullToRefreshOptions): UsePullToRefreshReturn {
  const [pullPx, setPullPx] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Refs pour ne pas reposer le listener wheel à chaque rendu.
  const startYRef = useRef<number | null>(null);
  const wheelAccumRef = useRef(0);
  const refreshingRef = useRef(false);
  const cooldownRef = useRef(false); // bloque l'enchaînement immédiat
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  // Garantit qu'on est tout en haut de la page (tolère 1px d'overscroll).
  const atTop = () => (typeof window === "undefined" ? false : window.scrollY <= 1);

  const trigger = async () => {
    if (refreshingRef.current || cooldownRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    setPullPx(threshold);
    try {
      await onRefreshRef.current();
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
      setPullPx(0);
      wheelAccumRef.current = 0;
      // Cooldown court : empêche re-trigger immédiat tant que la roulette
      // n'a pas relâché. On le lève via un wheel "0" ou après un timer.
      cooldownRef.current = true;
      setTimeout(() => {
        cooldownRef.current = false;
      }, 600);
    }
  };

  // ── Wheel desktop ───────────────────────────────────────────────────────
  useEffect(() => {
    if (disabled) return;
    let resetTimer: ReturnType<typeof setTimeout> | null = null;

    const onWheel = (e: WheelEvent) => {
      if (refreshingRef.current || cooldownRef.current) return;
      if (!atTop()) {
        wheelAccumRef.current = 0;
        setPullPx(0);
        return;
      }
      // delta < 0 = scroll vers le haut. On accumule la valeur ABSOLUE.
      if (e.deltaY < 0) {
        wheelAccumRef.current += -e.deltaY;
        const visible = Math.min(wheelAccumRef.current, threshold * 1.5);
        setPullPx(visible);

        if (wheelAccumRef.current >= threshold) {
          void trigger();
          return;
        }
      } else if (e.deltaY > 0) {
        // Scroll vers le bas → reset l'accumulation.
        wheelAccumRef.current = 0;
        setPullPx(0);
      }

      // Décroissance auto si l'utilisateur s'arrête sans atteindre le seuil.
      if (resetTimer) clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        wheelAccumRef.current = 0;
        setPullPx(0);
      }, 350);
    };

    window.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      window.removeEventListener("wheel", onWheel);
      if (resetTimer) clearTimeout(resetTimer);
    };
  }, [threshold, disabled]);

  // ── Touch mobile ────────────────────────────────────────────────────────
  // On passe par les handlers du composant racine plutôt que window pour
  // ne pas déclencher le pull à l'intérieur d'une modale ou d'un scroll
  // horizontal interne.
  const bind = {
    onTouchStart: (e: React.TouchEvent) => {
      if (disabled || refreshingRef.current) return;
      if (!atTop()) {
        startYRef.current = null;
        return;
      }
      startYRef.current = e.touches[0]?.clientY ?? null;
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (disabled || refreshingRef.current) return;
      const startY = startYRef.current;
      if (startY == null) return;
      const dy = (e.touches[0]?.clientY ?? startY) - startY;
      if (dy > 0 && atTop()) {
        // Résistance progressive : on freine au-delà du seuil.
        const eased = dy < threshold ? dy : threshold + (dy - threshold) * 0.4;
        setPullPx(Math.min(eased, threshold * 1.5));
      } else {
        setPullPx(0);
      }
    },
    onTouchEnd: () => {
      if (disabled || refreshingRef.current) {
        startYRef.current = null;
        return;
      }
      if (pullPx >= threshold) {
        void trigger();
      } else {
        setPullPx(0);
      }
      startYRef.current = null;
    },
  };

  return { bind, pullPx, refreshing };
}
