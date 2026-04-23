"use client";

/**
 * Phase "playing" de DYP online.
 *
 * Trois modes d'affichage selon les flags du state :
 *   - duel                   : 2 cartes face à face, on vote pour son préféré
 *   - pendingMatchTransition : pause de 2 s pour montrer le winner du duel
 *   - pendingTransition      : pause de 3 s entre 2 rounds (qualifiés)
 *
 * Logique :
 *   - Vote via RPC `dyp_cast_vote` (target_name = "card:<id>")
 *   - Quand le timer du duel expire, le 1er joueur online (par join_order)
 *     appelle `dyp_force_timeout` pour résoudre le duel.
 *   - Quand le timer inter-duels (2 s) expire, le leader appelle
 *     `dyp_force_match_advance` pour passer au duel suivant.
 *   - Quand le timer inter-rounds (3 s) expire, le leader appelle
 *     `dyp_force_round_advance` pour générer le round suivant.
 *   - Tout le reste est géré côté serveur par les triggers/RPCs PG.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import RoomChat from "@/games/online/components/RoomChat";
import { createClient } from "@/lib/supabase/client";
import { vibrate } from "@/lib/utils";
import {
  DYP_TRANSITION_SECONDS,
  DYP_MATCH_TRANSITION_SECONDS,
} from "@/games/dyp/online-config";
import type {
  OnlineRoom,
  RoomPlayer,
  RoomMessage,
  RoomVote,
} from "@/types/rooms";
import type { DYPCard } from "@/types/games";

interface DypMatch {
  matchId: string;
  card1Id: string;
  card2Id: string;
  winnerId: string | null;
}

interface DypOnlineState {
  presetId: string | null;
  bracketSize: number;
  tourTimeSeconds: number;
  tieBreak: "random" | "first";
  cards: DYPCard[];
  totalRounds: number;
  bracket: DypMatch[][];
  currentRound: number;
  currentMatchIndex: number;
  currentRoundStartedAt: string;
  pendingTransition: boolean;
  transitionStartedAt: string | null;
  pendingMatchTransition?: boolean;
  matchTransitionStartedAt?: string | null;
  championId: string | null;
  finished: boolean;
}

interface Props {
  room: OnlineRoom;
  players: RoomPlayer[];
  messages: RoomMessage[];
  votes: RoomVote[];
  myName: string;
  onlineNames: Set<string>;
  playerAvatars: Record<string, string | null>;
}

function readState(room: OnlineRoom): DypOnlineState | null {
  const cfg = (room.config ?? {}) as Record<string, unknown>;
  const s = cfg.dyp as DypOnlineState | undefined;
  if (!s || !Array.isArray(s.bracket)) return null;
  return s;
}

function cardIdFromVote(target: string): string | null {
  if (!target?.startsWith("card:")) return null;
  return target.slice(5) || null;
}

/**
 * Parse un timestamp Postgres ou ISO de manière robuste.
 * `now()::TEXT` produit `2026-04-10 12:34:56.789012+00` (espace au lieu de T)
 * que certains navigateurs refusent. On normalise vers ISO 8601.
 */
function parseTimestamp(s: string | null | undefined): number {
  if (!s) return 0;
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return t;
  const normalised = s.replace(" ", "T");
  const t2 = Date.parse(normalised);
  return Number.isNaN(t2) ? 0 : t2;
}

export default function DypOnlinePlay({
  room,
  players,
  messages,
  votes,
  myName,
  onlineNames,
  playerAvatars,
}: Props) {
  const t = useTranslations("games.dyp.online.play");
  const tChat = useTranslations("games.dyp.online.chat");

  const state = readState(room);
  const voteRound = room.vote_round ?? 0;

  // Pendant la pause inter-duel ou inter-round, le `vote_round` a été
  // incrémenté côté serveur juste après la résolution. Pour continuer à
  // montrer "qui a voté pour qui", on doit lire les votes du round précédent.
  const inMatchTransitionFlag = !!state?.pendingMatchTransition;
  const inRoundTransitionFlag = !!state?.pendingTransition;
  const voteDisplayRound =
    inMatchTransitionFlag || inRoundTransitionFlag ? voteRound - 1 : voteRound;

  const currentVotes = votes.filter((v) => v.vote_round === voteDisplayRound);

  const cardById = useMemo(() => {
    const map = new Map<string, DYPCard>();
    state?.cards.forEach((c) => map.set(c.id, c));
    return map;
  }, [state]);

  const currentMatch: DypMatch | null = state
    ? state.bracket[state.currentRound - 1]?.[state.currentMatchIndex] ?? null
    : null;
  const card1 = currentMatch ? cardById.get(currentMatch.card1Id) ?? null : null;
  const card2 = currentMatch ? cardById.get(currentMatch.card2Id) ?? null : null;

  const myVote = currentVotes.find((v) => v.voter_name === myName);
  const myCardId = myVote ? cardIdFromVote(myVote.target_name) : null;

  const votesByCard = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const v of currentVotes) {
      const id = cardIdFromVote(v.target_name);
      if (!id) continue;
      const list = map.get(id) ?? [];
      list.push(v.voter_name);
      map.set(id, list);
    }
    return map;
  }, [currentVotes]);

  // ── Timer ─────────────────────────────────────────────────
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const startedAtMs = parseTimestamp(state?.currentRoundStartedAt);
  const tourMs = (state?.tourTimeSeconds ?? 60) * 1000;
  const remainingMs = startedAtMs > 0 ? Math.max(0, startedAtMs + tourMs - now) : tourMs;
  const remainingSec = Math.ceil(remainingMs / 1000);
  const progress = Math.max(0, Math.min(1, remainingMs / tourMs));

  // Timer de transition entre rounds
  const transitionStartedMs = parseTimestamp(state?.transitionStartedAt);
  const transitionMs = DYP_TRANSITION_SECONDS * 1000;
  const transitionRemainingMs =
    state?.pendingTransition && transitionStartedMs > 0
      ? Math.max(0, transitionStartedMs + transitionMs - now)
      : 0;
  const transitionRemainingSec = Math.ceil(transitionRemainingMs / 1000);

  // Timer de transition entre duels (court)
  const matchTransitionStartedMs = parseTimestamp(state?.matchTransitionStartedAt);
  const matchTransitionMs = DYP_MATCH_TRANSITION_SECONDS * 1000;
  const matchTransitionRemainingMs =
    state?.pendingMatchTransition && matchTransitionStartedMs > 0
      ? Math.max(0, matchTransitionStartedMs + matchTransitionMs - now)
      : 0;

  // Helper : suis-je le 1er joueur online (par join_order) ?
  function amILeader(): boolean {
    const sortedPlayers = [...players].sort(
      (a, b) => a.join_order - b.join_order
    );
    const firstOnline = sortedPlayers.find((p) =>
      onlineNames.size === 0 ? true : onlineNames.has(p.display_name)
    );
    return firstOnline?.display_name === myName;
  }

  // Refs : on garde la dernière clé "successfully fired" + un timestamp pour
  // throttle les retries (1 toutes les 1.5 s) en cas d'erreur RPC.
  const forcedTimeoutRef = useRef<{ key: string; ts: number } | null>(null);
  const forcedAdvanceRef = useRef<{ key: string; ts: number } | null>(null);
  const forcedMatchAdvanceRef = useRef<{ key: string; ts: number } | null>(null);

  function shouldFire(
    ref: React.MutableRefObject<{ key: string; ts: number } | null>,
    key: string
  ): boolean {
    const last = ref.current;
    if (!last) return true;
    if (last.key !== key) return true;
    return Date.now() - last.ts > 1500;
  }

  // Quand le timer du duel = 0 : leader force la résolution.
  useEffect(() => {
    if (!state || state.pendingTransition || state.pendingMatchTransition) return;
    if (remainingMs > 0) return;
    if (startedAtMs <= 0) return;
    const key = `${room.id}:${voteRound}`;
    if (!shouldFire(forcedTimeoutRef, key)) return;
    if (!amILeader()) return;

    forcedTimeoutRef.current = { key, ts: Date.now() };
    const supabase = createClient();
    supabase
      .rpc("dyp_force_timeout", {
        p_room_id: room.id,
        p_vote_round: voteRound,
      })
      .then(({ error }) => {
        if (error) {
          console.error("[dyp_force_timeout]", error);
          // Reset partiel pour permettre un retry rapide
          forcedTimeoutRef.current = { key, ts: Date.now() - 1000 };
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingMs, voteRound, room.id, state?.pendingTransition, state?.pendingMatchTransition]);

  // Quand le timer inter-rounds = 0 : leader force le nouveau round.
  useEffect(() => {
    if (!state || !state.pendingTransition) return;
    if (transitionRemainingMs > 0) return;
    if (transitionStartedMs <= 0) return;
    const key = `${room.id}:${voteRound}`;
    if (!shouldFire(forcedAdvanceRef, key)) return;
    if (!amILeader()) return;

    forcedAdvanceRef.current = { key, ts: Date.now() };
    const supabase = createClient();
    supabase
      .rpc("dyp_force_round_advance", {
        p_room_id: room.id,
        p_vote_round: voteRound,
      })
      .then(({ error }) => {
        if (error) {
          console.error("[dyp_force_round_advance]", error);
          forcedAdvanceRef.current = { key, ts: Date.now() - 1000 };
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transitionRemainingMs, voteRound, room.id, state?.pendingTransition]);

  // Quand le timer inter-duels = 0 : leader force le duel suivant.
  useEffect(() => {
    if (!state || !state.pendingMatchTransition) return;
    if (matchTransitionRemainingMs > 0) return;
    if (matchTransitionStartedMs <= 0) return;
    const key = `${room.id}:${voteRound}`;
    if (!shouldFire(forcedMatchAdvanceRef, key)) return;
    if (!amILeader()) return;

    forcedMatchAdvanceRef.current = { key, ts: Date.now() };
    const supabase = createClient();
    supabase
      .rpc("dyp_force_match_advance", {
        p_room_id: room.id,
        p_vote_round: voteRound,
      })
      .then(({ error }) => {
        if (error) {
          console.error("[dyp_force_match_advance]", error);
          forcedMatchAdvanceRef.current = { key, ts: Date.now() - 1000 };
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchTransitionRemainingMs, voteRound, room.id, state?.pendingMatchTransition]);

  // ── Voter ─────────────────────────────────────────────────
  async function castVote(cardId: string) {
    if (!state) return;
    if (state.pendingTransition || state.pendingMatchTransition) return;
    if (myCardId === cardId) return;
    vibrate(40);
    const supabase = createClient();
    const { error } = await supabase.rpc("dyp_cast_vote", {
      p_room_id: room.id,
      p_vote_round: voteRound,
      p_card_id: cardId,
    });
    if (error) console.error("[dyp_cast_vote]", error);
  }

  if (!state) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <p className="text-surface-500 text-sm animate-pulse">{t("preparing")}</p>
      </div>
    );
  }

  const totalMatchesInRound = state.bracket[state.currentRound - 1]?.length ?? 0;
  const inRoundTransition = state.pendingTransition;
  const inMatchTransition = !!state.pendingMatchTransition;
  // Pendant la pause inter-duel, le winnerId est déjà posé sur le match courant
  const matchWinnerId =
    inMatchTransition && currentMatch ? currentMatch.winnerId : null;

  return (
    <div className="h-screen bg-surface-950 bg-grid flex flex-col overflow-hidden">
      {/* Bandeau round + timer (compact) */}
      <div className="px-4 pt-safe pt-2 pb-1.5 space-y-1.5 shrink-0 max-w-md w-full mx-auto">
        <div className="flex items-center justify-between text-[11px] text-surface-500">
          <span className="font-mono">
            {t("roundLabel", {
              current: state.currentRound,
              total: state.totalRounds,
            })}
          </span>
          <span className="font-mono">
            {t("matchLabel", {
              current: state.currentMatchIndex + 1,
              total: totalMatchesInRound,
            })}
          </span>
        </div>

        {/* Timer (caché en transition) */}
        {!inRoundTransition && !inMatchTransition && (
          <div className="rounded-lg border border-amber-700/30 bg-amber-950/20 px-2.5 py-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-surface-500">{t("timeLeft")}</span>
              <span
                className={`font-mono font-bold ${
                  remainingSec <= 5 ? "text-red-400" : "text-amber-300"
                }`}
              >
                {remainingSec}s
              </span>
            </div>
            <div className="h-1 rounded-full bg-surface-800/60 overflow-hidden mt-1">
              <motion.div
                className={`h-full ${
                  remainingSec <= 5 ? "bg-red-500" : "bg-amber-500"
                }`}
                animate={{ width: `${progress * 100}%` }}
                transition={{ duration: 0.2, ease: "linear" }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Zone centrale : scène (cartes compactes), hauteur naturelle. */}
      <div className="shrink-0 px-4 py-2 w-full">
        <div className="max-w-[170px] w-full mx-auto">
          {inRoundTransition ? (
            <TransitionScreen
              state={state}
              cardById={cardById}
              remainingSec={transitionRemainingSec}
              t={t}
            />
          ) : (
            <DuelScreen
              key={`${state.currentRound}-${state.currentMatchIndex}`}
              card1={card1}
              card2={card2}
              myCardId={myCardId}
              winnerId={matchWinnerId}
              votesByCard={votesByCard}
              playerAvatars={playerAvatars}
              onVote={castVote}
              t={t}
              disabled={inMatchTransition}
            />
          )}
        </div>
      </div>

      {/* Chat — prend tout l'espace restant avec un mini gap visuel. */}
      <div className="flex-1 min-h-0 mt-1 border-t border-surface-800/40 bg-surface-950/95 w-full">
        <div className="max-w-md w-full mx-auto h-full flex flex-col">
          <RoomChat
            roomId={room.id}
            myName={myName}
            messages={messages}
            playerAvatars={playerAvatars}
            mode="realtime"
            messageMeta={{ discussion_turn: 0, vote_round: voteRound }}
            className="h-full"
            labels={{
              emptyState: tChat("emptyState"),
              inputPlaceholder: tChat("inputPlaceholder"),
              sendShort: tChat("sendShort"),
              passShort: tChat("passShort"),
              passedLabel: tChat("passedLabel"),
              waitingForOther: () => "",
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Sous-composant : Duel (2 cartes pleines empilées) ───────────────────────
function DuelScreen({
  card1,
  card2,
  myCardId,
  winnerId,
  votesByCard,
  playerAvatars,
  onVote,
  t,
  disabled,
}: {
  card1: DYPCard | null;
  card2: DYPCard | null;
  myCardId: string | null;
  winnerId: string | null;
  votesByCard: Map<string, string[]>;
  playerAvatars: Record<string, string | null>;
  onVote: (cardId: string) => void;
  t: ReturnType<typeof useTranslations>;
  disabled: boolean;
}) {
  if (!card1 || !card2) {
    return (
      <p className="text-surface-500 text-sm text-center py-8">{t("noDuel")}</p>
    );
  }

  // Si on a un winner (pause inter-duels), on indique qui a perdu pour
  // appliquer l'animation de défaite (fade + shrink).
  const hasWinner = !!winnerId;
  const card1IsWinner = hasWinner && winnerId === card1.id;
  const card2IsWinner = hasWinner && winnerId === card2.id;
  const card1IsLoser = hasWinner && !card1IsWinner;
  const card2IsLoser = hasWinner && !card2IsWinner;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.2 }}
      className="w-full flex flex-col items-center gap-1.5"
    >
      <DuelCard
        card={card1}
        isMyVote={myCardId === card1.id}
        isWinner={card1IsWinner}
        isLoser={card1IsLoser}
        voters={votesByCard.get(card1.id) ?? []}
        playerAvatars={playerAvatars}
        onClick={() => onVote(card1.id)}
        disabled={disabled}
      />

      {/* VS badge compact */}
      <div className="shrink-0 flex items-center gap-2 w-full">
        <div className="flex-1 h-px bg-surface-800/60" />
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 border border-surface-700/40 bg-surface-900"
          style={{ boxShadow: "0 0 10px rgba(0,0,0,0.5)" }}
        >
          <span className="text-amber-400/70 text-[9px] font-black tracking-tight">
            {t("vs")}
          </span>
        </div>
        <div className="flex-1 h-px bg-surface-800/60" />
      </div>

      <DuelCard
        card={card2}
        isMyVote={myCardId === card2.id}
        isWinner={card2IsWinner}
        isLoser={card2IsLoser}
        voters={votesByCard.get(card2.id) ?? []}
        playerAvatars={playerAvatars}
        onClick={() => onVote(card2.id)}
        disabled={disabled}
      />
    </motion.div>
  );
}

function DuelCard({
  card,
  isMyVote,
  isWinner,
  isLoser,
  voters,
  playerAvatars,
  onClick,
  disabled,
}: {
  card: DYPCard;
  isMyVote: boolean;
  isWinner: boolean;
  isLoser: boolean;
  voters: string[];
  playerAvatars: Record<string, string | null>;
  onClick: () => void;
  disabled: boolean;
}) {
  // Mise en valeur : si on est en pause inter-duel, on agrandit le winner
  // et on fade le loser. Sinon, on met juste un ring si c'est mon vote.
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      animate={{
        scale: isWinner ? 1.04 : isLoser ? 0.9 : 1,
        opacity: isLoser ? 0.25 : 1,
        y: isLoser ? 8 : 0,
      }}
      transition={{ duration: 0.35, ease: "easeInOut" }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      className={`relative rounded-2xl overflow-hidden cursor-pointer shrink-0
        w-full aspect-square
        transition-shadow
        ${isWinner
          ? "ring-2 ring-amber-400/90"
          : isMyVote
            ? "ring-2 ring-amber-400/70"
            : "ring-1 ring-surface-700/40"
        }`}
      style={{
        boxShadow: isWinner
          ? "0 0 32px rgba(245,158,11,0.55)"
          : isMyVote
            ? "0 0 22px rgba(245,158,11,0.35)"
            : "0 4px 24px rgba(0,0,0,0.5)",
      }}
    >
      {card.imageUrl ? (
        <Image
          src={card.imageUrl}
          alt={card.name}
          fill
          sizes="(max-width: 768px) 90vw, 320px"
          className="object-cover"
          unoptimized
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-amber-900/70 via-surface-900 to-brand-900/70" />
      )}

      {/* Gradient bottom pour lisibilité du nom */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

      {/* Nom carte */}
      <div className="absolute bottom-0 left-0 right-0 px-2 pb-1.5 pt-3">
        <p className="font-display font-bold text-white text-xs leading-tight drop-shadow-lg line-clamp-2 text-center">
          {card.name}
        </p>
      </div>

      {/* Couronne winner */}
      {isWinner && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.05, type: "spring", stiffness: 320 }}
          className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-amber-500/95 flex items-center justify-center shadow-lg"
        >
          <span className="text-sm">👑</span>
        </motion.div>
      )}

      {/* Avatars des votants : taille adaptative selon le nombre */}
      {voters.length > 0 && (
        <VoterStack voters={voters} playerAvatars={playerAvatars} />
      )}
    </motion.button>
  );
}

/**
 * Pile d'avatars de votants empilés. La taille de chaque avatar et le
 * recouvrement diminuent quand le nombre augmente, pour qu'on les voie tous
 * dans la limite de la carte (~150 px de large).
 */
function VoterStack({
  voters,
  playerAvatars,
}: {
  voters: string[];
  playerAvatars: Record<string, string | null>;
}) {
  const n = voters.length;
  // Tailles (px) en fonction du nombre — pensé pour tenir dans une carte 160 px.
  let size: number;
  if (n <= 1) size = 28;
  else if (n <= 3) size = 26;
  else if (n <= 6) size = 22;
  else if (n <= 10) size = 18;
  else size = 15;
  // Overlap = ~40 % de la taille → resserre la pile mais garde l'avatar lisible.
  const overlap = Math.round(size * 0.4);

  return (
    <div className="absolute top-1.5 left-1.5 flex" style={{ marginLeft: 0 }}>
      <AnimatePresence>
        {voters.map((name, i) => (
          <motion.div
            key={name}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.2 }}
            style={{
              marginLeft: i === 0 ? 0 : -overlap,
              zIndex: voters.length - i,
            }}
          >
            <VoterAvatar
              src={playerAvatars[name] ?? null}
              name={name}
              size={size}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

const VOTER_GRADIENTS = [
  "from-brand-600 to-ghost-600",
  "from-brand-500 to-blue-600",
  "from-ghost-600 to-pink-600",
  "from-emerald-500 to-brand-600",
  "from-orange-500 to-ghost-600",
];

function gradientFor(name: string): string {
  return VOTER_GRADIENTS[name.charCodeAt(0) % VOTER_GRADIENTS.length];
}

function VoterAvatar({
  src,
  name,
  size,
}: {
  src: string | null;
  name: string;
  size: number;
}) {
  const initial = name.charAt(0).toUpperCase() || "?";
  const fontSize = Math.max(8, Math.round(size * 0.45));
  return (
    <div
      className="rounded-full overflow-hidden ring-2 ring-surface-950 shrink-0"
      style={{ width: size, height: size }}
    >
      {src ? (
        <div className="relative w-full h-full">
          <Image src={src} alt={name} fill className="object-cover" sizes="32px" />
        </div>
      ) : (
        <div
          className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${gradientFor(name)} text-white font-bold`}
          style={{ fontSize }}
        >
          {initial}
        </div>
      )}
    </div>
  );
}

// ── Sous-composant : Transition entre rounds (qualifiés) ──────────────────
function TransitionScreen({
  state,
  cardById,
  remainingSec,
  t,
}: {
  state: DypOnlineState;
  cardById: Map<string, DYPCard>;
  remainingSec: number;
  t: ReturnType<typeof useTranslations>;
}) {
  // Liste des winners du round qui vient de se terminer
  const justFinishedRound = state.bracket[state.currentRound - 1] ?? [];
  const winners = justFinishedRound
    .map((m) => (m.winnerId ? cardById.get(m.winnerId) ?? null : null))
    .filter((c): c is DYPCard => c !== null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3 py-2"
    >
      <div className="text-center space-y-1">
        <p className="text-amber-400/70 text-[10px] uppercase tracking-[0.2em] font-mono">
          {t("transition.title", { round: state.currentRound })}
        </p>
        <h2 className="text-white font-display font-black text-xl">
          {t("transition.qualified", { count: winners.length })}
        </h2>
        <p className="text-surface-500 text-xs">
          {t("transition.next", { seconds: remainingSec })}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {winners.map((card) => (
          <motion.div
            key={card.id}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 18 }}
            className="rounded-2xl border border-amber-700/30 bg-amber-950/20 overflow-hidden"
          >
            {card.imageUrl ? (
              <div className="relative w-full aspect-square">
                <Image
                  src={card.imageUrl}
                  alt={card.name}
                  fill
                  sizes="(max-width: 768px) 50vw, 200px"
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="w-full aspect-square bg-amber-950/40 flex items-center justify-center">
                <span className="text-4xl">⚡</span>
              </div>
            )}
            <p className="px-2 py-1 text-white text-xs font-bold truncate text-center">
              {card.name}
            </p>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
