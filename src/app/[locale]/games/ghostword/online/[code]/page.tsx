"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { safeJoinRoom } from "@/games/online/lib/safeJoinRoom";

import RoomWaiting from "@/games/ghostword/components/online/RoomWaiting";
import OnlineReveal from "@/games/ghostword/components/online/OnlineReveal";
import OnlineDiscussion from "@/games/ghostword/components/online/OnlineDiscussion";
import OnlineVote from "@/games/ghostword/components/online/OnlineVote";
import OnlineResult from "@/games/ghostword/components/online/OnlineResult";

import type { OnlineRoom, RoomPlayer, RoomMessage, RoomVote, ReplayVote } from "@/types/rooms";

// ── Sets de colonnes (limite l'egress Supabase) ─────────────────
const ROOM_COLS =
  "id, host_id, game_type, config, phase, reveal_index, discussion_turn, discussion_turns_per_round, current_speaker_index, speaker_started_at, speaker_duration_seconds, vote_round, tie_count, winner, created_at, expires_at, max_players, is_private";
const MESSAGE_COLS =
  "id, room_id, player_name, message, discussion_turn, vote_round, created_at";
const VOTE_COLS = "room_id, voter_name, target_name, vote_round, created_at";
const REPLAY_VOTE_COLS = "room_id, player_name, choice, created_at";

// ── Boutons flottants "Quitter" et "Menu" visibles hors lobby ──
function GameButtons({
  roomId, myName, onBeforeLeave, onLeave, onGoHome,
}: {
  roomId: string;
  myName: string;
  onBeforeLeave: () => void;
  onLeave: () => void;
  onGoHome: () => void;
}) {
  const t = useTranslations("games.ghostword.online.room");
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  async function doLeave() {
    setLeaving(true);
    onBeforeLeave();

    const supabase = createClient();
    await supabase.rpc("quit_room_fn", {
      p_room_id: roomId,
      p_display_name: myName,
    });

    onLeave();
  }

  return (
    <div className="fixed top-3 right-3 z-50">
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -8 }}
            className="flex flex-col gap-1.5 p-2.5 rounded-2xl border border-surface-700/50 bg-surface-950/97 backdrop-blur-xl shadow-2xl w-[180px]"
          >
            <button
              onClick={doLeave}
              disabled={leaving}
              className="w-full py-2.5 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-500 transition-colors disabled:opacity-50"
            >
              {leaving ? "…" : t("leave")}
            </button>
            <button
              onClick={() => { setOpen(false); onGoHome(); }}
              className="w-full py-2.5 rounded-xl border border-surface-700/40 text-surface-300 text-xs font-medium hover:text-white hover:border-surface-600 transition-colors"
            >
              {t("menu")}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="w-full py-1.5 text-surface-600 text-xs hover:text-surface-400 transition-colors"
            >
              {t("cancel")}
            </button>
          </motion.div>
        ) : (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-surface-700/40 bg-surface-950/90 backdrop-blur-xl text-surface-500 hover:text-surface-300 hover:border-surface-600/40 transition-all text-xs shadow-lg"
          >
            {t("options")}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Écran "rejoindre" si pas encore dans la room ─────────────
function JoinScreen({
  code,
  onJoined,
}: {
  code: string;
  onJoined: (name: string) => void;
}) {
  const t = useTranslations("games.ghostword.online.room");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoJoining, setAutoJoining] = useState(false);
  const [error, setError] = useState("");
  const supabase = createClient();

  // Tenter un auto-join si le joueur a un vrai compte
  useEffect(() => {
    async function tryAutoJoin() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || user.is_anonymous) return;
      const { data: profile } = await supabase
        .from("profiles").select("username").eq("id", user.id).maybeSingle();
      if (!profile?.username) return;

      // Compte complet avec pseudo → rejoindre automatiquement
      setAutoJoining(true);
      await doJoin(user, profile.username);
    }
    tryAutoJoin();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function doJoin(
    _knownUser: { id: string },
    knownName: string,
  ) {
    const n = knownName.trim();
    if (!n) return;

    const res = await safeJoinRoom(supabase, code, n, {
      errRoomNotFound: t("errRoomNotFound"),
      errAlreadyStarted: t("errAlreadyStarted"),
      errNickTaken: t("errNickTaken"),
      errLobbyFull: t("errLobbyFull"),
    });
    if (!res.ok) {
      setError(res.error ?? "");
      setAutoJoining(false);
      setLoading(false);
      return;
    }

    onJoined(res.displayName ?? n);
  }

  async function handleJoin() {
    const n = name.trim();
    if (!n) { setError(t("errEnterNick")); return; }
    setLoading(true);
    setError("");

    let { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      const { data, error: anonErr } = await supabase.auth.signInAnonymously();
      if (anonErr || !data.user) {
        setError(t("errAuth", { message: anonErr?.message ?? "unknown" }));
        setLoading(false);
        return;
      }
      user = data.user;
      if (data.session) {
        await fetch("/api/auth/set-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: data.session.access_token, refresh_token: data.session.refresh_token }),
        });
      }
    }

    await doJoin(user, n);
    setLoading(false);
  }

  // Auto-join en cours → spinner silencieux
  if (autoJoining && !error) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <p className="text-surface-500 text-sm animate-pulse">{t("connecting")}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-950 bg-grid flex items-center justify-center px-5">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center">
          <p className="text-surface-500 text-xs uppercase tracking-widest mb-2">{t("salon")}</p>
          <h1 className="text-4xl font-display font-bold text-white tracking-widest">{code}</h1>
        </div>
        <div className="rounded-2xl border border-surface-700/40 bg-surface-900/60 p-4 space-y-3">
          <label className="text-white font-display font-bold text-sm">{t("yourNickname")}</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            placeholder={t("nicknamePlaceholder")} maxLength={20} autoFocus
            className="w-full bg-surface-800/60 border border-surface-700/40 focus:border-brand-500/70 text-white placeholder-surface-600 rounded-xl px-3 py-2.5 text-sm outline-none transition-all" />
          {error && <p className="text-red-400 text-xs">{error}</p>}
        </div>
        <button onClick={handleJoin} disabled={loading}
          className="w-full py-4 rounded-2xl font-display font-bold text-lg bg-gradient-brand text-white glow-brand hover:opacity-92 disabled:opacity-50 transition-all">
          {loading ? t("loading") : t("joinCta")}
        </button>
      </div>
    </div>
  );
}

// ── Orchestrateur principal ────────────────────────────────────
export default function RoomPage() {
  const t = useTranslations("games.ghostword.online.room");
  const { code } = useParams<{ code: string }>();
  const router = useRouter();

  const [room, setRoom] = useState<OnlineRoom | null>(null);
  const [players, setPlayers] = useState<RoomPlayer[]>([]);
  const [playerAvatars, setPlayerAvatars] = useState<Record<string, string | null>>({});
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [votes, setVotes] = useState<RoomVote[]>([]);
  const [replayVotes, setReplayVotes] = useState<ReplayVote[]>([]);
  const [myName, setMyName] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [needsJoin, setNeedsJoin] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [onlineNames, setOnlineNames] = useState<Set<string>>(new Set());

  const [eventToast, setEventToast] = useState<string | null>(null);

  const supabase = createClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  async function fetchAvatars(playersList: RoomPlayer[]) {
    const userIds = playersList.map((p) => p.user_id).filter(Boolean) as string[];
    if (userIds.length === 0) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, avatar_url")
      .in("id", userIds);
    if (!data) return;
    const map: Record<string, string | null> = {};
    for (const player of playersList) {
      const profile = data.find((pr) => pr.id === player.user_id);
      if (profile) map[player.display_name] = profile.avatar_url ?? null;
    }
    setPlayerAvatars(map);
  }
  const hostGoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playersRef = useRef<RoomPlayer[]>([]);
  const myNameRef = useRef<string | null>(null);
  const lastEventTsRef = useRef<string | null>(null);
  const voluntarilyLeavingRef = useRef(false);

  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { myNameRef.current = myName; }, [myName]);

  const roomId = code?.toUpperCase();

  // ── Heartbeat room : update last_seen_at toutes les 60s ──────────
  // La présence "live" est déjà gérée par Realtime presence (canal WS),
  // ce heartbeat ne sert qu'à dater la dernière activité en BDD.
  // 60s suffit largement, soit 4x moins d'écritures qu'avec 15s.
  useEffect(() => {
    if (!roomId || !myName) return;
    const supabase = createClient();

    async function heartbeat() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("room_players").update({ last_seen_at: new Date().toISOString() })
        .eq("room_id", roomId).eq("user_id", user.id);
    }
    heartbeat();
    const interval = setInterval(heartbeat, 60000);
    return () => clearInterval(interval);
  }, [roomId, myName]);

  // ── Init ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!roomId) return;
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setMyUserId(user.id);

      const { data: roomData, error: roomErr } = await supabase
        .from("game_rooms").select(ROOM_COLS).eq("id", roomId).maybeSingle();

      if (!roomData) { setLoadError(t("errRoomNotFoundDetail", { reason: roomErr?.message ?? "RLS" })); return; }
      setRoom(roomData as OnlineRoom);

      const { data: playersData } = await supabase
        .from("room_players")
        .select("room_id, user_id, display_name, is_host, is_eliminated, is_ready, join_order, joined_at")
        .eq("room_id", roomId).order("join_order");
      const typedPlayers = (playersData ?? []) as RoomPlayer[];
      setPlayers(typedPlayers);
      fetchAvatars(typedPlayers);

      if (user) {
        const me = (playersData ?? []).find((p: RoomPlayer) => p.user_id === user.id);
        if (me) { setMyName(me.display_name); }
        else if (roomData.phase === "lobby") { setNeedsJoin(true); }
        else { setLoadError(t("errAlreadyStarted")); }
      } else {
        if (roomData.phase === "lobby") setNeedsJoin(true);
        else setLoadError(t("errAlreadyStarted"));
      }

      const { data: msgs } = await supabase.from("room_messages").select(MESSAGE_COLS)
        .eq("room_id", roomId).order("created_at");
      setMessages((msgs ?? []) as RoomMessage[]);

      const { data: vts } = await supabase.from("room_votes").select(VOTE_COLS).eq("room_id", roomId);
      setVotes((vts ?? []) as RoomVote[]);

      const { data: rvts } = await supabase.from("room_replay_votes").select(REPLAY_VOTE_COLS).eq("room_id", roomId);
      setReplayVotes((rvts ?? []) as ReplayVote[]);
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // ── Realtime + Presence ───────────────────────────────────────
  useEffect(() => {
    if (!roomId) return;

    const channel = supabase.channel(`room:${roomId}`, {
      config: { presence: { key: myName ?? "anon" } },
    })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "game_rooms", filter: `id=eq.${roomId}` },
        // On ne se fie PAS au payload Realtime qui peut être partiel
        // (selon REPLICA IDENTITY) : on re-fetch la room complète pour
        // garantir un état cohérent (phase, current_speaker_index, etc.).
        async () => {
          const { data } = await supabase
            .from("game_rooms").select(ROOM_COLS).eq("id", roomId).maybeSingle();
          if (data) setRoom(data as OnlineRoom);
        })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "game_rooms", filter: `id=eq.${roomId}` },
        () => router.push("/"))
      .on("postgres_changes", { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${roomId}` },
        async () => {
          const { data } = await supabase
            .from("room_players")
            .select("room_id, user_id, display_name, is_host, is_eliminated, is_ready, join_order, joined_at")
            .eq("room_id", roomId).order("join_order");
          if (data) {
            const typed = data as RoomPlayer[];
            setPlayers(typed);
            fetchAvatars(typed);
            setMyUserId((uid) => {
              if (uid && !data.some((p: RoomPlayer) => p.user_id === uid)) {
                if (!voluntarilyLeavingRef.current) {
                  voluntarilyLeavingRef.current = true;
                  // Redirection robuste : on utilise l'objet pathname/query
                  // (next-intl conserve mal la query sur une string brute)
                  // + filet de sécurité window.location si la transition
                  // Next.js ne se déclenche pas.
                  try {
                    // @ts-expect-error router.replace accepte (string | object)
                    router.replace({ pathname: "/", query: { kicked: "1" } });
                  } catch {
                    /* fallback ci-dessous */
                  }
                  setTimeout(() => {
                    if (typeof window !== "undefined" && window.location.pathname.includes("/online/")) {
                      const m = window.location.pathname.match(/^\/([a-z]{2})\//);
                      window.location.assign((m ? `/${m[1]}` : "") + "/?kicked=1");
                    }
                  }, 350);
                }
                // Si départ volontaire : onLeave() s'en charge, pas de redirect ici
              }
              return uid;
            });
          }
        })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "room_messages", filter: `room_id=eq.${roomId}` },
        (payload) => setMessages((prev) => [...prev, payload.new as RoomMessage]))
      .on("postgres_changes", { event: "*", schema: "public", table: "room_votes", filter: `room_id=eq.${roomId}` },
        async () => {
          const { data } = await supabase.from("room_votes").select(VOTE_COLS).eq("room_id", roomId);
          if (data) setVotes(data as RoomVote[]);
        })
      .on("postgres_changes", { event: "*", schema: "public", table: "room_replay_votes", filter: `room_id=eq.${roomId}` },
        async () => {
          const { data } = await supabase.from("room_replay_votes").select(REPLAY_VOTE_COLS).eq("room_id", roomId);
          if (data) setReplayVotes(data as ReplayVote[]);
        })
      // Presence : qui est en ligne dans ce salon
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ name: string }>();
        const names = new Set(
          Object.values(state).flatMap((entries) => entries.map((e) => e.name))
        );
        setOnlineNames(names);
      })
      .on("presence", { event: "leave" }, (payload) => {
        const leftNames = (payload.leftPresences as Array<{ name: string }>).map((p) => p.name);
        const snapshotPlayers = playersRef.current;
        const hostPlayer = snapshotPlayers.find((p) => p.is_host);

        if (hostPlayer && leftNames.includes(hostPlayer.display_name)) {
          hostGoneTimerRef.current = setTimeout(async () => {
            const { data: freshPlayers } = await supabase
              .from("room_players")
              .select("display_name, is_host, is_eliminated, join_order")
              .eq("room_id", roomId!);

            if (!freshPlayers) return;

            const oldHostStillPresent = freshPlayers.some(
              (p) => p.display_name === hostPlayer.display_name && p.is_host
            );
            if (!oldHostStillPresent) return;

            const alivePlayers = freshPlayers
              .filter((p) => !p.is_eliminated && !p.is_host)
              .sort((a, b) => a.join_order - b.join_order);
            if (alivePlayers[0]?.display_name === myNameRef.current) {
              await supabase.rpc("handle_disconnect_fn", { p_room_id: roomId! });
            }
          }, 10000);
        }
      })
      .on("presence", { event: "join" }, (payload) => {
        // Hôte reconnecté → annuler le timer de transfert
        const joinedNames = (payload.newPresences as Array<{ name: string }>).map((p) => p.name);
        const hostPlayer = playersRef.current.find((p) => p.is_host);
        if (hostPlayer && joinedNames.includes(hostPlayer.display_name)) {
          if (hostGoneTimerRef.current) {
            clearTimeout(hostGoneTimerRef.current);
            hostGoneTimerRef.current = null;
          }
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED" && myNameRef.current) {
          channel.track({ name: myNameRef.current });
        }
      });

    channelRef.current = channel;
    return () => {
      if (hostGoneTimerRef.current) clearTimeout(hostGoneTimerRef.current);
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // Tracker sa présence une fois myName connu
  useEffect(() => {
    if (!myName || !channelRef.current) return;
    channelRef.current.track({ name: myName });
  }, [myName]);

  // Reset messages/votes quand on revient au lobby
  useEffect(() => {
    if (room?.phase === "lobby") { setMessages([]); setVotes([]); setReplayVotes([]); }
  }, [room?.phase]);

  // ── Toasts d'événements (joueur parti, hôte transféré, kick) ──
  useEffect(() => {
    const cfg = room?.config as { last_event?: { type: string; player: string; new_host?: string | null; ts: string } } | undefined;
    if (!cfg?.last_event?.ts || cfg.last_event.ts === lastEventTsRef.current) return;
    lastEventTsRef.current = cfg.last_event.ts;

    const evt = cfg.last_event;
    if (evt.player === myName) return;

    let msg = "";
    switch (evt.type) {
      case "player_left":
        msg = t("evtPlayerLeft", { name: evt.player });
        break;
      case "host_left":
        msg = t("evtHostLeft", { name: evt.player });
        if (evt.new_host === myName) {
          msg += t("evtNewHostYou");
        } else if (evt.new_host) {
          msg += t("evtNewHost", { name: evt.new_host });
        }
        break;
      case "kicked":
        msg = t("evtKicked", { name: evt.player });
        break;
    }

    if (msg) {
      setEventToast(msg);
      setTimeout(() => setEventToast(null), 5000);
    }
  }, [room?.config, myName]);

  // ── Rendu ─────────────────────────────────────────────────────
  if (loadError) {
    return (
      <div className="min-h-screen bg-surface-950 flex flex-col items-center justify-center gap-4 px-5">
        <p className="text-red-400 text-center">{loadError}</p>
        <button onClick={() => router.push("/games/ghostword")}
          className="px-6 py-3 bg-surface-800 rounded-xl text-white hover:bg-surface-700 transition-colors">
          {t("back")}
        </button>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <p className="text-surface-500 text-sm animate-pulse">{t("connecting")}</p>
      </div>
    );
  }

  if (needsJoin) {
    return (
      <JoinScreen code={roomId!} onJoined={(name) => { setMyName(name); setNeedsJoin(false); }} />
    );
  }

  if (!myName) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <p className="text-surface-500 text-sm animate-pulse">{t("identifying")}</p>
      </div>
    );
  }

  const myPlayer = players.find((p) => p.display_name === myName);
  const isHost = myPlayer?.is_host ?? false;
  const currentVotes = votes.filter((v) => v.vote_round === room.vote_round);

  const gameButtons = room.phase !== "lobby" && (
    <GameButtons
      roomId={roomId!}
      myName={myName}
      onBeforeLeave={() => { voluntarilyLeavingRef.current = true; }}
      onLeave={() => router.push("/")}
      onGoHome={() => router.push("/")}
    />
  );

  const eventToastEl = (
    <AnimatePresence>
      {eventToast && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[59] bg-black/40 backdrop-blur-sm"
            onClick={() => setEventToast(null)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none px-6"
          >
            <div
              className="pointer-events-auto w-full max-w-xs rounded-3xl border border-surface-700/30 bg-surface-950/98 backdrop-blur-xl shadow-2xl overflow-hidden"
              style={{ boxShadow: "0 0 40px rgba(109,40,217,0.1), 0 20px 60px rgba(0,0,0,0.8)" }}
            >
              <div className="px-6 py-6 text-center space-y-3">
                <div className="text-3xl">
                  {eventToast.includes("👑") ? "👑" :
                   eventToast.startsWith("🚷") ? "🚪" :
                   eventToast.startsWith("🚪") ? "👋" : "ℹ️"}
                </div>
                <p className="text-white font-display font-bold text-sm leading-snug">{eventToast}</p>
                <button
                  onClick={() => setEventToast(null)}
                  className="w-full py-2.5 rounded-xl bg-surface-800/80 text-surface-300 text-sm font-medium hover:bg-surface-700/80 transition-colors border border-surface-700/40"
                >
                  {t("ok")}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  switch (room.phase) {
    case "lobby":
      return (
        <>
          {eventToastEl}
          <RoomWaiting
            room={room} players={players} myName={myName} isHost={isHost}
            onlineNames={onlineNames} playerAvatars={playerAvatars}
            onVoluntaryLeave={() => { voluntarilyLeavingRef.current = true; }}
          />
        </>
      );

    case "reveal":
      return (
        <>
          {eventToastEl}
          <OnlineReveal roomId={roomId!} players={players} myName={myName} playerAvatars={playerAvatars} />
          {gameButtons}
        </>
      );

    case "discussion":
      return (
        <>
          {eventToastEl}
          <OnlineDiscussion room={room} players={players} messages={messages} myName={myName} playerAvatars={playerAvatars} />
          {gameButtons}
        </>
      );

    case "vote":
      return (
        <>
          {eventToastEl}
          <OnlineVote room={room} players={players} votes={currentVotes} messages={messages} myName={myName} playerAvatars={playerAvatars} />
          {gameButtons}
        </>
      );

    case "result":
      return (
        <>
          {eventToastEl}
          <OnlineResult roomId={roomId!} winner={room.winner ?? "initie"}
            myName={myName} totalPlayers={players.length} replayVotes={replayVotes}
            playerAvatars={playerAvatars} players={players} />
        </>
      );

    default:
      return null;
  }
}
