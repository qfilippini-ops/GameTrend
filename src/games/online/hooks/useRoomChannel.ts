"use client";

/**
 * Hook générique pour synchroniser une room online avec Supabase Realtime.
 *
 * Centralise tout ce qui est commun à tous les jeux online :
 *   - chargement initial (room, players, messages, votes, replayVotes)
 *   - canal Realtime (postgres_changes + presence)
 *   - heartbeat de présence (last_seen_at)
 *   - détection de kick (mon user_id n'est plus dans players)
 *   - récupération des avatars des joueurs
 *
 * Usage : voir RoomShell.tsx (ou n'importe quel orchestrateur de room).
 *
 * Note : volontairement isolé des spécificités jeu. La logique métier
 * (phases, transitions, triggers PG) reste dans les composants/jeux
 * qui consomment ce hook.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import type {
  OnlineRoom,
  RoomPlayer,
  RoomMessage,
  RoomVote,
  ReplayVote,
} from "@/types/rooms";

const ROOM_COLS =
  "id, host_id, game_type, config, phase, reveal_index, discussion_turn, discussion_turns_per_round, current_speaker_index, speaker_started_at, speaker_duration_seconds, vote_round, tie_count, winner, created_at, expires_at, max_players, is_private";
const PLAYER_COLS =
  "room_id, user_id, display_name, is_host, is_eliminated, is_ready, join_order, joined_at";
const MESSAGE_COLS =
  "id, room_id, player_name, message, discussion_turn, vote_round, created_at";
const VOTE_COLS = "room_id, voter_name, target_name, vote_round, created_at";
const REPLAY_VOTE_COLS = "room_id, player_name, choice, created_at";

export interface UseRoomChannelResult {
  /** Room courante (null pendant le chargement initial) */
  room: OnlineRoom | null;
  players: RoomPlayer[];
  messages: RoomMessage[];
  votes: RoomVote[];
  replayVotes: ReplayVote[];
  /** Map display_name → avatar_url (null si pas d'avatar) */
  playerAvatars: Record<string, string | null>;
  /** Set des display_name actuellement connectés (presence) */
  onlineNames: Set<string>;

  /** Mon display_name dans cette room (null tant que pas identifié) */
  myName: string | null;
  /** Mon user_id (peut être null si non authentifié) */
  myUserId: string | null;

  /** True quand l'utilisateur n'est pas (encore) dans cette room et doit la rejoindre */
  needsJoin: boolean;
  /** Erreur fatale (room inexistante, partie déjà commencée…) */
  loadError: string;

  /**
   * Setter pour signaler manuellement qu'on vient de rejoindre la room.
   * Doit être appelé par JoinScreen après un INSERT room_players réussi.
   */
  markJoined: (displayName: string) => void;

  /**
   * À appeler avant un quit volontaire pour que le hook ne déclenche pas
   * une redirection /?kicked=1 quand notre entrée disparaît de room_players.
   */
  markVoluntaryLeave: () => void;
}

interface UseRoomChannelOptions {
  /** Code de la room (sera uppercase'd) */
  code: string | undefined;
  /**
   * Translation strings pour les messages d'erreur — gardés en props pour
   * éviter de coupler le hook à un namespace i18n particulier.
   */
  labels: {
    errRoomNotFound: (reason?: string) => string;
    errAlreadyStarted: () => string;
  };
  /**
   * Callback déclenché quand la room est supprimée (host_id quitte définitivement)
   */
  onRoomDeleted?: () => void;
  /**
   * Callback déclenché quand on est kické (notre user_id disparaît de room_players)
   * sans qu'on ait demandé à partir.
   */
  onKicked?: () => void;
}

export function useRoomChannel({
  code,
  labels,
  onRoomDeleted,
  onKicked,
}: UseRoomChannelOptions): UseRoomChannelResult {
  const router = useRouter();
  const supabase = createClient();
  const roomId = code?.toUpperCase();

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

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const playersRef = useRef<RoomPlayer[]>([]);
  const myNameRef = useRef<string | null>(null);
  const voluntarilyLeavingRef = useRef(false);
  const redirectingRef = useRef(false);
  const hostGoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Force une redirection robuste vers la home avec une query optionnelle.
   * Utilise router.replace (objet pathname/query : indispensable pour que
   * next-intl conserve la query string), avec un fallback window.location au
   * cas où le router ne déclencherait pas (race conditions de transition).
   */
  const forceHome = useCallback(
    (query?: Record<string, string>) => {
      if (redirectingRef.current) return;
      redirectingRef.current = true;
      voluntarilyLeavingRef.current = true;
      try {
        // next-intl : on doit passer un objet { pathname, query } pour que la
        // query string soit conservée correctement.
        // @ts-expect-error — router.replace accepte (string | { pathname, query })
        router.replace({ pathname: "/", query });
      } catch {
        /* fallback ci-dessous */
      }
      // Filet de sécurité : si la transition Next.js ne se fait pas (cas rare
      // de désync state quand la room disparaît brutalement), on force un
      // reload après 350ms en restant sur la même locale.
      const qs = query
        ? "?" +
          Object.entries(query)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join("&")
        : "";
      setTimeout(() => {
        if (typeof window === "undefined") return;
        // Si on est encore dans une room (pathname contient /games/.../online/),
        // on force un reload vers la home en préservant le préfixe de locale.
        if (window.location.pathname.includes("/online/")) {
          const localeMatch = window.location.pathname.match(/^\/([a-z]{2})\//);
          const localePrefix = localeMatch ? `/${localeMatch[1]}` : "";
          window.location.assign(localePrefix + "/" + qs);
        }
      }, 350);
    },
    [router]
  );

  useEffect(() => {
    playersRef.current = players;
  }, [players]);
  useEffect(() => {
    myNameRef.current = myName;
  }, [myName]);

  const fetchAvatars = useCallback(
    async (playersList: RoomPlayer[]) => {
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
      setPlayerAvatars((prev) => ({ ...prev, ...map }));
    },
    [supabase]
  );

  // ── Heartbeat last_seen_at toutes les 60s (presence WS gère le live) ──
  useEffect(() => {
    if (!roomId || !myName) return;
    const sb = createClient();
    async function heartbeat() {
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!user) return;
      await sb
        .from("room_players")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("room_id", roomId)
        .eq("user_id", user.id);
    }
    heartbeat();
    const interval = setInterval(heartbeat, 60000);
    return () => clearInterval(interval);
  }, [roomId, myName]);

  // ── Init : chargement initial des données ─────────────────────────────
  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;

    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (user) setMyUserId(user.id);

      const { data: roomData, error: roomErr } = await supabase
        .from("game_rooms")
        .select(ROOM_COLS)
        .eq("id", roomId)
        .maybeSingle();

      if (cancelled) return;
      if (!roomData) {
        setLoadError(labels.errRoomNotFound(roomErr?.message ?? "RLS"));
        return;
      }
      setRoom(roomData as OnlineRoom);

      const { data: playersData } = await supabase
        .from("room_players")
        .select(PLAYER_COLS)
        .eq("room_id", roomId)
        .order("join_order");
      if (cancelled) return;
      const typedPlayers = (playersData ?? []) as RoomPlayer[];
      setPlayers(typedPlayers);
      fetchAvatars(typedPlayers);

      if (user) {
        const me = (playersData ?? []).find((p: RoomPlayer) => p.user_id === user.id);
        if (me) setMyName(me.display_name);
        else if (roomData.phase === "lobby") setNeedsJoin(true);
        else setLoadError(labels.errAlreadyStarted());
      } else {
        if (roomData.phase === "lobby") setNeedsJoin(true);
        else setLoadError(labels.errAlreadyStarted());
      }

      const { data: msgs } = await supabase
        .from("room_messages")
        .select(MESSAGE_COLS)
        .eq("room_id", roomId)
        .order("created_at");
      if (!cancelled) setMessages((msgs ?? []) as RoomMessage[]);

      const { data: vts } = await supabase
        .from("room_votes")
        .select(VOTE_COLS)
        .eq("room_id", roomId);
      if (!cancelled) setVotes((vts ?? []) as RoomVote[]);

      const { data: rvts } = await supabase
        .from("room_replay_votes")
        .select(REPLAY_VOTE_COLS)
        .eq("room_id", roomId);
      if (!cancelled) setReplayVotes((rvts ?? []) as ReplayVote[]);
    }

    init();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // ── Realtime : abonnement aux changements + presence ──────────────────
  useEffect(() => {
    if (!roomId) return;

    const channel = supabase
      .channel(`room:${roomId}`, {
        config: { presence: { key: myName ?? "anon" } },
      })
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "game_rooms", filter: `id=eq.${roomId}` },
        // Re-fetch complet (REPLICA IDENTITY peut être partiel)
        async () => {
          const { data } = await supabase
            .from("game_rooms")
            .select(ROOM_COLS)
            .eq("id", roomId)
            .maybeSingle();
          if (!data) {
            // La room n'existe plus côté serveur (deleted entre l'event et
            // notre re-fetch). On considère ça comme une fermeture et on
            // redirige tout de suite.
            if (onRoomDeleted) {
              voluntarilyLeavingRef.current = true;
              redirectingRef.current = true;
              onRoomDeleted();
            } else {
              forceHome({ lobby_closed: "1" });
            }
            return;
          }
          setRoom(data as OnlineRoom);
          // Si l'hôte a fermé le salon : redirection immédiate (avant que
          // le DELETE en cascade ne supprime room_players et nous laisse
          // sur un écran cassé).
          const cfg = (data as OnlineRoom).config as { lobby_closed?: boolean } | null;
          if (cfg?.lobby_closed) {
            if (onRoomDeleted) {
              voluntarilyLeavingRef.current = true;
              redirectingRef.current = true;
              onRoomDeleted();
            } else {
              forceHome({ lobby_closed: "1" });
            }
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "game_rooms", filter: `id=eq.${roomId}` },
        () => {
          if (onRoomDeleted) {
            voluntarilyLeavingRef.current = true;
            redirectingRef.current = true;
            onRoomDeleted();
          } else {
            // Si l'UPDATE lobby_closed n'est pas encore passé, on n'a pas
            // encore redirigé. On le fait maintenant.
            forceHome({ lobby_closed: "1" });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${roomId}` },
        async () => {
          const { data } = await supabase
            .from("room_players")
            .select(PLAYER_COLS)
            .eq("room_id", roomId)
            .order("join_order");
          if (!data) return;
          const typed = data as RoomPlayer[];
          setPlayers(typed);
          fetchAvatars(typed);
          setMyUserId((uid) => {
            if (uid && !data.some((p: RoomPlayer) => p.user_id === uid)) {
              if (!voluntarilyLeavingRef.current) {
                if (onKicked) {
                  voluntarilyLeavingRef.current = true;
                  redirectingRef.current = true;
                  onKicked();
                } else {
                  forceHome({ kicked: "1" });
                }
              }
            }
            return uid;
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "room_messages", filter: `room_id=eq.${roomId}` },
        (payload) => setMessages((prev) => [...prev, payload.new as RoomMessage])
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_votes", filter: `room_id=eq.${roomId}` },
        async () => {
          const { data } = await supabase
            .from("room_votes")
            .select(VOTE_COLS)
            .eq("room_id", roomId);
          if (data) setVotes(data as RoomVote[]);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_replay_votes", filter: `room_id=eq.${roomId}` },
        async () => {
          const { data } = await supabase
            .from("room_replay_votes")
            .select(REPLAY_VOTE_COLS)
            .eq("room_id", roomId);
          if (data) setReplayVotes(data as ReplayVote[]);
        }
      )
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ name: string }>();
        const names = new Set(
          Object.values(state).flatMap((entries) => entries.map((e) => e.name))
        );
        setOnlineNames(names);
      })
      .on("presence", { event: "leave" }, (payload) => {
        // Si l'hôte se déconnecte, donner 10s avant de basculer le host
        // sur le 1er joueur restant (si c'est moi). Géré côté serveur via RPC.
        const leftNames = (payload.leftPresences as Array<{ name: string }>).map((p) => p.name);
        const snapshotPlayers = playersRef.current;
        const hostPlayer = snapshotPlayers.find((p) => p.is_host);
        if (hostPlayer && leftNames.includes(hostPlayer.display_name)) {
          hostGoneTimerRef.current = setTimeout(async () => {
            const { data: freshPlayers } = await supabase
              .from("room_players")
              .select("display_name, is_host, is_eliminated, join_order")
              .eq("room_id", roomId);
            if (!freshPlayers) return;
            const oldHostStillPresent = freshPlayers.some(
              (p) => p.display_name === hostPlayer.display_name && p.is_host
            );
            if (!oldHostStillPresent) return;
            const alivePlayers = freshPlayers
              .filter((p) => !p.is_eliminated && !p.is_host)
              .sort((a, b) => a.join_order - b.join_order);
            if (alivePlayers[0]?.display_name === myNameRef.current) {
              await supabase.rpc("handle_disconnect_fn", { p_room_id: roomId });
            }
          }, 10000);
        }
      })
      .on("presence", { event: "join" }, (payload) => {
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

  // Tracker sa présence quand myName est connu
  useEffect(() => {
    if (!myName || !channelRef.current) return;
    channelRef.current.track({ name: myName });
  }, [myName]);

  // Reset messages/votes quand on revient au lobby (ex : nouvelle partie)
  useEffect(() => {
    if (room?.phase === "lobby") {
      setMessages([]);
      setVotes([]);
      setReplayVotes([]);
    }
  }, [room?.phase]);

  const markJoined = useCallback((displayName: string) => {
    setMyName(displayName);
    setNeedsJoin(false);
  }, []);

  const markVoluntaryLeave = useCallback(() => {
    voluntarilyLeavingRef.current = true;
  }, []);

  return {
    room,
    players,
    messages,
    votes,
    replayVotes,
    playerAvatars,
    onlineNames,
    myName,
    myUserId,
    needsJoin,
    loadError,
    markJoined,
    markVoluntaryLeave,
  };
}
