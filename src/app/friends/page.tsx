"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFriendsList } from "@/hooks/useFriendsList";
import { useNotifications } from "@/hooks/useNotifications";
import Header from "@/components/layout/Header";
import Avatar from "@/components/ui/Avatar";
import {
  getActivityStatus,
  ACTIVITY_LABELS,
  ACTIVITY_COLORS,
  type FriendActivity,
} from "@/types/social";

// ── Carte d'un ami ────────────────────────────────────────────
function FriendCard({ friend, onRemove }: { friend: FriendActivity; onRemove: (id: string) => void }) {
  const router = useRouter();
  const activity = getActivityStatus(friend);
  const label = ACTIVITY_LABELS[activity];
  const dotColor = ACTIVITY_COLORS[activity];

  function handleJoinLobby() {
    if (friend.room_id && friend.game_type) {
      router.push(`/games/${friend.game_type}/online/${friend.room_id}`);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-surface-700/30 bg-surface-900/50"
    >
      <Link href={`/profile/${friend.user_id}`} className="relative shrink-0">
        <Avatar src={friend.avatar_url} name={friend.username} size="md" className="rounded-xl" />
        <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-surface-950 ${dotColor} ${activity === "in_lobby" || activity === "online" ? "animate-pulse" : ""}`} />
      </Link>

      <div className="flex-1 min-w-0">
        <Link href={`/profile/${friend.user_id}`}>
          <p className="text-white font-medium text-sm truncate hover:text-brand-300 transition-colors">
            {friend.username ?? "Joueur"}
          </p>
        </Link>
        <p className={`text-xs mt-0.5 ${activity === "offline" ? "text-surface-600" : activity === "in_game" ? "text-amber-400" : activity === "in_lobby" ? "text-brand-400" : "text-emerald-400"}`}>
          {label}
          {friend.game_type && activity !== "offline" && activity !== "online" && (
            <span className="text-surface-500 ml-1">· {friend.game_type}</span>
          )}
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {activity === "in_lobby" && friend.room_id && (
          <button
            onClick={handleJoinLobby}
            className="px-3 py-1.5 rounded-xl bg-brand-600/20 border border-brand-500/30 text-brand-300 text-xs font-bold hover:bg-brand-600/30 transition-all"
          >
            Rejoindre
          </button>
        )}
        <button
          onClick={() => onRemove(friend.friendship_id)}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-surface-600 hover:text-red-400 hover:bg-red-950/30 transition-all text-xs"
          title="Retirer des amis"
        >
          ✕
        </button>
      </div>
    </motion.div>
  );
}

// ── Recherche de joueurs ─────────────────────────────────────
interface SearchResult {
  id: string;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
}

function PlayerSearch({ onRefreshFriends }: { onRefreshFriends: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [feedbacks, setFeedbacks] = useState<Record<string, string>>({});
  const supabase = createClient();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const { data } = await supabase.rpc("search_players", { query: query.trim() });
      setResults((data as SearchResult[]) ?? []);
      setSearching(false);
    }, 300);
  }, [query]);

  async function handleAdd(targetId: string) {
    setSending(targetId);
    const { data } = await supabase.rpc("send_friend_request", { target_id: targetId });
    if (data?.error) {
      setFeedbacks((p) => ({ ...p, [targetId]: data.error }));
    } else {
      setSent((p) => new Set(p).add(targetId));
      onRefreshFriends();
    }
    setSending(null);
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Chercher un joueur par pseudo…"
          className="w-full bg-surface-800/60 border border-surface-700/40 focus:border-brand-500/60 text-white placeholder-surface-600 rounded-2xl px-4 py-3 text-sm outline-none transition-all pr-10"
        />
        {searching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 text-xs animate-pulse">…</span>
        )}
      </div>

      <AnimatePresence>
        {results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-2"
          >
            {results.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-3 rounded-2xl border border-surface-700/30 bg-surface-900/50">
                <Link href={`/profile/${r.id}`} className="shrink-0">
                  <Avatar src={r.avatar_url} name={r.username} size="sm" className="rounded-xl" />
                </Link>
                <div className="flex-1 min-w-0">
                  <Link href={`/profile/${r.id}`}>
                    <p className="text-white text-sm font-medium truncate hover:text-brand-300 transition-colors">{r.username}</p>
                  </Link>
                  {feedbacks[r.id] && <p className="text-red-400 text-xs">{feedbacks[r.id]}</p>}
                </div>
                {sent.has(r.id) ? (
                  <span className="text-xs text-emerald-400 font-medium px-3 py-1.5 rounded-xl bg-emerald-950/30 border border-emerald-700/30">Envoyé ✓</span>
                ) : (
                  <button
                    onClick={() => handleAdd(r.id)}
                    disabled={sending === r.id}
                    className="text-xs px-3 py-1.5 rounded-xl bg-gradient-brand text-white font-bold glow-brand hover:opacity-92 disabled:opacity-50 transition-all shrink-0"
                  >
                    {sending === r.id ? "…" : "Ajouter"}
                  </button>
                )}
              </div>
            ))}
          </motion.div>
        )}
        {query.trim().length >= 2 && !searching && results.length === 0 && (
          <p className="text-surface-600 text-sm text-center py-3">Aucun joueur trouvé</p>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Page principale ──────────────────────────────────────────
export default function FriendsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { friends, loading, refresh } = useFriendsList(user?.id ?? null);
  const { notifications, unreadCount, markRead, refresh: refreshNotifs } = useNotifications(user?.id ?? null);
  const supabase = createClient();

  // Demandes d'ami en attente (type friend_request, non lues)
  const pendingRequests = notifications.filter(
    (n) => n.type === "friend_request"
  );

  useEffect(() => {
    if (!authLoading && (!user || user.is_anonymous)) {
      router.push("/auth/login?redirect=/friends");
    }
  }, [user, authLoading]);

  async function handleRemove(friendshipId: string) {
    await supabase.from("friendships").delete().eq("id", friendshipId);
    refresh();
  }

  async function handleRespond(notif: typeof notifications[0], response: "accept" | "decline") {
    if (!notif.friendship_id) return;
    const { data } = await supabase.rpc("respond_to_friend_request", {
      p_friendship_id: notif.friendship_id,
      p_response: response,
    });
    if (!data?.error) {
      await markRead(notif.id);
      refresh();
      refreshNotifs();
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <div className="text-4xl animate-pulse">👥</div>
      </div>
    );
  }

  if (!user || user.is_anonymous) return null;

  const online  = friends.filter((f) => getActivityStatus(f) !== "offline");
  const offline = friends.filter((f) => getActivityStatus(f) === "offline");

  return (
    <div className="min-h-screen bg-surface-950 bg-grid">
      <Header
        title="Amis"
        actions={
          unreadCount > 0 ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-brand-600 text-white font-bold">
              {unreadCount}
            </span>
          ) : undefined
        }
      />

      <div className="px-4 pt-4 pb-8 space-y-5 max-w-lg mx-auto">

        {/* ── Demandes en attente ── */}
        <AnimatePresence>
          {pendingRequests.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-brand-700/30 bg-brand-950/20 overflow-hidden"
            >
              <p className="px-4 py-3 text-brand-300 text-xs font-bold uppercase tracking-widest border-b border-brand-700/20">
                Demandes d&apos;ami · {pendingRequests.length}
              </p>
              <div className="divide-y divide-surface-800/40">
                {pendingRequests.map((notif) => (
                  <div key={notif.id} className="flex items-center gap-3 px-4 py-3">
                    <Link href={`/profile/${notif.from_user_id}`} className="shrink-0">
                      <Avatar src={notif.from_profile?.avatar_url} name={notif.from_profile?.username} size="sm" className="rounded-xl" />
                    </Link>
                    <div className="flex-1 min-w-0">
                      <Link href={`/profile/${notif.from_user_id}`}>
                        <p className="text-white text-sm font-medium hover:text-brand-300 transition-colors">
                          {notif.from_profile?.username ?? "Joueur"}
                        </p>
                      </Link>
                      <p className="text-surface-500 text-xs">Veut être ton ami</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleRespond(notif, "accept")}
                        className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500 transition-colors"
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => handleRespond(notif, "decline")}
                        className="px-3 py-1.5 rounded-xl border border-surface-700/40 text-surface-400 text-xs hover:text-red-400 transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Rechercher des joueurs ── */}
        <div className="rounded-2xl border border-surface-700/40 bg-surface-900/50 p-4">
          <p className="text-white font-display font-bold text-sm mb-3">🔍 Trouver un joueur</p>
          <PlayerSearch onRefreshFriends={refresh} />
        </div>

        {/* ── Liste des amis ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-surface-400 text-xs font-medium uppercase tracking-widest">
              Amis · {friends.length}/10
            </p>
            <button onClick={refresh} className="text-surface-600 text-xs hover:text-surface-400 transition-colors">
              Actualiser
            </button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-2xl bg-surface-900/40 animate-pulse" />
              ))}
            </div>
          ) : friends.length === 0 ? (
            <div className="text-center py-12 rounded-2xl border border-dashed border-surface-700/30 bg-surface-900/20">
              <div className="text-4xl mb-3">👥</div>
              <p className="text-surface-500 text-sm">Tu n&apos;as pas encore d&apos;amis.</p>
              <p className="text-surface-600 text-xs mt-1">Cherche un joueur ci-dessus !</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* En ligne / en partie */}
              {online.length > 0 && (
                <>
                  <p className="text-surface-600 text-xs px-1 mb-1">En ligne</p>
                  {online.map((f) => (
                    <FriendCard key={f.user_id} friend={f} onRemove={handleRemove} />
                  ))}
                </>
              )}
              {/* Hors ligne */}
              {offline.length > 0 && (
                <>
                  {online.length > 0 && <p className="text-surface-600 text-xs px-1 mt-3 mb-1">Hors ligne</p>}
                  {offline.map((f) => (
                    <FriendCard key={f.user_id} friend={f} onRemove={handleRemove} />
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
