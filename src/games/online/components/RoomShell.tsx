"use client";

/**
 * Orchestrateur générique d'une room online.
 *
 * Responsabilités :
 *   - synchroniser l'état de la room via useRoomChannel (Supabase Realtime)
 *   - afficher l'écran de jonction si nécessaire (JoinScreen)
 *   - afficher les boutons "Quitter / Menu" hors lobby (RoomGameButtons)
 *   - afficher les toasts d'événements (joueur parti, hôte transféré, kick)
 *   - déléguer le rendu du contenu à `renderPhase` (render-prop par jeu)
 *
 * Chaque jeu fournit `renderPhase(ctx)` qui retourne le composant approprié
 * en fonction de `room.phase`. Le shell s'occupe du reste.
 */

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useRoomChannel } from "@/games/online/hooks/useRoomChannel";
import JoinScreen, { type JoinScreenLabels } from "@/games/online/components/JoinScreen";
import RoomGameButtons, {
  type RoomGameButtonsLabels,
} from "@/games/online/components/RoomGameButtons";
import GameSocialOverlay from "@/components/social/GameSocialOverlay";
import type {
  OnlineRoom,
  RoomPlayer,
  RoomMessage,
  RoomVote,
  ReplayVote,
} from "@/types/rooms";

/** Contexte injecté à `renderPhase` pour rendre l'écran courant. */
export interface RoomPhaseContext {
  room: OnlineRoom;
  players: RoomPlayer[];
  messages: RoomMessage[];
  votes: RoomVote[];
  replayVotes: ReplayVote[];
  myName: string;
  myUserId: string | null;
  isHost: boolean;
  onlineNames: Set<string>;
  playerAvatars: Record<string, string | null>;
  /** À appeler avant un quit volontaire pour ne pas déclencher la redirection /?kicked=1 */
  markVoluntaryLeave: () => void;
}

export interface RoomShellLabels {
  join: JoinScreenLabels;
  buttons: RoomGameButtonsLabels;
  connecting: string;
  identifying: string;
  back: string;
  ok: string;
  errRoomNotFound: (reason?: string) => string;
  errAlreadyStarted: string;
  /** Clés d'événements affichés en toast */
  evtPlayerLeft: (name: string) => string;
  evtHostLeft: (name: string) => string;
  evtNewHost: (name: string) => string;
  evtNewHostYou: string;
  evtKicked: (name: string) => string;
}

interface RoomShellProps {
  /** Page d'accueil du jeu (ex: "/games/blindrank") pour le bouton "back" en cas d'erreur */
  gameHomeHref: string;
  labels: RoomShellLabels;
  /**
   * Render-prop appelée pour chaque phase. Recevra un contexte complet et
   * doit retourner le composant à afficher. La phase "lobby" est obligatoirement
   * gérée (typiquement par le composant `RoomWaitingShell` du jeu).
   */
  renderPhase: (ctx: RoomPhaseContext) => React.ReactNode;
}

export default function RoomShell({ gameHomeHref, labels, renderPhase }: RoomShellProps) {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();

  const channel = useRoomChannel({
    code,
    labels: {
      errRoomNotFound: labels.errRoomNotFound,
      errAlreadyStarted: () => labels.errAlreadyStarted,
    },
  });

  const {
    room, players, messages, votes, replayVotes,
    myName, myUserId, needsJoin, loadError, onlineNames, playerAvatars,
    markJoined, markVoluntaryLeave,
  } = channel;

  const [eventToast, setEventToast] = useState<string | null>(null);
  const lastEventTsRef = useRef<string | null>(null);

  // Toast d'événement (déclenché par config.last_event mis à jour côté serveur)
  useEffect(() => {
    const cfg = room?.config as
      | { last_event?: { type: string; player: string; new_host?: string | null; ts: string } }
      | undefined;
    if (!cfg?.last_event?.ts || cfg.last_event.ts === lastEventTsRef.current) return;
    lastEventTsRef.current = cfg.last_event.ts;

    const evt = cfg.last_event;
    if (evt.player === myName) return;

    let msg = "";
    switch (evt.type) {
      case "player_left":
        msg = labels.evtPlayerLeft(evt.player);
        break;
      case "host_left":
        msg = labels.evtHostLeft(evt.player);
        if (evt.new_host === myName) msg += labels.evtNewHostYou;
        else if (evt.new_host) msg += labels.evtNewHost(evt.new_host);
        break;
      case "kicked":
        msg = labels.evtKicked(evt.player);
        break;
    }

    if (msg) {
      setEventToast(msg);
      setTimeout(() => setEventToast(null), 5000);
    }
  }, [room?.config, myName, labels]);

  // ── Erreur fatale ──
  if (loadError) {
    return (
      <div className="min-h-screen bg-surface-950 flex flex-col items-center justify-center gap-4 px-5">
        <p className="text-red-400 text-center">{loadError}</p>
        <button
          onClick={() => router.push(gameHomeHref)}
          className="px-6 py-3 bg-surface-800 rounded-xl text-white hover:bg-surface-700 transition-colors"
        >
          {labels.back}
        </button>
      </div>
    );
  }

  // ── Loading initial ──
  if (!room) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <p className="text-surface-500 text-sm animate-pulse">{labels.connecting}</p>
      </div>
    );
  }

  // ── Besoin de rejoindre ──
  if (needsJoin) {
    return (
      <JoinScreen
        code={(code ?? "").toUpperCase()}
        labels={labels.join}
        onJoined={markJoined}
      />
    );
  }

  // ── Identification en cours ──
  if (!myName) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <p className="text-surface-500 text-sm animate-pulse">{labels.identifying}</p>
      </div>
    );
  }

  const myPlayer = players.find((p) => p.display_name === myName);
  const isHost = myPlayer?.is_host ?? false;
  const roomId = (code ?? "").toUpperCase();

  const ctx: RoomPhaseContext = {
    room,
    players,
    messages,
    votes,
    replayVotes,
    myName,
    myUserId,
    isHost,
    onlineNames,
    playerAvatars,
    markVoluntaryLeave,
  };

  const showGameButtons = room.phase !== "lobby" && room.phase !== "result";

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
                  {labels.ok}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return (
    <>
      {eventToastEl}
      {renderPhase(ctx)}
      <GameSocialOverlay />
      {showGameButtons && (
        <RoomGameButtons
          roomId={roomId}
          myName={myName}
          labels={labels.buttons}
          onBeforeLeave={markVoluntaryLeave}
          onLeave={() => router.push("/")}
          onGoHome={() => router.push("/")}
        />
      )}
    </>
  );
}
