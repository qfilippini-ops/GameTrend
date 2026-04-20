"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations, useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Avatar from "@/components/ui/Avatar";
import { useFeedCache, type FeedTabState } from "@/components/feed/FeedCacheContext";

const PAGE_SIZE = 10;

interface PresetPayload {
  id: string;
  name: string;
  description: string | null;
  game_type: string;
  cover_url: string | null;
  play_count: number;
}

interface ResultPayload {
  id: string;
  game_type: string;
  preset_id: string | null;
  preset_name: string | null;
  result_data: Record<string, unknown>;
}

interface FeedItem {
  type: "preset" | "result";
  /** Identifiant React unique (préfixé pour éviter collision entre tables). */
  key: string;
  created_at: string;
  author: { id: string; username: string | null; avatar_url: string | null };
  data: PresetPayload | ResultPayload;
}

/** Shape brut renvoyé par le RPC `get_following_feed`. */
interface RpcRow {
  item_type: "preset" | "result";
  item_id: string;
  created_at: string;
  author_id: string;
  author_username: string | null;
  author_avatar_url: string | null;
  payload: PresetPayload | ResultPayload;
}

/** Métadonnées spécifiques cachées avec ce tab. */
interface FollowingMeta {
  /** -1 = pas encore vérifié, 0 = aucun follow, >0 = au moins un follow. */
  followingCount: number;
}

type CachedState = FeedTabState<FeedItem, FollowingMeta>;

function rowToItem(r: RpcRow): FeedItem {
  return {
    type: r.item_type,
    key: `${r.item_type}-${r.item_id}`,
    created_at: r.created_at,
    author: {
      id: r.author_id,
      username: r.author_username,
      avatar_url: r.author_avatar_url,
    },
    data: r.payload,
  };
}

export default function FollowingFeed() {
  const t = useTranslations("feed");
  const tCommon = useTranslations("common");
  const tTime = useTranslations("time");
  const locale = useLocale();
  const { user, loading: authLoading } = useAuth();
  const cache = useFeedCache();

  // État local hydraté depuis le cache si présent.
  const initial = cache.getState<FeedItem, FollowingMeta>("following");
  const [items, setItems] = useState<FeedItem[]>(initial?.items ?? []);
  const [hasMore, setHasMore] = useState<boolean>(initial?.hasMore ?? true);
  const [followingCount, setFollowingCount] = useState<number>(initial?.meta?.followingCount ?? -1);
  /** loading = écran initial vide (skeleton). false dès qu'on a quelque chose à montrer. */
  const [loading, setLoading] = useState<boolean>(!initial);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Items détectés par le refetch silencieux mais pas encore insérés en tête. */
  const [pendingNew, setPendingNew] = useState<FeedItem[]>([]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  /** Items courants en ref pour éviter les stale closures dans les fetchs async. */
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // ─── Fetch primitif ────────────────────────────────────────────────────────
  const fetchFeed = useCallback(
    async (beforeAt: string | null): Promise<RpcRow[]> => {
      const supabase = createClient();
      const { data, error: rpcErr } = await supabase.rpc("get_following_feed", {
        before_at: beforeAt,
        page_size: PAGE_SIZE,
      });
      if (rpcErr) throw rpcErr;
      return (data ?? []) as RpcRow[];
    },
    []
  );

  // ─── Persistance dans le cache ─────────────────────────────────────────────
  const persist = useCallback(
    (next: Partial<CachedState>) => {
      const prev = cache.getState<FeedItem, FollowingMeta>("following");
      cache.setState<FeedItem, FollowingMeta>("following", {
        items: next.items ?? prev?.items ?? itemsRef.current,
        lastFetchAt: next.lastFetchAt ?? prev?.lastFetchAt ?? Date.now(),
        scrollY: next.scrollY ?? prev?.scrollY ?? 0,
        hasMore: next.hasMore ?? prev?.hasMore ?? hasMore,
        lastCursor: next.lastCursor ?? prev?.lastCursor ?? null,
        meta: next.meta ?? prev?.meta,
      });
    },
    [cache, hasMore]
  );

  // ─── Première fetch (ou refetch silencieux si cache stale) ─────────────────
  useEffect(() => {
    if (authLoading) return;
    if (!user || user.is_anonymous) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const cached = cache.getState<FeedItem, FollowingMeta>("following");
    const stale = cache.isStale("following");
    const silent = !!cached && !stale ? false : !!cached; // cache présent + stale → fetch silencieux

    async function run() {
      try {
        // Compte les follows seulement si on n'a pas encore l'info
        let count = cached?.meta?.followingCount ?? -1;
        if (count < 0) {
          const supabase = createClient();
          const { count: c } = await supabase
            .from("follows")
            .select("following_id", { count: "exact", head: true })
            .eq("follower_id", user!.id);
          if (cancelled) return;
          count = c ?? 0;
          setFollowingCount(count);
          if (count === 0) {
            setLoading(false);
            persist({
              items: [],
              hasMore: false,
              lastCursor: null,
              lastFetchAt: Date.now(),
              meta: { followingCount: 0 },
            });
            return;
          }
        }

        if (count === 0) {
          setLoading(false);
          return;
        }

        const rows = await fetchFeed(null);
        if (cancelled) return;

        const fresh = rows.map(rowToItem);

        if (silent && cached) {
          // Refetch silencieux : compare avec ce qu'on a, expose les nouveaux via la pill
          const knownKeys = new Set(cached.items.map((i) => i.key));
          const newOnes = fresh.filter((i) => !knownKeys.has(i.key));
          if (newOnes.length > 0) {
            setPendingNew(newOnes);
          }
          // On met à jour le timestamp et hasMore en silence (sans toucher à la liste affichée)
          persist({
            lastFetchAt: Date.now(),
            hasMore: rows.length >= PAGE_SIZE,
          });
        } else {
          // Premier chargement (ou cache vidé)
          setItems(fresh);
          setHasMore(rows.length >= PAGE_SIZE);
          persist({
            items: fresh,
            hasMore: rows.length >= PAGE_SIZE,
            lastCursor: fresh[fresh.length - 1]?.created_at ?? null,
            lastFetchAt: Date.now(),
            meta: { followingCount: count },
          });
        }

        setError(null);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        console.error("[FollowingFeed] fetch error", e);
        // En refetch silencieux : on garde la liste affichée, on ignore l'erreur
        if (!silent) setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  // ─── Restauration du scroll au mount (si cache présent) ────────────────────
  useEffect(() => {
    const cached = cache.getState<FeedItem, FollowingMeta>("following");
    if (!cached || cached.scrollY <= 0) return;
    // requestAnimationFrame pour s'assurer que le DOM est rendu avant le scroll
    const raf = requestAnimationFrame(() => window.scrollTo(0, cached.scrollY));
    return () => cancelAnimationFrame(raf);
    // On veut le faire UNE fois au mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Sauvegarde du scroll au unmount ───────────────────────────────────────
  useEffect(() => {
    return () => {
      const cached = cache.getState<FeedItem, FollowingMeta>("following");
      if (!cached) return;
      cache.patchState<FeedItem, FollowingMeta>("following", {
        scrollY: window.scrollY,
      });
    };
  }, [cache]);

  // ─── Pagination (load more via cursor) ─────────────────────────────────────
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    const last = itemsRef.current[itemsRef.current.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const rows = await fetchFeed(last.created_at);
      const newOnes = rows.map(rowToItem);
      const seen = new Set(itemsRef.current.map((i) => i.key));
      const dedup = newOnes.filter((i) => !seen.has(i.key));
      const merged = [...itemsRef.current, ...dedup];
      setItems(merged);
      const nextHasMore = rows.length >= PAGE_SIZE && dedup.length > 0;
      setHasMore(nextHasMore);
      persist({
        items: merged,
        hasMore: nextHasMore,
        lastCursor: merged[merged.length - 1]?.created_at ?? null,
        lastFetchAt: Date.now(),
      });
    } catch (e) {
      console.error("[FollowingFeed] loadMore error", e);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, fetchFeed, persist]);

  // ─── Auto-load via IntersectionObserver ────────────────────────────────────
  useEffect(() => {
    if (!hasMore || loading) return;
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "200px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, loadMore]);

  // ─── Insertion des nouveaux items via la pill ──────────────────────────────
  const showNewPosts = useCallback(() => {
    if (pendingNew.length === 0) return;
    const merged = [...pendingNew, ...itemsRef.current];
    setItems(merged);
    setPendingNew([]);
    persist({ items: merged });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [pendingNew, persist]);

  // ─── Retry après erreur ────────────────────────────────────────────────────
  const retry = useCallback(() => {
    setError(null);
    setLoading(true);
    cache.invalidate("following");
    // Trigger un re-run du useEffect en touchant l'identité du user
    // Solution simple : on relance directement
    (async () => {
      try {
        const rows = await fetchFeed(null);
        const fresh = rows.map(rowToItem);
        setItems(fresh);
        setHasMore(rows.length >= PAGE_SIZE);
        persist({
          items: fresh,
          hasMore: rows.length >= PAGE_SIZE,
          lastCursor: fresh[fresh.length - 1]?.created_at ?? null,
          lastFetchAt: Date.now(),
          meta: { followingCount: Math.max(followingCount, 1) },
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [cache, fetchFeed, followingCount, persist]);

  // ─── Rendu ─────────────────────────────────────────────────────────────────

  // Auth en cours sans cache → skeleton
  if ((authLoading || loading) && items.length === 0 && !error) {
    return <SkeletonList />;
  }

  if (!user || user.is_anonymous) {
    return (
      <EmptyState
        icon="🔒"
        title={t("empty.loginRequired.title")}
        text={t("empty.loginRequired.text")}
        cta={{ label: t("empty.loginRequired.cta"), href: "/auth/login" }}
      />
    );
  }

  if (error && items.length === 0) {
    return <ErrorState message={t("errorTitle")} retryLabel={t("errorRetry")} onRetry={retry} />;
  }

  if (followingCount === 0) {
    return (
      <EmptyState
        icon="🌱"
        title={t("empty.noFollows.title")}
        text={t("empty.noFollows.text")}
        cta={{ label: t("empty.noFollows.cta"), href: "/presets" }}
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon="🌌"
        title={t("empty.noActivity.title")}
        text={t("empty.noActivity.text")}
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* Pill "N nouveaux posts" — sticky en haut, au-dessus de la liste */}
      <AnimatePresence>
        {pendingNew.length > 0 && (
          <motion.button
            key="new-posts-pill"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            onClick={showNewPosts}
            className="sticky top-28 z-20 mx-auto block px-4 py-2 rounded-full bg-brand-600 text-white text-xs font-bold shadow-lg glow-brand hover:bg-brand-500 transition-colors"
          >
            {t("newPosts", { count: pendingNew.length })}
          </motion.button>
        )}
      </AnimatePresence>

      {items.map((item, i) => (
        <motion.div
          key={item.key}
          initial={i < 3 ? { opacity: 0, y: 8 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: Math.min(i * 0.03, 0.4) }}
        >
          {item.type === "preset" ? (
            <PresetFeedCard item={item} data={item.data as PresetPayload} t={t} tTime={tTime} tCommon={tCommon} locale={locale} />
          ) : (
            <ResultFeedCard item={item} data={item.data as ResultPayload} t={t} tTime={tTime} tCommon={tCommon} locale={locale} />
          )}
        </motion.div>
      ))}

      {hasMore && (
        <div ref={sentinelRef} className="flex flex-col items-center gap-2 py-6">
          {loadingMore ? (
            <div className="text-2xl animate-pulse">📰</div>
          ) : (
            <button
              onClick={loadMore}
              className="px-4 py-2 rounded-xl bg-surface-800/60 hover:bg-surface-800 text-surface-300 text-sm font-medium transition-colors"
            >
              {t("loadMore")}
            </button>
          )}
        </div>
      )}

      {!hasMore && items.length >= PAGE_SIZE && (
        <p className="text-center text-surface-700 text-xs py-4">{t("allCaughtUp")}</p>
      )}
    </div>
  );
}

// ─── Sous-composants ─────────────────────────────────────────────────────────

type FeedT = ReturnType<typeof useTranslations<"feed">>;
type CommonT = ReturnType<typeof useTranslations<"common">>;
type TimeT = ReturnType<typeof useTranslations<"time">>;

function PresetFeedCard({ item, data, t, tTime, tCommon, locale }: { item: FeedItem; data: PresetPayload; t: FeedT; tTime: TimeT; tCommon: CommonT; locale: string }) {
  return (
    <Link
      href={`/presets/${data.id}`}
      className="block rounded-2xl border border-surface-800/50 bg-surface-900/40 overflow-hidden hover:border-brand-700/40 transition-colors"
    >
      <FeedHeader author={item.author} action={t("actions.publishedPreset")} date={item.created_at} icon="✨" tTime={tTime} tCommon={tCommon} locale={locale} />
      <div className="flex gap-3 p-3">
        <div className="w-20 h-20 rounded-xl overflow-hidden bg-surface-800 shrink-0 relative">
          {data.cover_url ? (
            <Image src={data.cover_url} alt={data.name} fill className="object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-2xl">🎮</div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-display font-bold text-sm leading-tight truncate">{data.name}</p>
          {data.description && (
            <p className="text-surface-400 text-xs mt-1 line-clamp-2 leading-snug">{data.description}</p>
          )}
          <p className="text-surface-600 text-[11px] mt-1.5">▶ {t("playCount", { count: data.play_count })}</p>
        </div>
      </div>
    </Link>
  );
}

function ResultFeedCard({ item, data, t, tTime, tCommon, locale }: { item: FeedItem; data: ResultPayload; t: FeedT; tTime: TimeT; tCommon: CommonT; locale: string }) {
  const { game_type, preset_id, preset_name, result_data } = data;
  const champion = (result_data as { champion?: { name: string; imageUrl?: string | null } })?.champion;
  const winnerLabel = (result_data as { winnerLabel?: string })?.winnerLabel;
  const tGames = useTranslations("games");
  const titleSuffix =
    game_type === "ghostword" ? `${tGames("ghostword.result.victory")} ${winnerLabel ?? "?"}` :
    game_type === "dyp" ? `${tGames("dyp.champion")} : ${champion?.name ?? "?"}` :
    t("actions.sharedResult");

  const inner = (
    <>
      <FeedHeader author={item.author} action={t("actions.sharedResult")} date={item.created_at} icon="🏆" tTime={tTime} tCommon={tCommon} locale={locale} />
      <div className="px-3 py-3">
        <p className="text-white font-display font-bold text-sm leading-tight">{titleSuffix}</p>
        {preset_name && (
          <p className="text-surface-500 text-xs mt-0.5">{tGames("ghostword.result.withPreset", { name: preset_name })}</p>
        )}
        {champion?.imageUrl && (
          <div className="relative w-full h-32 mt-3 rounded-xl overflow-hidden bg-surface-800">
            <Image src={champion.imageUrl} alt={champion.name} fill className="object-cover" />
          </div>
        )}
      </div>
    </>
  );

  if (preset_id) {
    return (
      <Link
        href={`/presets/${preset_id}`}
        className="block rounded-2xl border border-surface-800/50 bg-surface-900/40 overflow-hidden hover:border-brand-700/40 transition-colors"
      >
        {inner}
      </Link>
    );
  }
  return (
    <div className="rounded-2xl border border-surface-800/50 bg-surface-900/40 overflow-hidden">
      {inner}
    </div>
  );
}

function FeedHeader({ author, action, date, icon, tTime, tCommon, locale }: { author: FeedItem["author"]; action: string; date: string; icon: string; tTime: TimeT; tCommon: CommonT; locale: string }) {
  return (
    <Link href={`/profile/${author.id}`} className="flex items-center gap-2.5 px-3 py-2.5 border-b border-surface-800/40 hover:bg-surface-800/20 transition-colors">
      <Avatar src={author.avatar_url} name={author.username} size="sm" className="rounded-full shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-surface-300 truncate">
          <span className="font-semibold text-white">{author.username ?? tCommon("player")}</span>{" "}
          <span className="text-surface-500">{action}</span>
        </p>
        <p className="text-surface-700 text-[10px]">{relativeTime(date, tTime, locale)}</p>
      </div>
      <span className="text-base shrink-0">{icon}</span>
    </Link>
  );
}

function EmptyState({ icon, title, text, cta }: { icon: string; title: string; text: string; cta?: { label: string; href: string } }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 px-5 text-center">
      <div className="text-5xl opacity-50">{icon}</div>
      <p className="text-white font-display font-bold text-base">{title}</p>
      <p className="text-surface-500 text-sm max-w-xs">{text}</p>
      {cta && (
        <Link href={cta.href} className="mt-2 px-5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-500 transition-colors">
          {cta.label}
        </Link>
      )}
    </div>
  );
}

function ErrorState({ message, retryLabel, onRetry }: { message: string; retryLabel: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 px-5 text-center rounded-2xl border border-red-900/40 bg-red-950/20">
      <div className="text-4xl">⚠️</div>
      <p className="text-red-300 font-display font-bold text-sm">{message}</p>
      <button
        onClick={onRetry}
        className="mt-1 px-5 py-2 rounded-xl bg-red-900/60 hover:bg-red-800 border border-red-700/40 text-red-200 text-xs font-bold transition-colors"
      >
        {retryLabel}
      </button>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-surface-800/40 bg-surface-900/30 overflow-hidden animate-pulse"
        >
          <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-surface-800/40">
            <div className="w-8 h-8 rounded-full bg-surface-800" />
            <div className="flex-1 space-y-1.5">
              <div className="h-2.5 bg-surface-800 rounded w-2/3" />
              <div className="h-2 bg-surface-800/60 rounded w-1/4" />
            </div>
          </div>
          <div className="flex gap-3 p-3">
            <div className="w-20 h-20 rounded-xl bg-surface-800 shrink-0" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-3 bg-surface-800 rounded w-3/4" />
              <div className="h-2 bg-surface-800/60 rounded w-full" />
              <div className="h-2 bg-surface-800/60 rounded w-1/2" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function relativeTime(iso: string, tTime: TimeT, locale: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return tTime("now");
  if (m < 60) return tTime("minutesAgo", { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return tTime("hoursAgo", { n: h });
  const d = Math.floor(h / 24);
  if (d < 30) return tTime("daysAgo", { n: d });
  return new Date(iso).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US");
}
