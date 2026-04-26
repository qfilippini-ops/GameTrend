"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ROADMAP_ITEMS, type RoadmapItem } from "@/lib/roadmap/registry";
import { toggleRoadmapVote } from "@/app/actions/roadmap";
import { vibrate } from "@/lib/utils";
import { TicketDialog } from "@/components/roadmap/TicketDialog";

// Carte "Avenir" : liste verticale d'items (jeux + features mélangés),
// triée par votes desc. Chaque item est upvotable. Section ticket en bas
// (modale).
//
// Données : on charge en une seule RPC `get_roadmap_state` les compteurs
// + l'état "voté ?" pour TOUS les slugs du registry. Optimistic UI.

interface RoadmapState {
  [slug: string]: { count: number; voted: boolean };
}

export function RoadmapSection() {
  const t = useTranslations("home.roadmap");
  const { user } = useAuth();
  const [state, setState] = useState<RoadmapState>({});
  const [loading, setLoading] = useState(true);
  const [ticketOpen, setTicketOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const supabase = createClient();
        const slugs = ROADMAP_ITEMS.map((i) => i.slug);
        const { data, error } = await supabase.rpc("get_roadmap_state", {
          p_slugs: slugs,
        });
        if (cancelled) return;
        if (error) console.error("[RoadmapSection] state", error);
        const next: RoadmapState = {};
        for (const slug of slugs) {
          next[slug] = { count: 0, voted: false };
        }
        for (const row of (data ?? []) as Array<{
          slug: string;
          vote_count: number;
          voted: boolean;
        }>) {
          next[row.slug] = { count: row.vote_count ?? 0, voted: !!row.voted };
        }
        setState(next);
      } catch (e) {
        console.error("[RoadmapSection] load", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Items annotés du compteur + voted, triés par votes desc puis slug.
  const enriched = useMemo(() => {
    return ROADMAP_ITEMS.map((i) => ({
      ...i,
      count: state[i.slug]?.count ?? 0,
      voted: state[i.slug]?.voted ?? false,
    })).sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.slug.localeCompare(b.slug);
    });
  }, [state]);

  // Sections séparées par type, mais sans onglets : on les empile.
  const games = useMemo(() => enriched.filter((i) => i.kind === "game"), [enriched]);
  const features = useMemo(() => enriched.filter((i) => i.kind === "feature"), [enriched]);

  const onToggle = useCallback(
    async (slug: string) => {
      if (!user || user.is_anonymous) return;
      const prev = state[slug] ?? { count: 0, voted: false };
      const optimistic = {
        count: prev.voted ? Math.max(0, prev.count - 1) : prev.count + 1,
        voted: !prev.voted,
      };
      setState((s) => ({ ...s, [slug]: optimistic }));
      vibrate(8);
      const res = await toggleRoadmapVote(slug);
      if (!res.ok) {
        setState((s) => ({ ...s, [slug]: prev }));
        return;
      }
      setState((s) => ({
        ...s,
        [slug]: { count: res.voteCount ?? 0, voted: !!res.voted },
      }));
    },
    [state, user]
  );

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-display font-bold text-white flex items-center gap-2">
          <span>🚀</span> {t("title")}
        </h2>
      </div>

      {/* Deux groupes empilés (Jeux puis Fonctionnalités), pas d'onglets.
          Cards de hauteur uniforme par layout flex+row. */}
      <div className="space-y-4">
        {games.length > 0 && (
          <div>
            <h3 className="text-[11px] uppercase tracking-wider text-surface-500 font-bold mb-1.5 pl-0.5">
              {t("kindGamePlural")}
            </h3>
            <div className="space-y-2.5">
              {games.map((item) => (
                <RoadmapItemCard
                  key={item.slug}
                  item={item}
                  count={item.count}
                  voted={item.voted}
                  canVote={!!user && !user.is_anonymous}
                  onToggle={() => onToggle(item.slug)}
                  loading={loading}
                />
              ))}
            </div>
          </div>
        )}

        {features.length > 0 && (
          <div>
            <h3 className="text-[11px] uppercase tracking-wider text-surface-500 font-bold mb-1.5 pl-0.5">
              {t("kindFeaturePlural")}
            </h3>
            <div className="space-y-2.5">
              {features.map((item) => (
                <RoadmapItemCard
                  key={item.slug}
                  item={item}
                  count={item.count}
                  voted={item.voted}
                  canVote={!!user && !user.is_anonymous}
                  onToggle={() => onToggle(item.slug)}
                  loading={loading}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* CTA Ticket */}
      <div className="mt-4 rounded-2xl border border-surface-800/50 bg-gradient-to-br from-surface-900/60 to-brand-950/30 p-4 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-white font-display font-bold text-sm leading-tight">
            {t("ticketCtaTitle")}
          </p>
          <p className="text-surface-400 text-xs mt-0.5">{t("ticketCtaText")}</p>
        </div>
        <button
          type="button"
          onClick={() => setTicketOpen(true)}
          className="shrink-0 px-3.5 py-2 rounded-xl bg-brand-600 text-white text-xs font-bold hover:bg-brand-500 transition-colors"
        >
          {t("ticketCtaButton")}
        </button>
      </div>

      <TicketDialog open={ticketOpen} onClose={() => setTicketOpen(false)} />
    </section>
  );
}

// ─── Carte Item ─────────────────────────────────────────────────────────
// Layout horizontal : [icône] [titre + desc] [bouton upvote]
// La taille est imposée par le bouton de droite (largeur fixe), et le
// contenu central s'adapte → toutes les cards sont visuellement alignées.
interface RoadmapItemCardProps {
  item: RoadmapItem;
  count: number;
  voted: boolean;
  canVote: boolean;
  loading: boolean;
  onToggle: () => void;
}

function RoadmapItemCard({
  item,
  count,
  voted,
  canVote,
  loading,
  onToggle,
}: RoadmapItemCardProps) {
  const t = useTranslations(`home.roadmap.items.${item.i18nKey}`);
  const tCommon = useTranslations("home.roadmap");
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!canVote || pending) return;
    startTransition(async () => {
      await Promise.resolve(onToggle());
    });
  }

  return (
    <div
      className={`relative flex items-center gap-3 rounded-2xl border p-3 transition-colors ${
        voted
          ? "border-brand-500/40 bg-brand-950/20"
          : "border-surface-700/30 bg-surface-900/30"
      }`}
    >
      <div className="text-2xl shrink-0 w-9 h-9 flex items-center justify-center">
        {item.icon}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-display font-bold text-surface-100 text-sm leading-tight">
          {t("title")}
        </p>
        <p className="text-surface-500 text-xs mt-0.5 leading-snug line-clamp-2">
          {t("desc")}
        </p>
      </div>

      <UpvoteButton
        voted={voted}
        count={loading ? null : count}
        canVote={canVote}
        disabled={pending}
        onClick={handleClick}
        ariaLabel={voted ? tCommon("unvote") : tCommon("vote")}
      />
    </div>
  );
}

// ─── Bouton upvote ──────────────────────────────────────────────────────
// Style "Reddit" vertical : chevron + nombre. SVG ChevronUp inline pour
// un rendu propre indépendant de la police système (l'ancien `▲` était
// parfois rendu comme un panneau routier selon la police de fallback).
function UpvoteButton({
  voted,
  count,
  canVote,
  disabled,
  onClick,
  ariaLabel,
}: {
  voted: boolean;
  count: number | null;
  canVote: boolean;
  disabled: boolean;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!canVote || disabled}
      aria-pressed={voted}
      aria-label={ariaLabel}
      className={`shrink-0 flex flex-col items-center justify-center gap-0.5 w-14 py-1.5 rounded-xl transition-all ${
        voted
          ? "bg-brand-600 text-white shadow"
          : "bg-surface-800/60 border border-surface-700/60 text-surface-300 hover:border-brand-500/40 hover:text-brand-200"
      } ${!canVote ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      <motion.svg
        animate={voted ? { y: [0, -2, 0] } : { y: 0 }}
        transition={{ duration: 0.25 }}
        viewBox="0 0 24 24"
        width="16"
        height="16"
        fill="currentColor"
        aria-hidden
      >
        <path d="M12 5l8 9h-5v6h-6v-6H4z" />
      </motion.svg>
      <span className="font-mono tabular-nums text-xs font-bold">
        {count == null ? "…" : count}
      </span>
    </button>
  );
}
