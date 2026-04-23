"use client";

/**
 * Phase "playing" de Outbid online (1v1 enchères).
 *
 * Flux :
 *   - Mon tour (`awaitingResponse === myName`) :
 *       - Surenchérir : RPC `outbid_place_bid(room_id, vote_round, amount)`
 *       - Passer       : RPC `outbid_pass(room_id, vote_round)`
 *   - Tour adverse : message d'attente.
 *   - Timer = `decisionStartedAt + tourTimeSeconds`. Reset à chaque action
 *     côté serveur. À expiration, **n'importe quel client** appelle
 *     `outbid_force_timeout` (pas de leader logic, le SQL est idempotent).
 *
 * Robustesse (leçons de DYP) :
 *   - Un seul `setInterval` persistant (créé au mount avec deps `[]`) qui
 *     lit l'état courant via une `ref` synchronisée à chaque render → jamais
 *     de blocage par stale closures.
 *   - Bouton manuel "Forcer la fin du tour" si bloqué > 5s.
 *   - Logs en console pour diagnostic en cas de RPC error.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import RoomChat from "@/games/online/components/RoomChat";
import { createClient } from "@/lib/supabase/client";
import { vibrate } from "@/lib/utils";
import {
  OUTBID_QUICK_BIDS,
  type OutbidOpeningBidder,
} from "@/games/outbid/online-config";
import type {
  OnlineRoom,
  RoomPlayer,
  RoomMessage,
} from "@/types/rooms";
import type { DYPCard } from "@/types/games";

interface OutbidPlayer {
  name: string;
  points: number;
  team: Array<{ cardId: string; price: number }>;
}

interface OutbidBid {
  amount: number;
  bidder: string;
}

interface OutbidOnlineState {
  presetId: string | null;
  teamSize: number;
  tourTimeSeconds: number;
  openingBidder: OutbidOpeningBidder;
  cards: DYPCard[];
  cardOrder: string[];
  currentCardIndex: number;
  currentBid: OutbidBid | null;
  awaitingResponse: string | null;
  decisionStartedAt: string | null;
  playerA: OutbidPlayer;
  playerB: OutbidPlayer;
  firstBidder: string;
  lastWinner: string | null;
  lastLoser: string | null;
  autoFill: boolean;
  finished: boolean;
}

interface Props {
  room: OnlineRoom;
  players: RoomPlayer[];
  messages: RoomMessage[];
  myName: string;
  onlineNames: Set<string>;
  playerAvatars: Record<string, string | null>;
}

function readState(room: OnlineRoom): OutbidOnlineState | null {
  const cfg = (room.config ?? {}) as Record<string, unknown>;
  const s = cfg.outbid as OutbidOnlineState | undefined;
  if (!s || !s.playerA || !s.playerB) return null;
  return s;
}

function parseTimestamp(s: string | null | undefined): number {
  if (!s) return 0;
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return t;
  const t2 = Date.parse(s.replace(" ", "T"));
  return Number.isNaN(t2) ? 0 : t2;
}

export default function OutbidOnlinePlay({
  room,
  players: _players,
  messages,
  myName,
  onlineNames: _onlineNames,
  playerAvatars,
}: Props) {
  const t = useTranslations("games.outbid.online.play");
  const tChat = useTranslations("games.outbid.online.chat");

  const state = readState(room);
  const voteRound = room.vote_round ?? 0;

  // ── Tick global (200ms) pour timer ────────────────────────────────
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);

  // ── Cartes indexées ───────────────────────────────────────────────
  const cardById = useMemo(() => {
    const map = new Map<string, DYPCard>();
    state?.cards.forEach((c) => map.set(c.id, c));
    return map;
  }, [state]);

  // ── Joueur courant / adversaire ───────────────────────────────────
  const myPlayer: OutbidPlayer | null = state
    ? state.playerA.name === myName
      ? state.playerA
      : state.playerB.name === myName
        ? state.playerB
        : null
    : null;
  const otherPlayer: OutbidPlayer | null = state
    ? state.playerA.name === myName
      ? state.playerB
      : state.playerB.name === myName
        ? state.playerA
        : null
    : null;
  const isSpectator = !myPlayer;

  // ── Carte courante ────────────────────────────────────────────────
  const currentCardId = state
    ? state.cardOrder[state.currentCardIndex] ?? null
    : null;
  const currentCard = currentCardId ? cardById.get(currentCardId) ?? null : null;

  // ── Timer ─────────────────────────────────────────────────────────
  const decisionStartedMs = parseTimestamp(state?.decisionStartedAt);
  const tourMs = (state?.tourTimeSeconds ?? 60) * 1000;
  const remainingMs =
    decisionStartedMs > 0
      ? Math.max(0, decisionStartedMs + tourMs - now)
      : tourMs;
  const remainingSec = Math.ceil(remainingMs / 1000);
  const progress = Math.max(0, Math.min(1, remainingMs / tourMs));
  const isUrgent = remainingSec <= 5 && remainingSec > 0;

  const isMyTurn =
    !!state && !!myPlayer && state.awaitingResponse === myName;
  const currentBid = state?.currentBid ?? null;

  // Vibration à 5s restantes (1 seule fois par décision)
  const vibratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!state) return;
    const key = `${state.currentCardIndex}-${voteRound}`;
    if (isUrgent && isMyTurn && vibratedRef.current !== key) {
      vibratedRef.current = key;
      vibrate(60);
    }
    if (!isUrgent && vibratedRef.current === key && remainingSec > 5) {
      vibratedRef.current = null;
    }
  }, [isUrgent, isMyTurn, state, voteRound, remainingSec]);

  // ── Saisie de mise (input local) ──────────────────────────────────
  const [bidInput, setBidInput] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset l'input quand la carte change ou quand on n'est plus le décisionnaire
  const decisionKey = `${state?.currentCardIndex}-${state?.awaitingResponse}-${voteRound}`;
  const lastDecisionKeyRef = useRef<string>("");
  useEffect(() => {
    if (lastDecisionKeyRef.current !== decisionKey) {
      lastDecisionKeyRef.current = decisionKey;
      setBidInput("");
    }
  }, [decisionKey]);

  const minBid = (currentBid?.amount ?? 0) + 1;
  const maxBid = myPlayer?.points ?? 0;
  const parsedBid = Number(bidInput);
  const isBidValid =
    Number.isFinite(parsedBid) && parsedBid >= minBid && parsedBid <= maxBid;

  // ── Actions ───────────────────────────────────────────────────────
  async function placeBid(amount: number) {
    if (!state || !isMyTurn) return;
    if (amount < minBid) return;
    if (amount > maxBid) return;
    setIsSubmitting(true);
    vibrate(30);
    const supabase = createClient();
    const { error } = await supabase.rpc("outbid_place_bid", {
      p_room_id: room.id,
      p_vote_round: voteRound,
      p_amount: amount,
    });
    setIsSubmitting(false);
    if (error) {
      console.error("[outbid_place_bid]", error);
      alert(t("bidError", { msg: error.message }));
    } else {
      setBidInput("");
    }
  }

  async function pass() {
    if (!state || !isMyTurn) return;
    setIsSubmitting(true);
    vibrate(30);
    const supabase = createClient();
    const { error } = await supabase.rpc("outbid_pass", {
      p_room_id: room.id,
      p_vote_round: voteRound,
    });
    setIsSubmitting(false);
    if (error) {
      console.error("[outbid_pass]", error);
      alert(t("passError", { msg: error.message }));
    }
  }

  function applyQuick(delta: number) {
    if (!myPlayer || !currentBid) return;
    const newAmount = Math.min(maxBid, currentBid.amount + delta);
    setBidInput(String(newAmount));
  }
  function applyAllIn() {
    if (!myPlayer) return;
    setBidInput(String(maxBid));
  }

  // ── Auto-timeout : interval persistant qui lit stateRef ───────────
  const stateRef = useRef<{
    roomId: string;
    voteRound: number;
    decisionStartedMs: number;
    tourMs: number;
    finished: boolean;
  }>({
    roomId: room.id,
    voteRound,
    decisionStartedMs: 0,
    tourMs: 60000,
    finished: false,
  });

  useEffect(() => {
    stateRef.current = {
      roomId: room.id,
      voteRound,
      decisionStartedMs,
      tourMs,
      finished: !!state?.finished,
    };
  });

  const lastTimeoutAttemptRef = useRef<{ key: string; ts: number } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const tick = async () => {
      const s = stateRef.current;
      if (s.finished) return;
      // Si on a un timestamp valide et que le timer n'est pas écoulé, on attend.
      const tsValid = s.decisionStartedMs > 0;
      if (tsValid && Date.now() < s.decisionStartedMs + s.tourMs) return;
      // Throttle 1.5s par clé
      const key = `${s.roomId}:${s.voteRound}`;
      const last = lastTimeoutAttemptRef.current;
      if (last && last.key === key && Date.now() - last.ts < 1500) return;
      lastTimeoutAttemptRef.current = { key, ts: Date.now() };

      const { error } = await supabase.rpc("outbid_force_timeout", {
        p_room_id: s.roomId,
        p_vote_round: s.voteRound,
      });
      if (error) {
        console.error(
          `[outbid_force_timeout] room=${s.roomId} vr=${s.voteRound}`,
          error
        );
      }
    };
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, []);

  // ── Bouton manuel de secours après 5s de blocage ──────────────────
  const [showManualUnlock, setShowManualUnlock] = useState(false);
  useEffect(() => {
    setShowManualUnlock(false);
    if (!state || state.finished) return;
    if (remainingSec > 0) return;
    const tm = setTimeout(() => setShowManualUnlock(true), 5000);
    return () => clearTimeout(tm);
  }, [state, remainingSec, voteRound]);

  async function manualForceTimeout() {
    const supabase = createClient();
    const { error } = await supabase.rpc("outbid_force_timeout", {
      p_room_id: room.id,
      p_vote_round: voteRound,
    });
    if (error) {
      console.error("[manual outbid_force_timeout]", error);
      alert(`Erreur RPC : ${error.message}`);
    }
  }

  if (!state) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <p className="text-surface-500 text-sm animate-pulse">{t("preparing")}</p>
      </div>
    );
  }

  const totalCards = state.cardOrder.length;
  const cardNumber = Math.min(state.currentCardIndex + 1, totalCards);

  return (
    <div className="h-screen bg-surface-950 bg-grid flex flex-col overflow-hidden">
      {/* Bandeau adversaire en haut */}
      {otherPlayer && (
        <PlayerBanner
          player={otherPlayer}
          cards={state.cards}
          cardById={cardById}
          isYou={false}
          isHisTurn={state.awaitingResponse === otherPlayer.name}
          avatar={playerAvatars[otherPlayer.name] ?? null}
          t={t}
        />
      )}

      {/* Centre : carte + enchère + timer */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="flex-1 min-h-0 px-3 py-2 flex flex-col items-center justify-center max-w-md w-full mx-auto">
          {/* Carte */}
          <div className="w-full flex justify-center">
            <CurrentCardDisplay card={currentCard} />
          </div>

          {/* Position dans la pioche */}
          <p className="text-surface-600 text-[10px] font-mono mt-1.5">
            {t("cardCounter", { current: cardNumber, total: totalCards })}
          </p>

          {/* Enchère courante */}
          {currentBid && (
            <div className="mt-2 px-3 py-1.5 rounded-xl bg-amber-950/40 border border-amber-700/40">
              <p className="text-center text-amber-300 font-mono text-xs">
                <span className="font-bold text-base">{currentBid.amount}</span>{" "}
                <span className="opacity-70">
                  {t("byBidder", { name: currentBid.bidder })}
                </span>
              </p>
            </div>
          )}

          {/* Timer */}
          <div className="w-full mt-2 max-w-xs">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-surface-500">{t("timeLeft")}</span>
              <span
                className={`font-mono font-bold ${
                  isUrgent ? "text-red-400" : "text-amber-300"
                }`}
              >
                {remainingSec}s
              </span>
            </div>
            <div className="h-1 rounded-full bg-surface-800/60 overflow-hidden mt-1">
              <motion.div
                className={`h-full ${isUrgent ? "bg-red-500" : "bg-amber-500"}`}
                animate={{ width: `${progress * 100}%` }}
                transition={{ duration: 0.2, ease: "linear" }}
              />
            </div>
          </div>
        </div>

        {/* UI décision */}
        {!isSpectator && myPlayer && (
          <div className="shrink-0 px-3 pb-2 max-w-md w-full mx-auto">
            {isMyTurn ? (
              <DecisionUI
                bidInput={bidInput}
                setBidInput={setBidInput}
                minBid={minBid}
                maxBid={maxBid}
                isBidValid={isBidValid}
                isSubmitting={isSubmitting}
                onBid={() => placeBid(parsedBid)}
                onPass={pass}
                onQuick={applyQuick}
                onAllIn={applyAllIn}
                myPoints={myPlayer.points}
                t={t}
              />
            ) : (
              <div className="rounded-xl border border-surface-700/40 bg-surface-900/50 px-3 py-2 text-center">
                <p className="text-surface-400 text-sm">
                  {t("waitingForOther", { name: state.awaitingResponse ?? "?" })}
                </p>
              </div>
            )}

            {showManualUnlock && (
              <button
                type="button"
                onClick={manualForceTimeout}
                className="mt-2 w-full py-2 rounded-lg bg-red-600/80 hover:bg-red-500 text-white text-xs font-bold transition-colors"
              >
                {t("manualUnlock")}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Bandeau "moi" en bas (juste équipe + points, plus compact) */}
      {myPlayer && (
        <PlayerBanner
          player={myPlayer}
          cards={state.cards}
          cardById={cardById}
          isYou={true}
          isHisTurn={isMyTurn}
          avatar={playerAvatars[myPlayer.name] ?? null}
          t={t}
        />
      )}

      {/* Chat */}
      <div className="shrink-0 border-t border-surface-800/40 bg-surface-950/95 h-40">
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

// ── Sous-composant : bandeau joueur (avatar, points, équipe) ─────────────
function PlayerBanner({
  player,
  cardById,
  isYou,
  isHisTurn,
  avatar,
  t,
}: {
  player: OutbidPlayer;
  cards: DYPCard[];
  cardById: Map<string, DYPCard>;
  isYou: boolean;
  isHisTurn: boolean;
  avatar: string | null;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div
      className={`shrink-0 px-3 py-1.5 border-b border-surface-800/40 ${
        isHisTurn ? "bg-amber-950/30" : "bg-surface-900/40"
      }`}
    >
      <div className="max-w-md w-full mx-auto flex items-center gap-2">
        {/* Avatar + nom + points */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative w-7 h-7 rounded-full overflow-hidden ring-2 ring-surface-800">
            {avatar ? (
              <Image
                src={avatar}
                alt={player.name}
                fill
                sizes="32px"
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-brand-600 to-ghost-600 flex items-center justify-center text-white text-xs font-bold">
                {player.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-white text-xs font-bold truncate max-w-[80px]">
              {isYou ? t("you") : player.name}
            </p>
            <p className="text-amber-400 text-[11px] font-mono font-bold">
              {player.points} pts
            </p>
          </div>
        </div>

        {/* Slots équipe (cartes acquises) */}
        <div className="flex-1 min-w-0 flex gap-1 overflow-x-auto no-scrollbar">
          <AnimatePresence>
            {player.team.map((entry, i) => {
              const card = cardById.get(entry.cardId);
              if (!card) return null;
              return (
                <motion.div
                  key={`${entry.cardId}-${i}`}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 320, damping: 20 }}
                  className="relative shrink-0 w-10 h-12 rounded-md overflow-hidden ring-1 ring-amber-700/40"
                  title={`${card.name} — ${entry.price} pts`}
                >
                  {card.imageUrl ? (
                    <Image
                      src={card.imageUrl}
                      alt={card.name}
                      fill
                      sizes="40px"
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-amber-900/60 to-surface-900" />
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/80 text-amber-300 text-[8px] font-mono font-bold text-center leading-tight">
                    {entry.price}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {player.team.length === 0 && (
            <p className="text-surface-700 text-[10px] italic self-center">
              {t("emptyTeam")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sous-composant : carte courante en grand ─────────────────────────────
function CurrentCardDisplay({ card }: { card: DYPCard | null }) {
  if (!card) {
    return (
      <div className="w-40 h-40 rounded-2xl bg-surface-900/60 ring-1 ring-surface-800 flex items-center justify-center">
        <span className="text-surface-700 text-3xl">⌛</span>
      </div>
    );
  }
  return (
    <motion.div
      key={card.id}
      initial={{ opacity: 0, scale: 0.85, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 220, damping: 22 }}
      className="relative w-44 aspect-square rounded-2xl overflow-hidden ring-2 ring-amber-500/60"
      style={{ boxShadow: "0 0 28px rgba(245,158,11,0.35)" }}
    >
      {card.imageUrl ? (
        <Image
          src={card.imageUrl}
          alt={card.name}
          fill
          sizes="(max-width: 768px) 50vw, 200px"
          className="object-cover"
          unoptimized
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-amber-900/70 via-surface-900 to-brand-900/70" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 px-2 pb-1.5 pt-3">
        <p className="font-display font-bold text-white text-sm leading-tight drop-shadow-lg line-clamp-2 text-center">
          {card.name}
        </p>
      </div>
    </motion.div>
  );
}

// ── Sous-composant : UI de décision (mon tour) ───────────────────────────
function DecisionUI({
  bidInput,
  setBidInput,
  minBid,
  maxBid,
  isBidValid,
  isSubmitting,
  onBid,
  onPass,
  onQuick,
  onAllIn,
  myPoints,
  t,
}: {
  bidInput: string;
  setBidInput: (v: string) => void;
  minBid: number;
  maxBid: number;
  isBidValid: boolean;
  isSubmitting: boolean;
  onBid: () => void;
  onPass: () => void;
  onQuick: (delta: number) => void;
  onAllIn: () => void;
  myPoints: number;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="space-y-2">
      {/* Saisie + boutons rapides */}
      <div className="rounded-xl border border-amber-700/40 bg-amber-950/20 p-2 space-y-1.5">
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            value={bidInput}
            onChange={(e) => setBidInput(e.target.value.replace(/[^0-9]/g, ""))}
            min={minBid}
            max={maxBid}
            placeholder={t("bidPlaceholder", { min: minBid })}
            disabled={isSubmitting}
            className="flex-1 bg-surface-900/80 border border-surface-700/60 rounded-lg px-3 py-2 text-amber-300 font-mono font-bold text-base text-center focus:outline-none focus:ring-2 focus:ring-amber-500/60"
          />
          <button
            type="button"
            onClick={onBid}
            disabled={!isBidValid || isSubmitting}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
              isBidValid && !isSubmitting
                ? "bg-amber-500 hover:bg-amber-400 text-white"
                : "bg-surface-800/60 text-surface-700 cursor-not-allowed"
            }`}
          >
            {t("bidAction")}
          </button>
        </div>

        {/* Boutons rapides */}
        <div className="grid grid-cols-4 gap-1">
          {OUTBID_QUICK_BIDS.map((delta) => (
            <button
              key={delta}
              type="button"
              onClick={() => onQuick(delta)}
              disabled={isSubmitting || maxBid < minBid}
              className="py-1.5 rounded-md bg-surface-800/80 hover:bg-surface-700 text-amber-300 text-xs font-mono font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              +{delta}
            </button>
          ))}
          <button
            type="button"
            onClick={onAllIn}
            disabled={isSubmitting || maxBid < minBid}
            className="py-1.5 rounded-md bg-red-700/80 hover:bg-red-600 text-white text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t("allIn")}
          </button>
        </div>

        {/* Hint mini */}
        <p className="text-[10px] text-surface-600 text-center font-mono">
          {t("bidRange", { min: minBid, max: maxBid })} · {myPoints}{" "}
          {t("points")}
        </p>
      </div>

      {/* Pass */}
      <button
        type="button"
        onClick={onPass}
        disabled={isSubmitting}
        className="w-full py-2.5 rounded-xl border border-surface-700/60 bg-surface-900/60 hover:bg-surface-800/60 text-surface-300 text-sm font-bold transition-colors disabled:opacity-50"
      >
        {t("pass")}
      </button>
    </div>
  );
}
