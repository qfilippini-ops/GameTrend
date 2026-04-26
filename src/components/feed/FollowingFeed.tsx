"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations, useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Avatar from "@/components/ui/Avatar";
import CreatorBadge from "@/components/premium/CreatorBadge";
import AdSlot from "@/components/ads/AdSlot";
import { useFeedCache, type FeedTabState } from "@/components/feed/FeedCacheContext";
import { GAMES_REGISTRY } from "@/games/registry";
import { useSubscription } from "@/hooks/useSubscription";
import { NaviMarkdown } from "@/components/ui/NaviMarkdown";
import { PostReactions } from "@/components/feed/PostReactions";
import { PostComments } from "@/components/feed/PostComments";
import { DeletePostMenu } from "@/components/feed/DeletePostMenu";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

const PAGE_SIZE = 10;

export interface PresetPayload {
  id: string;
  name: string;
  description: string | null;
  game_type: string;
  cover_url: string | null;
  play_count: number;
  // Compteurs sociaux (post_reactions / post_comments — INDÉPENDANTS des
  // favoris preset_likes). Peuvent être absents pour les anciens payloads.
  like_count?: number;
  dislike_count?: number;
  comment_count?: number;
}

export interface ResultPayload {
  id: string;
  game_type: string;
  preset_id: string | null;
  preset_name: string | null;
  result_data: Record<string, unknown>;
  // Compteurs sociaux (peuvent être absents pour les anciens payloads).
  like_count?: number;
  dislike_count?: number;
  comment_count?: number;
}

export interface FeedItem {
  type: "preset" | "result";
  /** Identifiant React unique (préfixé pour éviter collision entre tables). */
  key: string;
  created_at: string;
  author: {
    id: string;
    username: string | null;
    avatar_url: string | null;
    subscription_status?: string | null;
  };
  data: PresetPayload | ResultPayload;
}

/** Shape brut renvoyé par les RPC feed (get_following_feed, get_user_activity_feed). */
export interface RpcRow {
  item_type: "preset" | "result";
  item_id: string;
  created_at: string;
  author_id: string;
  author_username: string | null;
  author_avatar_url: string | null;
  author_subscription_status?: string | null;
  payload: PresetPayload | ResultPayload;
}

export function rpcRowToFeedItem(r: RpcRow): FeedItem {
  return rowToItem(r);
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
      subscription_status: r.author_subscription_status ?? null,
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
  const { isPremium } = useSubscription();
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
  /** Keys d'items supprimés localement (filtrés au rendu, mémoire seulement). */
  const [deletedKeys, setDeletedKeys] = useState<Set<string>>(new Set());

  // Callback transmis aux cards pour retirer une publication après suppression.
  const handleDeleted = useCallback((key: string) => {
    setDeletedKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  // Pull-to-refresh : recharge la première page et remplace `items`.
  const refresh = useCallback(async () => {
    try {
      const rows = await fetchFeedRef.current?.(null);
      if (!rows) return;
      const fresh = rows.map(rowToItem);
      setItems(fresh);
      setHasMore(rows.length >= PAGE_SIZE);
      setPendingNew([]);
      setDeletedKeys(new Set());
      cache.setState<FeedItem, FollowingMeta>("following", {
        items: fresh,
        lastFetchAt: Date.now(),
        scrollY: 0,
        hasMore: rows.length >= PAGE_SIZE,
        lastCursor: fresh[fresh.length - 1]?.created_at ?? null,
        meta: { followingCount: Math.max(followingCount, 1) },
      });
    } catch (e) {
      console.error("[FollowingFeed] refresh", e);
    }
  }, [cache, followingCount]);

  // useRef pour exposer fetchFeed à `refresh` sans re-créer la closure.
  const fetchFeedRef = useRef<((before: string | null) => Promise<RpcRow[]>) | null>(null);

  const ptr = usePullToRefresh({ onRefresh: refresh });

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  /** Items courants en ref pour éviter les stale closures dans les fetchs async. */
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // ─── Deep-link via hash (#result-{id}) ─────────────────────────────────────
  // Permet aux notifications "Outbid partage" d'amener l'utilisateur
  // directement sur la card concernée. Scroll + flash de surbrillance.
  // On observe `items` (card potentiellement pas encore rendue) ET on
  // écoute `hashchange` (navigation depuis la page feed elle-même).
  const lastHandledHashRef = useRef<string>("");

  const handleHash = useCallback(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    const el = document.getElementById(hash);
    if (!el) return;
    if (lastHandledHashRef.current === hash) return;
    lastHandledHashRef.current = hash;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add(
      "ring-2",
      "ring-violet-400/80",
      "transition-shadow",
      "duration-700"
    );
    setTimeout(() => {
      el.classList.remove("ring-2", "ring-violet-400/80");
    }, 2200);
  }, []);

  useEffect(() => {
    handleHash();
  }, [items, handleHash]);

  useEffect(() => {
    const onHash = () => {
      lastHandledHashRef.current = "";
      handleHash();
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [handleHash]);

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
  // Expose à la closure de `refresh` (pull-to-refresh).
  useEffect(() => {
    fetchFeedRef.current = fetchFeed;
  }, [fetchFeed]);

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
    <div
      className="space-y-5 relative"
      onTouchStart={ptr.bind.onTouchStart}
      onTouchMove={ptr.bind.onTouchMove}
      onTouchEnd={ptr.bind.onTouchEnd}
    >
      {/* Indicateur pull-to-refresh : monte/descend avec le pull */}
      <motion.div
        animate={{
          height: ptr.refreshing ? 36 : ptr.pullPx > 0 ? Math.min(ptr.pullPx, 90) : 0,
          opacity: ptr.refreshing || ptr.pullPx > 0 ? 1 : 0,
        }}
        transition={{ duration: 0.12 }}
        className="flex items-center justify-center overflow-hidden text-xs text-brand-300 -mt-2"
      >
        {ptr.refreshing ? (
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-3.5 h-3.5 border-2 border-brand-500/40 border-t-brand-300 rounded-full animate-spin" />
            {t("refreshing")}
          </span>
        ) : ptr.pullPx >= 80 ? (
          <span>↑ {t("releaseToRefresh")}</span>
        ) : (
          <span>↓ {t("pullToRefresh")}</span>
        )}
      </motion.div>

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

      {items
        .filter((item) => !deletedKeys.has(item.key))
        .map((item, i) => (
          <div key={item.key}>
            <motion.div
              initial={i < 3 ? { opacity: 0, y: 8 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.4) }}
            >
              {item.type === "preset" ? (
                <PresetFeedCard
                  item={item}
                  data={item.data as PresetPayload}
                  t={t}
                  tTime={tTime}
                  tCommon={tCommon}
                  locale={locale}
                  currentUserId={user?.id ?? null}
                  onDeleted={() => handleDeleted(item.key)}
                />
              ) : (
                <ResultFeedCard
                  item={item}
                  data={item.data as ResultPayload}
                  t={t}
                  tTime={tTime}
                  tCommon={tCommon}
                  locale={locale}
                  currentUserId={user?.id ?? null}
                  isPremium={isPremium}
                  onDeleted={() => handleDeleted(item.key)}
                />
              )}
            </motion.div>
            {/* Ad inline tous les 8 items pour les non-premium */}
            {(i + 1) % 8 === 0 && i < items.length - 1 && (
              <div className="mt-3">
                <AdSlot placement="feed-inline" index={Math.floor(i / 8)} />
              </div>
            )}
          </div>
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

export type FeedT = ReturnType<typeof useTranslations<"feed">>;
export type CommonT = ReturnType<typeof useTranslations<"common">>;
export type TimeT = ReturnType<typeof useTranslations<"time">>;

export function PresetFeedCard({ item, data, t, tTime, tCommon, locale, currentUserId, onDeleted }: { item: FeedItem; data: PresetPayload; t: FeedT; tTime: TimeT; tCommon: CommonT; locale: string; currentUserId: string | null; onDeleted: () => void }) {
  const isMine = currentUserId === item.author.id;
  const [commentCount, setCommentCount] = useState<number>(data.comment_count ?? 0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const anchorId = item.key;

  return (
    <div
      id={anchorId}
      data-feed-anchor={anchorId}
      className="rounded-2xl border border-surface-800/50 bg-surface-900/40 overflow-hidden hover:border-brand-700/40 transition-colors scroll-mt-24"
    >
      <FeedHeader
        author={item.author}
        action={t("actions.publishedPreset")}
        date={item.created_at}
        icon="✨"
        tTime={tTime}
        tCommon={tCommon}
        locale={locale}
        actions={
          isMine ? (
            <DeletePostMenu kind="preset" postId={data.id} onDeleted={onDeleted} />
          ) : null
        }
      />
      <Link href={`/presets/${data.id}`} className="block hover:bg-surface-900/30 transition-colors">
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

      {/* ─── Footer social : réactions + commentaires ──────────────────── */}
      <div className="px-3 py-2 border-t border-surface-800/40 flex items-center gap-2 flex-wrap">
        <PostReactions
          postType="preset"
          postId={data.id}
          initialLikeCount={data.like_count ?? 0}
          initialDislikeCount={data.dislike_count ?? 0}
          initialUserReaction={null}
          canReact={!!currentUserId}
          size="sm"
        />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setCommentsOpen((v) => !v);
          }}
          className="ml-auto inline-flex items-center gap-1.5 text-xs font-bold py-1 px-2.5 rounded-full bg-surface-900/40 border border-surface-700/60 text-surface-300 hover:bg-surface-800/60 hover:text-brand-200 transition-colors"
          aria-expanded={commentsOpen}
        >
          <span aria-hidden>💬</span>
          <span className="font-mono tabular-nums">{commentCount}</span>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {commentsOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden border-t border-surface-800/40"
          >
            <div className="p-3">
              <PostComments
                postType="preset"
                postId={data.id}
                currentUserId={currentUserId}
                postAuthorId={item.author.id}
                onCountChange={(delta) =>
                  setCommentCount((c) => Math.max(0, c + delta))
                }
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface ParticipantRef {
  name: string;
  user_id?: string | null;
  avatar_url?: string | null;
}

interface BlindRankRankItem {
  name: string;
  position: number;
  imageUrl?: string | null;
}

interface OutbidTeamCard {
  name: string;
  imageUrl?: string | null;
  price: number;
}
interface OutbidPlayerSnapshot {
  name: string;
  points: number;
  team: OutbidTeamCard[];
}
interface NaviVerdictPayload {
  verdict: string;
  authorName: string;
  locale?: string;
}

export function ResultFeedCard({ item, data, t, tTime, tCommon, locale, currentUserId, isPremium, onDeleted }: { item: FeedItem; data: ResultPayload; t: FeedT; tTime: TimeT; tCommon: CommonT; locale: string; currentUserId: string | null; isPremium: boolean; onDeleted: () => void }) {
  // Compteurs sociaux locaux : on les initialise depuis le payload puis on
  // les ajuste à la volée quand l'utilisateur commente ou interagit.
  const [commentCount, setCommentCount] = useState<number>(data.comment_count ?? 0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const isMine = currentUserId === item.author.id;
  const { game_type, preset_id, preset_name, result_data } = data;
  const rd = (result_data ?? {}) as Record<string, unknown>;
  const champion = rd.champion as { name: string; imageUrl?: string | null } | undefined;
  const winnerLabel = rd.winnerLabel as string | undefined;
  const blindrankTop3 = (rd.top3 as BlindRankRankItem[] | undefined) ?? null;
  const blindrankRackSize = typeof rd.rackSize === "number" ? rd.rackSize : null;
  const participants = (rd.participants as ParticipantRef[] | undefined) ?? null;
  const isOnline = rd.online === true;
  const tGames = useTranslations("games");
  const tNavi = useTranslations("games.outbid.online.navi");

  const isBlindRank = game_type === "blindrank";
  const isGhost = game_type === "ghostword";
  const isDyp = game_type === "dyp";
  const isOutbid = game_type === "outbid";

  const outbidPlayerA = isOutbid
    ? (rd.playerA as OutbidPlayerSnapshot | undefined) ?? null
    : null;
  const outbidPlayerB = isOutbid
    ? (rd.playerB as OutbidPlayerSnapshot | undefined) ?? null
    : null;
  const naviVerdict = isOutbid
    ? (rd.naviVerdict as NaviVerdictPayload | null | undefined) ?? null
    : null;

  const gameMeta = GAMES_REGISTRY.find((g) => g.id === game_type);
  const gameName = gameMeta?.name ?? game_type;
  const gameIcon = gameMeta?.icon ?? "🎮";

  // Outbid : pas de titre redondant, l'aperçu visuel + bandeau participants
  // se suffisent à eux-mêmes.
  const titleSuffix =
    isGhost ? `${tGames("ghostword.result.victory")} ${winnerLabel ?? "?"}` :
    isDyp ? `${tGames("dyp.play.champion")} : ${champion?.name ?? "?"}` :
    isBlindRank && blindrankTop3 && blindrankTop3[0] ?
      tGames("blindrank.feed.topShare", { name: blindrankTop3[0].name }) :
    isOutbid ? null :
    t("actions.sharedResult");

  const inner = (
    <>
      <FeedHeader
        author={item.author}
        action={t("actions.sharedResult")}
        date={item.created_at}
        icon="🏆"
        tTime={tTime}
        tCommon={tCommon}
        locale={locale}
        actions={
          isMine ? (
            <DeletePostMenu kind="result" postId={data.id} onDeleted={onDeleted} />
          ) : null
        }
      />

      {/* Badge jeu : identifie clairement le jeu joué (online ou solo) */}
      <div className="px-3 pt-2.5 -mb-1 flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-brand-950/60 text-brand-300 border border-brand-700/30">
          <span className="text-xs">{gameIcon}</span>
          {gameName}
        </span>
        {isOnline && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-950/50 text-emerald-400 border border-emerald-700/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            {t("onlineBadge")}
          </span>
        )}
      </div>

      {/* Bandeau participants (parties online) */}
      {participants && participants.length > 0 && (
        <ParticipantsBanner participants={participants} t={t} />
      )}

      <div className="px-3 py-3">
        {titleSuffix && (
          <p className="text-white font-display font-bold text-sm leading-tight">{titleSuffix}</p>
        )}
        {preset_name && (
          <p className="text-surface-500 text-xs mt-0.5">{tGames("ghostword.result.withPreset", { name: preset_name })}</p>
        )}
        {champion?.imageUrl && (
          <div className="relative w-full h-32 mt-3 rounded-xl overflow-hidden bg-surface-800">
            <Image src={champion.imageUrl} alt={champion.name} fill className="object-cover" />
          </div>
        )}

        {/* Aperçu duel Outbid : 2 mini-équipes côte à côte */}
        {isOutbid && outbidPlayerA && outbidPlayerB && (
          <OutbidTeamsPreview
            playerA={outbidPlayerA}
            playerB={outbidPlayerB}
          />
        )}

        {/* Avis de Navi : toujours visible pour Outbid (verdict ou bouton) */}
        {isOutbid && (
          <NaviSection
            verdict={naviVerdict}
            resultId={data.id}
            participants={participants}
            currentUserId={currentUserId}
            isPremium={isPremium}
            locale={locale}
            t={tNavi}
          />
        )}

        {/* Aperçu classement Blind Rank */}
        {isBlindRank && blindrankTop3 && blindrankTop3.length > 0 && (
          <div className="mt-3 rounded-xl border border-cyan-700/25 bg-cyan-950/20 overflow-hidden">
            <div className="divide-y divide-surface-800/30">
              {blindrankTop3.slice(0, 3).map((c) => {
                const medal = c.position === 1 ? "🥇" : c.position === 2 ? "🥈" : c.position === 3 ? "🥉" : `#${c.position}`;
                return (
                  <div key={`${c.position}-${c.name}`} className="flex items-center gap-2.5 px-3 py-2">
                    <span className="text-base shrink-0 w-6 text-center">{medal}</span>
                    {c.imageUrl ? (
                      <div className="relative w-7 h-7 rounded-md overflow-hidden border border-surface-700/40 shrink-0">
                        <Image src={c.imageUrl} alt={c.name} fill className="object-cover" />
                      </div>
                    ) : (
                      <div className="w-7 h-7 rounded-md bg-surface-800/60 shrink-0" />
                    )}
                    <span className={`flex-1 text-xs truncate ${c.position === 1 ? "text-cyan-200 font-bold" : "text-surface-200"}`}>
                      {c.name}
                    </span>
                  </div>
                );
              })}
            </div>
            {blindrankRackSize && blindrankRackSize > 3 && (
              <p className="px-3 py-1.5 text-[10px] text-cyan-500/70 text-center bg-cyan-950/30 border-t border-cyan-700/20">
                {tGames("blindrank.feed.moreRanks", { count: blindrankRackSize - 3 })}
              </p>
            )}
          </div>
        )}

        {/* Lien optionnel "Voir le preset" si la partie est rattachée à un */}
        {preset_id && (
          <Link
            href={`/presets/${preset_id}`}
            className="mt-3 inline-flex items-center gap-1 text-brand-300 text-xs font-bold hover:text-brand-200"
          >
            {t("viewPresetLink")} →
          </Link>
        )}
      </div>

      {/* ─── Footer social : réactions + commentaires ──────────────────── */}
      <div className="px-3 py-2 border-t border-surface-800/40 flex items-center gap-2 flex-wrap">
        <PostReactions
          postType="result"
          postId={data.id}
          initialLikeCount={data.like_count ?? 0}
          initialDislikeCount={data.dislike_count ?? 0}
          initialUserReaction={null}
          canReact={!!currentUserId}
          size="sm"
        />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setCommentsOpen((v) => !v);
          }}
          className="ml-auto inline-flex items-center gap-1.5 text-xs font-bold py-1 px-2.5 rounded-full bg-surface-900/40 border border-surface-700/60 text-surface-300 hover:bg-surface-800/60 hover:text-brand-200 transition-colors"
          aria-expanded={commentsOpen}
        >
          <span aria-hidden>💬</span>
          <span className="font-mono tabular-nums">{commentCount}</span>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {commentsOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden border-t border-surface-800/40"
          >
            <div className="p-3">
              <PostComments
                postType="result"
                postId={data.id}
                currentUserId={currentUserId}
                postAuthorId={item.author.id}
                onCountChange={(delta) =>
                  setCommentCount((c) => Math.max(0, c + delta))
                }
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  // L'id permet le deep-link `/feed#result-{id}` depuis les notifications.
  // L'attribut data-feed-anchor sert à appliquer le highlight transitoire.
  const anchorId = item.key;

  return (
    <div
      id={anchorId}
      data-feed-anchor={anchorId}
      className="rounded-2xl border border-surface-800/50 bg-surface-900/40 overflow-hidden scroll-mt-24"
    >
      {inner}
    </div>
  );
}

// ─── Aperçu équipes Outbid (avec dépliage) ────────────────────────────────
// Affiche les 2 équipes du duel Outbid en grille compacte. Par défaut on
// montre les 3 premières cartes pour garder l'aperçu léger ; un bouton
// "+N voir tout / réduire" déplie le reste pour les équipes 4-11 cartes.
// Les deux équipes se déplient en même temps (état partagé) pour rester
// visuellement symétriques.
function OutbidTeamsPreview({
  playerA,
  playerB,
}: {
  playerA: OutbidPlayerSnapshot;
  playerB: OutbidPlayerSnapshot;
}) {
  const tFeed = useTranslations("games.outbid.feed");
  const [expanded, setExpanded] = useState(false);
  // Nombre de cartes du plus gros des deux côtés. Si aucun joueur n'a
  // plus de 3 cartes, le bouton n'a pas lieu d'exister.
  const maxTeamSize = Math.max(playerA.team.length, playerB.team.length);
  const hasMore = maxTeamSize > 3;

  return (
    <div className="mt-3">
      <div className="grid grid-cols-2 gap-2">
        {[playerA, playerB].map((p) => {
          const visibleCards = expanded ? p.team : p.team.slice(0, 3);
          // On garde toujours une grille à 3 colonnes pour l'alignement
          // visuel, et on remplit avec des cellules vides si besoin.
          // Quand on déplie, on n'affiche pas de cellules vides (pas
          // de remplissage artificiel).
          const fillerCount = expanded ? 0 : Math.max(0, 3 - p.team.length);
          return (
            <div
              key={p.name}
              className="rounded-xl border border-amber-700/25 bg-amber-950/15 overflow-hidden"
            >
              <div className="px-2 py-1.5 border-b border-amber-800/30 flex items-baseline justify-between">
                <span className="text-amber-300 text-[11px] font-bold truncate">
                  {p.name}
                </span>
                <span className="text-surface-500 text-[9px] font-mono shrink-0 ml-1">
                  {p.team.length} · {(100000 - p.points).toLocaleString("fr-FR")}pts
                </span>
              </div>
              <div className="p-1.5 grid grid-cols-3 gap-1">
                {visibleCards.map((c, i) => (
                  <div
                    key={`${c.name}-${i}`}
                    className="relative aspect-[3/4] rounded-md overflow-hidden ring-1 ring-amber-700/30"
                    title={`${c.name} — ${c.price}pts`}
                  >
                    {c.imageUrl ? (
                      <Image
                        src={c.imageUrl}
                        alt={c.name}
                        fill
                        sizes="60px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-amber-900/60 to-surface-900" />
                    )}
                  </div>
                ))}
                {Array.from({ length: fillerCount }).map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="aspect-[3/4] rounded-md bg-surface-800/40"
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={(e) => {
            // La carte du feed est cliquable (lien vers le preset/post),
            // il faut donc absolument stopper la propagation pour que le
            // clic sur ce bouton ne déclenche pas la navigation parente.
            e.stopPropagation();
            e.preventDefault();
            setExpanded((v) => !v);
          }}
          className="mt-2 w-full py-1.5 px-3 rounded-lg text-[11px] font-bold text-amber-300 bg-amber-950/20 border border-amber-700/30 hover:bg-amber-900/30 hover:border-amber-600/50 transition-colors flex items-center justify-center gap-1.5"
        >
          {expanded ? (
            <>
              <span>▴</span>
              <span>{tFeed("collapseTeams")}</span>
            </>
          ) : (
            <>
              <span>▾</span>
              <span>{tFeed("expandTeams", { count: maxTeamSize })}</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}

// ─── Section Navi (toujours visible pour Outbid) ──────────────────────────
// Affiche soit le verdict de Navi (accordéon plié par défaut), soit un
// bouton « Départager avec Navi » pour les participants premium qui
// peuvent demander un verdict rétroactivement. Pour les non-premium, le
// bouton ouvre une modal d'upsell. Pour les non-participants sans verdict,
// on affiche juste un placeholder discret.
function NaviSection({
  verdict,
  resultId,
  participants,
  currentUserId,
  isPremium,
  locale,
  t,
}: {
  verdict: NaviVerdictPayload | null;
  resultId: string;
  participants: ParticipantRef[] | null;
  currentUserId: string | null;
  isPremium: boolean;
  locale: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const router = useRouter();
  const [localVerdict, setLocalVerdict] = useState<NaviVerdictPayload | null>(
    verdict
  );
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpsell, setShowUpsell] = useState(false);

  // Si la prop change (refetch du feed), on resync.
  useEffect(() => {
    setLocalVerdict(verdict);
  }, [verdict]);

  const isParticipant = !!(
    currentUserId &&
    participants?.some((p) => p.user_id === currentUserId)
  );

  async function requestVerdict(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (loading) return;
    if (!isPremium) {
      setShowUpsell(true);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/games/outbid/navi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resultId, locale }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        navi?: NaviVerdictPayload;
        error?: string;
        detail?: string;
      };
      if (!res.ok) {
        const detail = json.detail ? ` — ${json.detail}` : "";
        setError(`${json.error ?? "unknown_error"}${detail}`);
      } else if (json.navi) {
        setLocalVerdict(json.navi);
        setOpen(true);
      }
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setLoading(false);
    }
  }

  // ── Cas 1 : verdict disponible → accordéon ─────────────────────────────
  if (localVerdict) {
    return (
      <div
        className="mt-3 rounded-xl border border-violet-700/40 bg-gradient-to-br from-violet-950/50 via-surface-900/50 to-surface-950 overflow-hidden"
        style={{ boxShadow: "0 0 18px rgba(139,92,246,0.15)" }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          className="w-full px-3 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-violet-900/20 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base shrink-0">🤖</span>
            <div className="min-w-0">
              <p className="text-violet-200 text-xs font-bold truncate">
                {t("verdictTitle")}
              </p>
              <p className="text-violet-400/70 text-[10px] truncate">
                {t("requestedBy", { name: localVerdict.authorName })}
              </p>
            </div>
          </div>
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-violet-300 text-sm shrink-0"
            aria-hidden
          >
            ▾
          </motion.span>
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="overflow-hidden"
            >
              <div className="px-3 pb-3 pt-1 border-t border-violet-800/40">
                <NaviMarkdown content={localVerdict.verdict} className="text-xs" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ── Cas 2 : pas de verdict, l'utilisateur n'est pas participant ───────
  // On reste discret : un en-tête neutre signale juste l'option Navi.
  if (!isParticipant) {
    return (
      <div
        className="mt-3 rounded-xl border border-violet-800/30 bg-violet-950/15 px-3 py-2.5"
        style={{ boxShadow: "0 0 14px rgba(139,92,246,0.08)" }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base shrink-0 opacity-60">🤖</span>
          <div className="min-w-0">
            <p className="text-violet-200/80 text-xs font-bold truncate">
              {t("verdictTitle")}
            </p>
            <p className="text-violet-400/60 text-[10px] truncate">
              {t("notRequestedYet")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Cas 3 : participant, pas de verdict → bouton (premium ou upsell) ──
  return (
    <>
      <div
        className="mt-3 rounded-xl border border-violet-700/40 bg-violet-950/20 p-2.5"
        style={{ boxShadow: "0 0 18px rgba(139,92,246,0.12)" }}
      >
        <div className="flex items-center gap-2 mb-2 min-w-0">
          <span className="text-sm shrink-0">🤖</span>
          <p className="text-violet-200 text-xs font-bold truncate">
            {t("verdictTitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={requestVerdict}
          disabled={loading}
          className="w-full py-2.5 px-3 rounded-lg font-display font-bold text-xs bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:opacity-92 transition-all disabled:opacity-60 flex items-center justify-center gap-1.5"
          style={{ boxShadow: "0 0 16px rgba(139,92,246,0.3)" }}
        >
          {loading ? (
            <>
              <span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              <span>{t("loading")}</span>
            </>
          ) : (
            <>
              <span>{t("button")}</span>
              {!isPremium && <span className="text-[10px] opacity-90">🔒</span>}
            </>
          )}
        </button>
        {!isPremium && (
          <p className="text-violet-300/80 text-[10px] text-center mt-1.5">
            {t("premiumHint")}
          </p>
        )}
        {error && (
          <p className="text-rose-400 text-[10px] text-center mt-1.5 font-mono break-all">
            {t("error", { msg: error })}
          </p>
        )}
      </div>

      <AnimatePresence>
        {showUpsell && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowUpsell(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border border-violet-700/50 bg-gradient-to-b from-violet-950/90 to-surface-950 p-6 space-y-4"
              style={{ boxShadow: "0 0 60px rgba(139,92,246,0.4)" }}
            >
              <div className="text-center space-y-2">
                <div className="text-4xl">🤖</div>
                <h3 className="text-white font-display font-black text-lg">
                  {t("upsellTitle")}
                </h3>
                <p className="text-surface-300 text-sm">{t("upsellBody")}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowUpsell(false);
                  }}
                  className="py-2.5 rounded-xl border border-surface-700/50 bg-surface-800/60 text-surface-200 text-sm font-bold hover:border-surface-500/60 transition-colors"
                >
                  {t("upsellCancel")}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowUpsell(false);
                    router.push("/premium");
                  }}
                  className="py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-sm font-bold hover:opacity-92 transition-opacity"
                >
                  {t("upsellCta")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function ParticipantsBanner({ participants, t }: { participants: ParticipantRef[]; t: FeedT }) {
  // Évite les <a> imbriqués (la card parente est déjà un Link). On navigue
  // manuellement via useRouter avec preventDefault/stopPropagation.
  const router = useRouter();
  return (
    <div className="px-3 py-2 border-b border-surface-800/40 bg-surface-900/40">
      <p className="text-[9px] uppercase tracking-widest text-surface-600 font-mono mb-1.5">
        {t("participantsLabel", { count: participants.length })}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {participants.map((p) => {
          const chip = (
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-surface-700/40 bg-surface-800/60 text-[11px] font-medium text-surface-200 hover:border-brand-700/40 hover:text-white transition-colors">
              <Avatar src={p.avatar_url ?? null} name={p.name} size="xs" className="rounded-full !w-4 !h-4 text-[8px]" />
              {p.name}
            </span>
          );
          if (!p.user_id) return <span key={p.name}>{chip}</span>;
          return (
            <button
              key={`${p.user_id}-${p.name}`}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                router.push(`/profile/${p.user_id}`);
              }}
              className="appearance-none"
            >
              {chip}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FeedHeader({ author, action, date, icon, tTime, tCommon, locale, actions }: { author: FeedItem["author"]; action: string; date: string; icon: string; tTime: TimeT; tCommon: CommonT; locale: string; actions?: React.ReactNode }) {
  // Le bloc auteur est cliquable (lien profil) mais on isole le slot d'actions
  // (DeletePostMenu, etc.) à droite pour qu'il reste interactif sans
  // déclencher la navigation parente.
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-surface-800/40">
      <Link href={`/profile/${author.id}`} className="flex items-center gap-2.5 flex-1 min-w-0 -my-2.5 py-2.5 hover:bg-surface-800/20 transition-colors rounded">
        <Avatar src={author.avatar_url} name={author.username} size="sm" className="rounded-full shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-surface-300 truncate flex items-center gap-1">
            <span className="font-semibold text-white truncate">{author.username ?? tCommon("player")}</span>
            <CreatorBadge status={author.subscription_status ?? null} />
            <span className="text-surface-500 truncate">{action}</span>
          </p>
          <p className="text-surface-700 text-[10px]">{relativeTime(date, tTime, locale)}</p>
        </div>
      </Link>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-base">{icon}</span>
        {actions}
      </div>
    </div>
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
