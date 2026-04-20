"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Avatar from "@/components/ui/Avatar";

interface FeedItem {
  type: "preset" | "result";
  id: string;
  created_at: string;
  author: { id: string; username: string | null; avatar_url: string | null };
  data: PresetData | ResultData;
}

interface PresetData {
  id: string;
  name: string;
  description: string | null;
  game_type: string;
  cover_url: string | null;
  play_count: number;
}

interface ResultData {
  game_type: string;
  preset_id: string | null;
  preset_name: string | null;
  result_data: Record<string, unknown>;
}

const PAGE_SIZE = 10;
const SINCE_DAYS = 30;

export default function FollowingFeed() {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [followingCount, setFollowingCount] = useState<number | null>(null);
  const [followingIds, setFollowingIds] = useState<string[] | null>(null);
  const [profileMap, setProfileMap] = useState<Map<string, FeedItem["author"]>>(new Map());
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  /**
   * Récupère une "page" du feed antérieure à `beforeDate` (ou la 1ère page si null).
   * On surcharge volontairement à PAGE_SIZE pour chaque source : la fusion + tri
   * permet ensuite de découper proprement et garantit qu'aucun item n'est sauté.
   */
  const fetchPage = useCallback(
    async (
      ids: string[],
      pmap: Map<string, FeedItem["author"]>,
      beforeDate: string | null
    ): Promise<{ newItems: FeedItem[]; sourceFull: boolean }> => {
      const supabase = createClient();
      const since = new Date(Date.now() - SINCE_DAYS * 24 * 3600 * 1000).toISOString();

      let presetsQ = supabase
        .from("presets")
        .select(
          "id, name, description, game_type, cover_url, play_count, author_id, created_at, is_public"
        )
        .in("author_id", ids)
        .eq("is_public", true)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (beforeDate) presetsQ = presetsQ.lt("created_at", beforeDate);

      let resultsQ = supabase
        .from("game_results")
        .select(
          "id, game_type, preset_id, preset_name, result_data, user_id, created_at, is_shared"
        )
        .in("user_id", ids)
        .eq("is_shared", true)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (beforeDate) resultsQ = resultsQ.lt("created_at", beforeDate);

      const [presetsRes, resultsRes] = await Promise.all([presetsQ, resultsQ]);

      const presetItems: FeedItem[] = (presetsRes.data ?? []).map((p) => {
        const row = p as PresetData & { author_id: string; created_at: string };
        return {
          type: "preset",
          id: `preset-${row.id}`,
          created_at: row.created_at,
          author:
            pmap.get(row.author_id) ?? {
              id: row.author_id,
              username: null,
              avatar_url: null,
            },
          data: row,
        };
      });

      const resultItems: FeedItem[] = (resultsRes.data ?? []).map((r) => {
        const row = r as ResultData & { id: string; user_id: string; created_at: string };
        return {
          type: "result",
          id: `result-${row.id}`,
          created_at: row.created_at,
          author:
            pmap.get(row.user_id) ?? {
              id: row.user_id,
              username: null,
              avatar_url: null,
            },
          data: row,
        };
      });

      const merged = [...presetItems, ...resultItems].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      // Au moins une source a rendu PAGE_SIZE → potentiellement encore des items derrière
      const sourceFull =
        (presetsRes.data?.length ?? 0) >= PAGE_SIZE ||
        (resultsRes.data?.length ?? 0) >= PAGE_SIZE;

      return { newItems: merged, sourceFull };
    },
    []
  );

  // Init : charge follows + profils + 1ère page
  useEffect(() => {
    // Tant que l'auth se résout, on garde le loader (évite le flash
    // "Pas d'activité récente" / "Connexion requise" pendant ~200ms).
    if (authLoading) {
      setLoading(true);
      return;
    }

    if (!user || user.is_anonymous) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let cancelled = false;
    async function init() {
      const supabase = createClient();

      const { data: follows } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", user!.id);

      if (cancelled) return;

      const ids = (follows ?? []).map((f) => (f as { following_id: string }).following_id);
      setFollowingCount(ids.length);
      if (ids.length === 0) {
        setFollowingIds([]);
        setLoading(false);
        return;
      }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .in("id", ids);

      if (cancelled) return;

      const pmap = new Map<string, FeedItem["author"]>(
        (profiles ?? []).map((p) => [p.id, p as FeedItem["author"]])
      );
      setProfileMap(pmap);
      setFollowingIds(ids);

      const { newItems, sourceFull } = await fetchPage(ids, pmap, null);
      if (cancelled) return;

      setItems(newItems);
      setHasMore(sourceFull);
      setLoading(false);
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, fetchPage]);

  // Charge la page suivante en utilisant le dernier item visible comme cursor
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !followingIds || followingIds.length === 0) return;
    const last = items[items.length - 1];
    if (!last) return;
    setLoadingMore(true);
    const { newItems, sourceFull } = await fetchPage(followingIds, profileMap, last.created_at);
    setItems((prev) => {
      // Dédup au cas où (overlap possible entre presets et results à dates proches)
      const seen = new Set(prev.map((i) => i.id));
      const filtered = newItems.filter((i) => !seen.has(i.id));
      return [...prev, ...filtered];
    });
    setHasMore(sourceFull && newItems.length > 0);
    setLoadingMore(false);
  }, [loadingMore, hasMore, followingIds, profileMap, items, fetchPage]);

  // Auto-load via IntersectionObserver quand le sentinel est visible
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

  // Loader EN PREMIER : tant que l'auth ou le fetch initial sont en cours,
  // on n'affiche aucun message d'état vide.
  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 rounded-full border-2 border-brand-500/30 border-t-brand-400 animate-spin" />
      </div>
    );
  }

  if (!user || user.is_anonymous) {
    return (
      <EmptyState
        icon="🔒"
        title="Connexion requise"
        text="Connecte-toi pour voir le fil d'actualité de tes abonnements."
        cta={{ label: "Se connecter", href: "/auth/login" }}
      />
    );
  }

  if (followingCount === 0) {
    return (
      <EmptyState
        icon="🌱"
        title="Aucun abonnement"
        text="Suis des créateurs pour voir leur activité ici."
        cta={{ label: "Explorer les presets", href: "/presets" }}
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon="🌌"
        title="Pas d'activité récente"
        text="Tes abonnements n'ont rien publié depuis 30 jours."
      />
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: Math.min(i * 0.03, 0.4) }}
        >
          {item.type === "preset" ? (
            <PresetFeedCard item={item} data={item.data as PresetData} />
          ) : (
            <ResultFeedCard item={item} data={item.data as ResultData} />
          )}
        </motion.div>
      ))}

      {/* Sentinel pour l'infinite scroll + état de chargement */}
      {hasMore && (
        <div ref={sentinelRef} className="flex flex-col items-center gap-2 py-6">
          {loadingMore ? (
            <div className="text-2xl animate-pulse">📰</div>
          ) : (
            <button
              onClick={loadMore}
              className="px-4 py-2 rounded-xl bg-surface-800/60 hover:bg-surface-800 text-surface-300 text-sm font-medium transition-colors"
            >
              Charger plus
            </button>
          )}
        </div>
      )}

      {!hasMore && items.length >= PAGE_SIZE && (
        <p className="text-center text-surface-700 text-xs py-4">
          Tu as tout vu pour les 30 derniers jours.
        </p>
      )}
    </div>
  );
}

function PresetFeedCard({ item, data }: { item: FeedItem; data: PresetData }) {
  return (
    <Link
      href={`/presets/${data.id}`}
      className="block rounded-2xl border border-surface-800/50 bg-surface-900/40 overflow-hidden hover:border-brand-700/40 transition-colors"
    >
      <FeedHeader author={item.author} action="a publié un nouveau preset" date={item.created_at} icon="✨" />
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
          <p className="text-surface-600 text-[11px] mt-1.5">▶ {data.play_count} parties</p>
        </div>
      </div>
    </Link>
  );
}

function ResultFeedCard({ item, data }: { item: FeedItem; data: ResultData }) {
  const { game_type, preset_id, preset_name, result_data } = data;
  const champion = (result_data as { champion?: { name: string; imageUrl?: string | null } })?.champion;
  const winnerLabel = (result_data as { winnerLabel?: string })?.winnerLabel;
  const titleSuffix =
    game_type === "ghostword" ? `Victoire : ${winnerLabel ?? "?"}` :
    game_type === "dyp" ? `Champion : ${champion?.name ?? "?"}` : "A joué une partie";

  const inner = (
    <>
      <FeedHeader author={item.author} action="a partagé un résultat" date={item.created_at} icon="🏆" />
      <div className="px-3 py-3">
        <p className="text-white font-display font-bold text-sm leading-tight">{titleSuffix}</p>
        {preset_name && (
          <p className="text-surface-500 text-xs mt-0.5">avec « {preset_name} »</p>
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

function FeedHeader({ author, action, date, icon }: { author: FeedItem["author"]; action: string; date: string; icon: string }) {
  return (
    <Link href={`/profile/${author.id}`} className="flex items-center gap-2.5 px-3 py-2.5 border-b border-surface-800/40 hover:bg-surface-800/20 transition-colors">
      <Avatar src={author.avatar_url} name={author.username} size="sm" className="rounded-full shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-surface-300 truncate">
          <span className="font-semibold text-white">{author.username ?? "Joueur"}</span>{" "}
          <span className="text-surface-500">{action}</span>
        </p>
        <p className="text-surface-700 text-[10px]">{relativeTime(date)}</p>
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

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `il y a ${d}j`;
  return new Date(iso).toLocaleDateString("fr-FR");
}
