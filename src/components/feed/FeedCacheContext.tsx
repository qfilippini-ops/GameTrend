"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

/**
 * Cache mémoire global pour les onglets du feed.
 *
 * Objectif : rendre le retour sur la page d'accueil instantané (style Twitter /
 * Instagram) — items déjà chargés affichés tout de suite, scroll restauré,
 * refetch silencieux en arrière-plan si les données sont vieilles (>TTL).
 *
 * Volontairement en mémoire seule (pas localStorage) : un refresh complet du
 * navigateur réinitialise. C'est le comportement attendu et évite les
 * problèmes de désync entre onglets.
 *
 * Pas de réinvention de SWR/React Query : on a deux listes, le besoin est
 * cadré, un Context + Map suffit largement.
 */

export type FeedTab = "following" | "explore";

/** Données génériques cachées par tab. Les composants choisissent le shape. */
export interface FeedTabState<TItem = unknown, TMeta = unknown> {
  items: TItem[];
  /** Timestamp de la dernière fetch réussie (ms). */
  lastFetchAt: number;
  /** Position de scroll au unmount, restaurée au remount. */
  scrollY: number;
  /** Pagination : il existe potentiellement plus d'items derrière. */
  hasMore: boolean;
  /** Cursor (created_at ISO du dernier item) pour la page suivante. */
  lastCursor: string | null;
  /** Slot libre pour des données spécifiques au tab (ex. count de follows, sections Explore). */
  meta?: TMeta;
}

interface FeedCache {
  following?: FeedTabState;
  explore?: FeedTabState;
  /** Onglet actif au moment du dernier unmount, pour le restaurer. */
  activeTab?: FeedTab;
}

const TTL_MS = 60_000;

interface ContextValue {
  getState: <TItem = unknown, TMeta = unknown>(tab: FeedTab) => FeedTabState<TItem, TMeta> | undefined;
  setState: <TItem = unknown, TMeta = unknown>(tab: FeedTab, next: FeedTabState<TItem, TMeta>) => void;
  patchState: <TItem = unknown, TMeta = unknown>(
    tab: FeedTab,
    patch: Partial<FeedTabState<TItem, TMeta>>
  ) => void;
  isStale: (tab: FeedTab) => boolean;
  invalidate: (tab?: FeedTab) => void;
  getActiveTab: () => FeedTab | undefined;
  setActiveTab: (tab: FeedTab) => void;
}

const FeedCacheCtx = createContext<ContextValue | null>(null);

export function FeedCacheProvider({ children }: { children: React.ReactNode }) {
  // useRef : on n'a PAS besoin de re-render le Provider à chaque modif du cache.
  // Les composants consommateurs gèrent leur propre re-render via useState local.
  const cacheRef = useRef<FeedCache>({});
  // Sert juste à exposer un activeTab "réactif" (la TabBar en a besoin).
  const [, forceTabRender] = useState(0);

  const getState = useCallback(<TItem, TMeta>(tab: FeedTab) => {
    return cacheRef.current[tab] as FeedTabState<TItem, TMeta> | undefined;
  }, []);

  const setState = useCallback(<TItem, TMeta>(tab: FeedTab, next: FeedTabState<TItem, TMeta>) => {
    cacheRef.current[tab] = next as FeedTabState;
  }, []);

  const patchState = useCallback(
    <TItem, TMeta>(tab: FeedTab, patch: Partial<FeedTabState<TItem, TMeta>>) => {
      const prev = cacheRef.current[tab] as FeedTabState<TItem, TMeta> | undefined;
      if (!prev) return;
      cacheRef.current[tab] = { ...prev, ...patch } as FeedTabState;
    },
    []
  );

  const isStale = useCallback((tab: FeedTab) => {
    const s = cacheRef.current[tab];
    if (!s) return true;
    return Date.now() - s.lastFetchAt > TTL_MS;
  }, []);

  const invalidate = useCallback((tab?: FeedTab) => {
    if (!tab) {
      cacheRef.current = { activeTab: cacheRef.current.activeTab };
    } else {
      delete cacheRef.current[tab];
    }
  }, []);

  const getActiveTab = useCallback(() => cacheRef.current.activeTab, []);
  const setActiveTab = useCallback((tab: FeedTab) => {
    if (cacheRef.current.activeTab === tab) return;
    cacheRef.current.activeTab = tab;
    forceTabRender((n) => n + 1);
  }, []);

  return (
    <FeedCacheCtx.Provider
      value={{ getState, setState, patchState, isStale, invalidate, getActiveTab, setActiveTab }}
    >
      {children}
    </FeedCacheCtx.Provider>
  );
}

export function useFeedCache() {
  const ctx = useContext(FeedCacheCtx);
  if (!ctx) throw new Error("useFeedCache must be used within <FeedCacheProvider>");
  return ctx;
}
