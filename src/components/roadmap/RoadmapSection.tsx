"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ROADMAP_ITEMS, type RoadmapItem } from "@/lib/roadmap/registry";
import { toggleRoadmapVote } from "@/app/actions/roadmap";
import { vibrate } from "@/lib/utils";
import { TicketDialog } from "@/components/roadmap/TicketDialog";

// Carte "Avenir" : deux onglets (Jeux / Fonctionnalités), chaque item est
// upvotable. Tri par votes desc. Section ticket en bas (modale).
//
// Données : on charge en une seule RPC `get_roadmap_state` les compteurs
// + l'état "voté ?" pour TOUS les slugs du registry. Optimistic UI sur
// les votes.

interface RoadmapState {
  // Mappe slug → { count, voted }
  [slug: string]: { count: number; voted: boolean };
}

export function RoadmapSection() {
  const t = useTranslations("home.roadmap");
  const { user } = useAuth();
  const [tab, setTab] = useState<"game" | "feature">("game");
  const [state, setState] = useState<RoadmapState>({});
  const [loading, setLoading] = useState(true);
  const [ticketOpen, setTicketOpen] = useState(false);

  // ── Chargement initial des compteurs ──────────────────────────────
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
        if (error) {
          console.error("[RoadmapSection] state", error);
        }
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

  // ── Items filtrés par onglet et triés par votes ───────────────────
  const visibleItems = useMemo(() => {
    return ROADMAP_ITEMS.filter((i) => i.kind === tab)
      .map((i) => ({
        ...i,
        count: state[i.slug]?.count ?? 0,
        voted: state[i.slug]?.voted ?? false,
      }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.slug.localeCompare(b.slug);
      });
  }, [tab, state]);

  // ── Toggle vote (optimistic) ──────────────────────────────────────
  const onToggle = useCallback(
    async (slug: string) => {
      if (!user || user.is_anonymous) return;
      const prev = state[slug] ?? { count: 0, voted: false };
      // Optimistic
      const optimistic = {
        count: prev.voted
          ? Math.max(0, prev.count - 1)
          : prev.count + 1,
        voted: !prev.voted,
      };
      setState((s) => ({ ...s, [slug]: optimistic }));
      vibrate(8);
      const res = await toggleRoadmapVote(slug);
      if (!res.ok) {
        // Revert
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

      {/* ── Tabs ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-surface-900/60 border border-surface-800/50 mb-3">
        {([
          { key: "game", label: t("tabGames") },
          { key: "feature", label: t("tabFeatures") },
        ] as const).map((it) => (
          <button
            key={it.key}
            type="button"
            onClick={() => setTab(it.key)}
            className={`py-2 rounded-xl text-xs font-bold transition-all ${
              tab === it.key
                ? "bg-brand-600 text-white shadow"
                : "text-surface-400 hover:text-surface-200"
            }`}
          >
            {it.label}
          </button>
        ))}
      </div>

      {/* ── Items ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {visibleItems.map((item) => (
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

      {/* ── Ticket CTA ─────────────────────────────────────────── */}
      <div className="mt-4 rounded-2xl border border-surface-800/50 bg-gradient-to-br from-surface-900/60 to-brand-950/30 p-4 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-white font-display font-bold text-sm leading-tight">
            {t("ticketCtaTitle")}
          </p>
          <p className="text-surface-400 text-xs mt-0.5">
            {t("ticketCtaText")}
          </p>
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
    <div className="relative rounded-2xl border border-surface-700/30 bg-surface-900/30 p-4 overflow-hidden flex flex-col gap-2.5">
      <div className="absolute inset-0 bg-gradient-to-br from-surface-800/10 to-transparent pointer-events-none" />
      <span className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-950/60 text-amber-500 border border-amber-700/30 font-medium z-10">
        {tCommon("badge")}
      </span>

      <div className="relative flex items-start gap-3">
        <div className="text-3xl opacity-90 shrink-0">{item.icon}</div>
        <div className="min-w-0 flex-1">
          <p className="font-display font-bold text-surface-200 text-sm leading-tight">
            {t("title")}
          </p>
          <p className="text-surface-500 text-xs mt-1 leading-snug">
            {t("desc")}
          </p>
        </div>
      </div>

      <div className="relative flex items-center gap-2 mt-1">
        <button
          type="button"
          onClick={handleClick}
          disabled={!canVote || pending}
          aria-pressed={voted}
          aria-label={voted ? tCommon("unvote") : tCommon("vote")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
            voted
              ? "bg-brand-600 text-white shadow"
              : "bg-surface-800/60 border border-surface-700/60 text-surface-300 hover:border-brand-500/40 hover:text-brand-200"
          } ${!canVote ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <motion.span
            aria-hidden
            animate={voted ? { y: [0, -3, 0] } : { y: 0 }}
            transition={{ duration: 0.25 }}
          >
            ▲
          </motion.span>
          <span className="font-mono tabular-nums">
            {loading ? "…" : count}
          </span>
        </button>
        {!canVote && (
          <span className="text-[10px] text-surface-600 italic">
            {tCommon("loginToVote")}
          </span>
        )}
      </div>

      <AnimatePresence>
        {voted && (
          <motion.div
            key="voted-glow"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 rounded-2xl pointer-events-none ring-1 ring-brand-500/40"
            style={{ boxShadow: "0 0 18px rgba(139,92,246,0.18)" }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
