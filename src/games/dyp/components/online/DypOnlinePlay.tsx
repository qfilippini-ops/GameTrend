"use client";

/**
 * Phase "playing" de DYP online.
 *
 * Deux modes d'affichage selon `state.pendingTransition` :
 *   - duel       : 2 cartes face à face, on vote pour son préféré
 *   - transition : pause de 3 s entre 2 rounds, affiche les gagnants
 *
 * Logique :
 *   - Vote via RPC `dyp_cast_vote` (target_name = "card:<id>")
 *   - Quand le timer du duel expire, le 1er joueur online (par join_order)
 *     appelle `dyp_force_timeout` pour résoudre le duel.
 *   - Quand le timer de transition (3 s) expire, le 1er joueur online appelle
 *     `dyp_force_round_advance` pour passer au round suivant.
 *   - Tout le reste (résolution, advance bracket) est géré côté serveur par
 *     les triggers/RPCs PG → atomique, pas de race.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import Avatar from "@/components/ui/Avatar";
import RoomChat from "@/games/online/components/RoomChat";
import { createClient } from "@/lib/supabase/client";
import { vibrate } from "@/lib/utils";
import { DYP_TRANSITION_SECONDS } from "@/games/dyp/online-config";
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
  const currentVotes = votes.filter((v) => v.vote_round === voteRound);

  const cardById = useMemo(() => {
    const map = new Map<string, DYPCard>();
    state?.cards.forEach((c) => map.set(c.id, c));
    return map;
  }, [state]);

  // Match courant
  const currentMatch: DypMatch | null = state
    ? state.bracket[state.currentRound - 1]?.[state.currentMatchIndex] ?? null
    : null;
  const card1 = currentMatch ? cardById.get(currentMatch.card1Id) ?? null : null;
  const card2 = currentMatch ? cardById.get(currentMatch.card2Id) ?? null : null;

  // Mon vote actuel
  const myVote = currentVotes.find((v) => v.voter_name === myName);
  const myCardId = myVote ? cardIdFromVote(myVote.target_name) : null;

  // Votes par carte : cardId → noms[]
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

  const startedAtMs = state ? new Date(state.currentRoundStartedAt).getTime() : 0;
  const tourMs = (state?.tourTimeSeconds ?? 60) * 1000;
  const remainingMs = Math.max(0, startedAtMs + tourMs - now);
  const remainingSec = Math.ceil(remainingMs / 1000);
  const progress = Math.max(0, Math.min(1, remainingMs / tourMs));

  // Timer de transition
  const transitionStartedMs =
    state?.transitionStartedAt != null
      ? new Date(state.transitionStartedAt).getTime()
      : 0;
  const transitionMs = DYP_TRANSITION_SECONDS * 1000;
  const transitionRemainingMs = state?.pendingTransition
    ? Math.max(0, transitionStartedMs + transitionMs - now)
    : 0;
  const transitionRemainingSec = Math.ceil(transitionRemainingMs / 1000);

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

  // Quand le timer du duel = 0 : leader force la résolution.
  const forcedTimeoutRef = useRef<string | null>(null);
  useEffect(() => {
    if (!state || state.pendingTransition) return;
    if (remainingMs > 0) return;
    if (forcedTimeoutRef.current === `${room.id}:${voteRound}`) return;
    if (!amILeader()) return;

    forcedTimeoutRef.current = `${room.id}:${voteRound}`;
    const supabase = createClient();
    supabase
      .rpc("dyp_force_timeout", {
        p_room_id: room.id,
        p_vote_round: voteRound,
      })
      .then(({ error }) => {
        if (error) console.error("[dyp_force_timeout]", error);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingMs, voteRound, room.id, state?.pendingTransition]);

  // Quand le timer de transition = 0 : leader force l'avancée du round.
  const forcedAdvanceRef = useRef<string | null>(null);
  useEffect(() => {
    if (!state || !state.pendingTransition) return;
    if (transitionRemainingMs > 0) return;
    if (forcedAdvanceRef.current === `${room.id}:${voteRound}`) return;
    if (!amILeader()) return;

    forcedAdvanceRef.current = `${room.id}:${voteRound}`;
    const supabase = createClient();
    supabase
      .rpc("dyp_force_round_advance", {
        p_room_id: room.id,
        p_vote_round: voteRound,
      })
      .then(({ error }) => {
        if (error) console.error("[dyp_force_round_advance]", error);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transitionRemainingMs, voteRound, room.id, state?.pendingTransition]);

  // ── Voter ─────────────────────────────────────────────────
  async function castVote(cardId: string) {
    if (!state || state.pendingTransition) return;
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

  return (
    <div className="min-h-screen bg-surface-950 bg-grid flex flex-col">
      {/* Bandeau round + timer */}
      <div className="px-4 pt-safe pt-4 pb-3 space-y-3 shrink-0 max-w-md w-full mx-auto">
        <div className="flex items-center justify-between text-xs text-surface-500">
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
        {!state.pendingTransition && (
          <div className="rounded-2xl border border-amber-700/30 bg-gradient-to-br from-amber-950/40 via-surface-900 to-amber-950/30 px-4 py-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-surface-500">{t("timeLeft")}</span>
              <span
                className={`font-mono font-bold ${
                  remainingSec <= 5 ? "text-red-400" : "text-amber-300"
                }`}
              >
                {remainingSec}s
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-800/60 overflow-hidden mt-1.5">
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

      {/* Zone centrale : duel ou transition */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-3">
        <div className="max-w-md w-full mx-auto">
          {state.pendingTransition ? (
            <TransitionScreen
              state={state}
              cardById={cardById}
              remainingSec={transitionRemainingSec}
              t={t}
            />
          ) : (
            <DuelScreen
              card1={card1}
              card2={card2}
              myCardId={myCardId}
              votesByCard={votesByCard}
              playerAvatars={playerAvatars}
              onVote={castVote}
              t={t}
            />
          )}
        </div>
      </div>

      {/* Chat — hauteur fixe avec scroll interne */}
      <div className="border-t border-surface-800/40 bg-surface-950/95 w-full shrink-0">
        <div className="max-w-md w-full mx-auto h-[36vh] min-h-[200px] max-h-[50vh] flex flex-col">
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

// ── Sous-composant : Duel (2 cartes face à face) ─────────────────────────
function DuelScreen({
  card1,
  card2,
  myCardId,
  votesByCard,
  playerAvatars,
  onVote,
  t,
}: {
  card1: DYPCard | null;
  card2: DYPCard | null;
  myCardId: string | null;
  votesByCard: Map<string, string[]>;
  playerAvatars: Record<string, string | null>;
  onVote: (cardId: string) => void;
  t: ReturnType<typeof useTranslations>;
}) {
  if (!card1 || !card2) {
    return (
      <p className="text-surface-500 text-sm text-center py-8">{t("noDuel")}</p>
    );
  }
  return (
    <div className="space-y-3">
      <DuelCard
        card={card1}
        isSelected={myCardId === card1.id}
        voters={votesByCard.get(card1.id) ?? []}
        playerAvatars={playerAvatars}
        onClick={() => onVote(card1.id)}
        t={t}
      />
      {/* Séparateur VS */}
      <div className="flex items-center gap-3 my-1">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent to-amber-700/40" />
        <span className="text-amber-400/70 font-display font-black text-base tracking-widest">
          {t("vs")}
        </span>
        <div className="flex-1 h-px bg-gradient-to-l from-transparent to-amber-700/40" />
      </div>
      <DuelCard
        card={card2}
        isSelected={myCardId === card2.id}
        voters={votesByCard.get(card2.id) ?? []}
        playerAvatars={playerAvatars}
        onClick={() => onVote(card2.id)}
        t={t}
      />
    </div>
  );
}

function DuelCard({
  card,
  isSelected,
  voters,
  playerAvatars,
  onClick,
  t,
}: {
  card: DYPCard;
  isSelected: boolean;
  voters: string[];
  playerAvatars: Record<string, string | null>;
  onClick: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.98 }}
      className={`relative w-full rounded-3xl border overflow-hidden text-left transition-all ${
        isSelected
          ? "border-amber-500/70 bg-amber-950/30 ring-2 ring-amber-500/50"
          : "border-surface-700/40 bg-surface-900/50 hover:border-amber-700/40 hover:bg-amber-950/15"
      }`}
    >
      <div className="flex items-center gap-3 p-3">
        {card.imageUrl ? (
          <div className="relative w-20 h-20 rounded-2xl overflow-hidden border border-surface-700/40 shrink-0">
            <Image
              src={card.imageUrl}
              alt={card.name}
              fill
              sizes="80px"
              className="object-cover"
            />
          </div>
        ) : (
          <div className="w-20 h-20 rounded-2xl bg-surface-800/60 border border-surface-700/40 flex items-center justify-center shrink-0">
            <span className="text-3xl">⚡</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-white font-display font-bold text-base leading-tight truncate">
            {card.name}
          </p>
          <p className="text-surface-500 text-xs mt-0.5">
            {voters.length === 0
              ? t("noVotes")
              : t("votesCount", { count: voters.length })}
          </p>
          {voters.length > 0 && (
            <div className="flex -space-x-2 mt-2">
              <AnimatePresence>
                {voters.slice(0, 6).map((name) => (
                  <motion.div
                    key={name}
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.6 }}
                    className="relative"
                  >
                    <Avatar
                      src={playerAvatars[name]}
                      name={name}
                      size="xs"
                      className="rounded-full ring-2 ring-surface-950"
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
              {voters.length > 6 && (
                <div className="w-6 h-6 rounded-full bg-surface-800 border-2 border-surface-950 flex items-center justify-center text-[9px] font-bold text-surface-400">
                  +{voters.length - 6}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.button>
  );
}

// ── Sous-composant : Transition entre rounds ─────────────────────────────
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
      className="space-y-4 py-2"
    >
      <div className="text-center space-y-1">
        <p className="text-amber-400/70 text-[10px] uppercase tracking-[0.2em] font-mono">
          {t("transition.title", { round: state.currentRound })}
        </p>
        <h2 className="text-white font-display font-black text-2xl">
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
            <p className="px-2 py-1.5 text-white text-xs font-bold truncate text-center">
              {card.name}
            </p>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
