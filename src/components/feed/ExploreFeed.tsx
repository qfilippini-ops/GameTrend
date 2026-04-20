"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { GAMES_REGISTRY } from "@/games/registry";
import Avatar from "@/components/ui/Avatar";
import { useFeedCache, type FeedTabState } from "@/components/feed/FeedCacheContext";

const gameMap = new Map(GAMES_REGISTRY.map((g) => [g.id, g]));

interface TrendingPreset {
  id: string;
  name: string;
  description: string | null;
  game_type: string;
  cover_url: string | null;
  play_count: number;
  author_id: string;
  author?: { username: string | null; avatar_url: string | null };
}

interface PublicRoom {
  id: string;
  game_type: string;
  host_id: string;
  created_at: string;
  player_count: number;
  host?: { username: string | null; avatar_url: string | null };
}

interface ExploreData {
  trending: TrendingPreset[];
  rooms: PublicRoom[];
}

/**
 * Le cache stocke "items" comme un tuple { trending, rooms } sérialisé en
 * tableau d'un seul élément pour respecter la shape FeedTabState générique.
 * On l'expose via getData/setData pour rester ergonomique.
 */
type CachedState = FeedTabState<ExploreData, undefined>;

interface RpcShape {
  trending_presets: Array<{
    id: string;
    name: string;
    description: string | null;
    game_type: string;
    cover_url: string | null;
    play_count: number;
    author_id: string;
    author: { username: string | null; avatar_url: string | null } | null;
  }>;
  public_rooms: Array<{
    id: string;
    game_type: string;
    host_id: string;
    created_at: string;
    player_count: number;
    host: { username: string | null; avatar_url: string | null } | null;
  }>;
}

function rpcToData(raw: RpcShape): ExploreData {
  return {
    trending: raw.trending_presets.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      game_type: p.game_type,
      cover_url: p.cover_url,
      play_count: p.play_count,
      author_id: p.author_id,
      author: p.author ?? undefined,
    })),
    rooms: raw.public_rooms.map((r) => ({
      id: r.id,
      game_type: r.game_type,
      host_id: r.host_id,
      created_at: r.created_at,
      player_count: r.player_count,
      host: r.host ?? undefined,
    })),
  };
}

export default function ExploreFeed() {
  const t = useTranslations("feed.explore");
  const tFeed = useTranslations("feed");
  const tCommon = useTranslations("common");
  const { user } = useAuth();
  const cache = useFeedCache();

  const cached = cache.getState<ExploreData, undefined>("explore");
  const [data, setData] = useState<ExploreData | null>(cached?.items[0] ?? null);
  const [loading, setLoading] = useState<boolean>(!cached);
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const fetchExplore = useCallback(async (): Promise<ExploreData> => {
    const supabase = createClient();
    const { data: raw, error: rpcErr } = await supabase.rpc("get_explore_feed", {
      top_presets: 10,
      top_rooms: 10,
    });
    if (rpcErr) throw rpcErr;
    return rpcToData(raw as RpcShape);
  }, []);

  // ─── Initial fetch ou refetch silencieux ───────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const cur = cache.getState<ExploreData, undefined>("explore");
    const stale = cache.isStale("explore");
    const silent = !!cur && stale;

    if (cur && !stale) {
      // Cache frais → rien à faire, tout est déjà rendu
      setLoading(false);
      return;
    }

    async function run() {
      try {
        const fresh = await fetchExplore();
        if (cancelled) return;
        setData(fresh);
        setError(null);
        cache.setState<ExploreData, undefined>("explore", {
          items: [fresh],
          lastFetchAt: Date.now(),
          scrollY: cur?.scrollY ?? 0,
          hasMore: false,
          lastCursor: null,
        });
      } catch (e) {
        if (cancelled) return;
        console.error("[ExploreFeed] fetch error", e);
        if (!silent) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Restauration du scroll au mount ───────────────────────────────────────
  useEffect(() => {
    const cur = cache.getState<ExploreData, undefined>("explore");
    if (!cur || cur.scrollY <= 0) return;
    const raf = requestAnimationFrame(() => window.scrollTo(0, cur.scrollY));
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Sauvegarde du scroll au unmount ───────────────────────────────────────
  useEffect(() => {
    return () => {
      const cur = cache.getState<ExploreData, undefined>("explore");
      if (!cur) return;
      cache.patchState<ExploreData, undefined>("explore", {
        scrollY: window.scrollY,
      });
    };
  }, [cache]);

  const retry = useCallback(() => {
    setError(null);
    setLoading(true);
    cache.invalidate("explore");
    (async () => {
      try {
        const fresh = await fetchExplore();
        setData(fresh);
        cache.setState<ExploreData, undefined>("explore", {
          items: [fresh],
          lastFetchAt: Date.now(),
          scrollY: 0,
          hasMore: false,
          lastCursor: null,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [cache, fetchExplore]);

  if (loading && !data && !error) {
    return <SkeletonExplore />;
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 px-5 text-center rounded-2xl border border-red-900/40 bg-red-950/20">
        <div className="text-4xl">⚠️</div>
        <p className="text-red-300 font-display font-bold text-sm">{tFeed("errorTitle")}</p>
        <button
          onClick={retry}
          className="mt-1 px-5 py-2 rounded-xl bg-red-900/60 hover:bg-red-800 border border-red-700/40 text-red-200 text-xs font-bold transition-colors"
        >
          {tFeed("errorRetry")}
        </button>
      </div>
    );
  }

  const trending = data?.trending ?? [];
  const rooms = data?.rooms ?? [];

  return (
    <div className="space-y-5">
      {rooms.length > 0 && (
        <section>
          <SectionHeader emoji="🟢" title={t("publicLobbies")} subtitle={t("lobbiesWaiting", { count: rooms.length })} />
          <div className="space-y-2">
            {rooms.map((room, i) => {
              const game = gameMap.get(room.game_type);
              return (
                <motion.div
                  key={room.id}
                  initial={i < 4 ? { opacity: 0, x: -8 } : false}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <Link
                    href={`/games/${room.game_type}/online/${room.id}`}
                    className="flex items-center gap-3 p-3 rounded-2xl border border-surface-800/50 bg-surface-900/40 hover:border-brand-700/40 transition-colors"
                  >
                    <div className="relative">
                      <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-surface-900 animate-pulse" />
                      <div className="w-11 h-11 rounded-xl bg-brand-950/60 border border-brand-700/30 flex items-center justify-center text-xl">
                        {game?.icon ?? "🎮"}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-display font-bold text-sm leading-tight truncate">
                        {game?.name ?? room.game_type} · #{room.id}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-surface-500">
                        <Avatar src={room.host?.avatar_url ?? null} name={room.host?.username} size="xs" className="rounded-full" />
                        <span className="truncate">{room.host?.username ?? tCommon("host")}</span>
                        <span className="text-surface-700">·</span>
                        <span>{t("playersInRoom", { count: room.player_count })}</span>
                      </div>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-emerald-950/40 text-emerald-400 border border-emerald-700/30 font-semibold shrink-0">
                      {t("join")}
                    </span>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <SectionHeader emoji="🔥" title={t("trendingPresets")} subtitle={t("trendingSubtitle")} />
        {trending.length === 0 ? (
          <p className="text-surface-600 text-sm text-center py-6">{t("noTrending")}</p>
        ) : (
          <div className="space-y-2">
            {trending.map((p, i) => {
              const game = gameMap.get(p.game_type);
              return (
                <motion.div
                  key={p.id}
                  initial={i < 4 ? { opacity: 0, x: -8 } : false}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <Link
                    href={`/presets/${p.id}`}
                    className="flex items-center gap-3 p-3 rounded-2xl border border-surface-800/50 bg-surface-900/40 hover:border-brand-700/40 transition-colors"
                  >
                    <div className="text-amber-400 font-display font-black text-lg w-6 text-center shrink-0">#{i + 1}</div>
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-surface-800 shrink-0 relative">
                      {p.cover_url ? (
                        <Image src={p.cover_url} alt={p.name} fill className="object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xl">{game?.icon ?? "🎮"}</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-sm truncate">{p.name}</p>
                      <p className="text-surface-500 text-xs truncate">
                        {game?.name ?? p.game_type} · {t("by")} {p.author?.username ?? tCommon("anonymous")}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-brand-300 text-sm font-bold">▶ {p.play_count}</p>
                      <p className="text-surface-700 text-[10px]">{t("playsLabel")}</p>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>

      {!user && (
        <p className="text-surface-600 text-xs text-center pt-2">
          <Link href="/auth/login" className="text-brand-400 underline">{t("loginLink")}</Link>
          {" "}{t("ctaLogin")}
        </p>
      )}
    </div>
  );
}

function SectionHeader({ emoji, title, subtitle }: { emoji: string; title: string; subtitle?: string }) {
  return (
    <div className="flex items-baseline gap-2 mb-2 px-1">
      <span className="text-base">{emoji}</span>
      <p className="text-white font-display font-bold text-sm">{title}</p>
      {subtitle && <p className="text-surface-600 text-[11px] ml-1">· {subtitle}</p>}
    </div>
  );
}

function SkeletonExplore() {
  return (
    <div className="space-y-5">
      <section>
        <div className="h-3 w-32 rounded bg-surface-800 mb-3 animate-pulse" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-2xl border border-surface-800/40 bg-surface-900/30 animate-pulse">
              <div className="w-11 h-11 rounded-xl bg-surface-800 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-surface-800 rounded w-2/3" />
                <div className="h-2 bg-surface-800/60 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </section>
      <section>
        <div className="h-3 w-40 rounded bg-surface-800 mb-3 animate-pulse" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-2xl border border-surface-800/40 bg-surface-900/30 animate-pulse">
              <div className="w-6 h-3 bg-surface-800 rounded shrink-0" />
              <div className="w-12 h-12 rounded-xl bg-surface-800 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-surface-800 rounded w-3/4" />
                <div className="h-2 bg-surface-800/60 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
