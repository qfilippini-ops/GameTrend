"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations, useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import {
  PresetFeedCard,
  ResultFeedCard,
  rpcRowToFeedItem,
  type FeedItem,
  type RpcRow,
  type PresetPayload,
  type ResultPayload,
} from "@/components/feed/FollowingFeed";

const PAGE_SIZE = 10;

// Feed d'activité d'un utilisateur précis (page profil). Réutilise les mêmes
// `PresetFeedCard` / `ResultFeedCard` que le feed général. Le RPC sous-jacent
// est `get_user_activity_feed(p_user_id, before_at, page_size)`.

interface UserActivityFeedProps {
  userId: string;
}

export default function UserActivityFeed({ userId }: UserActivityFeedProps) {
  const t = useTranslations("feed");
  const tCommon = useTranslations("common");
  const tTime = useTranslations("time");
  const tProfile = useTranslations("profile.public");
  const locale = useLocale();
  const { user, loading: authLoading } = useAuth();
  const { isPremium } = useSubscription();

  const [items, setItems] = useState<FeedItem[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletedKeys, setDeletedKeys] = useState<Set<string>>(new Set());

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const fetchPage = useCallback(
    async (beforeAt: string | null): Promise<RpcRow[]> => {
      const supabase = createClient();
      const { data, error: rpcErr } = await supabase.rpc(
        "get_user_activity_feed",
        {
          p_user_id: userId,
          before_at: beforeAt,
          page_size: PAGE_SIZE,
        }
      );
      if (rpcErr) throw rpcErr;
      return (data ?? []) as RpcRow[];
    },
    [userId]
  );

  // ─── Initial load ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const rows = await fetchPage(null);
        if (cancelled) return;
        const fresh = rows.map(rpcRowToFeedItem);
        setItems(fresh);
        setHasMore(rows.length >= PAGE_SIZE);
        setDeletedKeys(new Set());
      } catch (e) {
        if (cancelled) return;
        console.error("[UserActivityFeed] fetch", e);
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    const last = itemsRef.current[itemsRef.current.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const rows = await fetchPage(last.created_at);
      const fresh = rows.map(rpcRowToFeedItem);
      const seen = new Set(itemsRef.current.map((i) => i.key));
      const dedup = fresh.filter((i) => !seen.has(i.key));
      setItems((prev) => [...prev, ...dedup]);
      setHasMore(rows.length >= PAGE_SIZE && dedup.length > 0);
    } catch (e) {
      console.error("[UserActivityFeed] loadMore", e);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, fetchPage]);

  useEffect(() => {
    if (!hasMore || loading) return;
    const node = sentinelRef.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "200px" }
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [hasMore, loading, loadMore]);

  const refresh = useCallback(async () => {
    try {
      const rows = await fetchPage(null);
      const fresh = rows.map(rpcRowToFeedItem);
      setItems(fresh);
      setHasMore(rows.length >= PAGE_SIZE);
      setDeletedKeys(new Set());
    } catch (e) {
      console.error("[UserActivityFeed] refresh", e);
    }
  }, [fetchPage]);

  const ptr = usePullToRefresh({ onRefresh: refresh });

  const handleDeleted = useCallback((key: string) => {
    setDeletedKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  // ─── Rendu ───────────────────────────────────────────────────────────
  if (loading || authLoading) {
    return (
      <div className="space-y-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-surface-800/50 bg-surface-900/30 h-32 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (error && items.length === 0) {
    return (
      <p className="text-rose-400 text-sm text-center py-10">{t("errorTitle")}</p>
    );
  }

  const visible = items.filter((i) => !deletedKeys.has(i.key));

  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 px-5 text-center">
        <div className="text-4xl opacity-50">🌌</div>
        <p className="text-white font-display font-bold text-base">
          {tProfile("noActivityTitle")}
        </p>
        <p className="text-surface-500 text-sm max-w-xs">
          {tProfile("noActivityText")}
        </p>
      </div>
    );
  }

  return (
    <div
      className="space-y-5 relative"
      onTouchStart={ptr.bind.onTouchStart}
      onTouchMove={ptr.bind.onTouchMove}
      onTouchEnd={ptr.bind.onTouchEnd}
    >
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

      <AnimatePresence initial={false}>
        {visible.map((item, i) => (
          <motion.div
            key={item.key}
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
        ))}
      </AnimatePresence>

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
    </div>
  );
}
