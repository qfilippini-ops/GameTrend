"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { GAMES_REGISTRY } from "@/games/registry";
import Avatar from "@/components/ui/Avatar";

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

export default function ExploreFeed() {
  const { user } = useAuth();
  const [trending, setTrending] = useState<TrendingPreset[]>([]);
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      const [presetsRes, roomsRes] = await Promise.all([
        supabase
          .from("presets")
          .select("id, name, description, game_type, cover_url, play_count, author_id")
          .eq("is_public", true)
          .order("play_count", { ascending: false })
          .limit(10),
        supabase
          .from("game_rooms")
          .select("id, game_type, host_id, created_at, phase")
          .eq("is_private", false)
          .eq("phase", "lobby")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      const presets = (presetsRes.data ?? []) as TrendingPreset[];
      const rooms_ = (roomsRes.data ?? []) as Array<PublicRoom & { phase: string }>;

      // Récupérer les profils auteurs
      const userIds = Array.from(new Set([
        ...presets.map((p) => p.author_id),
        ...rooms_.map((r) => r.host_id),
      ]));

      let profileMap = new Map<string, { username: string | null; avatar_url: string | null }>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, username, avatar_url")
          .in("id", userIds);
        profileMap = new Map((profiles ?? []).map((p) => [p.id, { username: p.username, avatar_url: p.avatar_url }]));
      }

      // Comptage de joueurs par room
      const roomIds = rooms_.map((r) => r.id);
      const playersCount = new Map<string, number>();
      if (roomIds.length > 0) {
        const { data: players } = await supabase
          .from("room_players")
          .select("room_id")
          .in("room_id", roomIds);
        (players ?? []).forEach((p) => {
          const k = (p as { room_id: string }).room_id;
          playersCount.set(k, (playersCount.get(k) ?? 0) + 1);
        });
      }

      setTrending(presets.map((p) => ({ ...p, author: profileMap.get(p.author_id) })));
      setRooms(rooms_.map((r) => ({
        ...r,
        player_count: playersCount.get(r.id) ?? 0,
        host: profileMap.get(r.host_id),
      })));
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 rounded-full border-2 border-brand-500/30 border-t-brand-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Lobbies publics en direct */}
      {rooms.length > 0 && (
        <section>
          <SectionHeader emoji="🟢" title="Lobbies publics" subtitle={`${rooms.length} salon${rooms.length > 1 ? "s" : ""} en attente de joueurs`} />
          <div className="space-y-2">
            {rooms.map((room, i) => {
              const game = gameMap.get(room.game_type);
              return (
                <motion.div
                  key={room.id}
                  initial={{ opacity: 0, x: -8 }}
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
                        <span className="truncate">{room.host?.username ?? "Hôte"}</span>
                        <span className="text-surface-700">·</span>
                        <span>{room.player_count} joueur{room.player_count > 1 ? "s" : ""}</span>
                      </div>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-emerald-950/40 text-emerald-400 border border-emerald-700/30 font-semibold shrink-0">
                      Rejoindre
                    </span>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      {/* Tendances */}
      <section>
        <SectionHeader emoji="🔥" title="Presets tendances" subtitle="Les plus joués sur GameTrend" />
        {trending.length === 0 ? (
          <p className="text-surface-600 text-sm text-center py-6">Aucun preset pour le moment.</p>
        ) : (
          <div className="space-y-2">
            {trending.map((p, i) => {
              const game = gameMap.get(p.game_type);
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, x: -8 }}
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
                        {game?.name ?? p.game_type} · par {p.author?.username ?? "Anonyme"}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-brand-300 text-sm font-bold">▶ {p.play_count}</p>
                      <p className="text-surface-700 text-[10px]">parties</p>
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
          <Link href="/auth/login" className="text-brand-400 underline">Connecte-toi</Link>
          {" "}pour personnaliser ton fil et suivre des créateurs.
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
