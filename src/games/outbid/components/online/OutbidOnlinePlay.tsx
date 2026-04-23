"use client";

/**
 * Phase "playing" de Outbid online (1v1 enchères).
 *
 * Layout :
 *   - Scène de jeu (2/3 de la hauteur), grille horizontale 20% / 60% / 20% :
 *       • Colonne gauche  (20%, full height) : joueur A — avatar, nom, points,
 *         puis cartes acquises empilées qui remplissent le reste.
 *       • Colonne centre (60%, full height) : carte courante en haut, panel
 *         d'enchère en bas (toujours visible, grisé hors de son tour).
 *       • Colonne droite (20%, full height) : joueur B, mêmes éléments.
 *   - Chat (1/3 de la hauteur).
 *
 * Comportement input :
 *   - L'input affiche la somme **brute** que le joueur veut miser.
 *   - Quick buttons (+100 / +1000 / +10000) **additionnent** au contenu actuel.
 *   - All-in écrit `maxBid`. Validation : montant > currentBid.amount.
 *
 * Robustesse (leçons de DYP) :
 *   - `setInterval` persistant qui appelle `outbid_force_timeout` (idempotent).
 *   - Bouton manuel après 5s de blocage.
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

function formatPoints(n: number): string {
  return n.toLocaleString("fr-FR");
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

  // Conventions d'affichage : moi à gauche / adverse à droite.
  // Spectateur : A à gauche, B à droite.
  const leftPlayer: OutbidPlayer | null = isSpectator
    ? state?.playerA ?? null
    : myPlayer;
  const rightPlayer: OutbidPlayer | null = isSpectator
    ? state?.playerB ?? null
    : otherPlayer;

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

  // Quick buttons : ADDITIONNENT au contenu actuel de l'input
  function applyQuick(delta: number) {
    if (!myPlayer) return;
    setBidInput((prev) => {
      const current = Number(prev);
      const base = Number.isFinite(current) && current > 0 ? current : 0;
      const next = Math.min(maxBid, base + delta);
      return String(next);
    });
  }
  function applyAllIn() {
    if (!myPlayer) return;
    setBidInput(String(maxBid));
  }
  function clearInput() {
    setBidInput("");
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
      const tsValid = s.decisionStartedMs > 0;
      if (tsValid && Date.now() < s.decisionStartedMs + s.tourMs) return;
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
  const teamSize = state.teamSize;

  return (
    <div className="h-screen bg-surface-950 bg-grid flex flex-col overflow-hidden">
      {/* ───── Scène de jeu : 2/3 ───── */}
      <div className="flex-[2] min-h-0 grid grid-cols-[20%_60%_20%]">
        {/* Colonne gauche : joueur A (ou moi) */}
        {leftPlayer && (
          <PlayerColumn
            player={leftPlayer}
            cardById={cardById}
            isYou={!isSpectator && leftPlayer.name === myName}
            isHisTurn={state.awaitingResponse === leftPlayer.name}
            avatar={playerAvatars[leftPlayer.name] ?? null}
            teamSize={teamSize}
            t={t}
          />
        )}

        {/* Colonne centre : carte + bid panel */}
        <div className="min-h-0 flex flex-col px-2 pt-2 pb-2 gap-2">
          {/* Carte + enchère + timer (en haut) */}
          <div className="shrink-0 flex flex-col items-center gap-1.5">
            <CurrentCardDisplay card={currentCard} />
            <p className="text-surface-600 text-[10px] font-mono">
              {t("cardCounter", { current: cardNumber, total: totalCards })}
            </p>
            {currentBid && (
              <div className="px-3 py-1 rounded-lg bg-amber-950/40 border border-amber-700/40">
                <p className="text-center text-amber-300 font-mono text-xs">
                  <span className="font-bold text-base">
                    {formatPoints(currentBid.amount)}
                  </span>{" "}
                  <span className="opacity-70">
                    {t("byBidder", { name: currentBid.bidder })}
                  </span>
                </p>
              </div>
            )}
            <div className="w-full max-w-xs">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-surface-500">{t("timeLeft")}</span>
                <span
                  className={`font-mono font-bold ${
                    isUrgent ? "text-red-400" : "text-amber-300"
                  }`}
                >
                  {remainingSec}s
                </span>
              </div>
              <div className="h-1 rounded-full bg-surface-800/60 overflow-hidden mt-0.5">
                <motion.div
                  className={`h-full ${isUrgent ? "bg-red-500" : "bg-amber-500"}`}
                  animate={{ width: `${progress * 100}%` }}
                  transition={{ duration: 0.2, ease: "linear" }}
                />
              </div>
            </div>
          </div>

          {/* Bid panel : prend le reste de la place verticale, ancré en bas */}
          <div className="flex-1 min-h-0 flex flex-col justify-end">
            {!isSpectator && (
              <>
                <DecisionUI
                  bidInput={bidInput}
                  setBidInput={setBidInput}
                  minBid={minBid}
                  maxBid={maxBid}
                  isBidValid={isBidValid}
                  isSubmitting={isSubmitting}
                  isMyTurn={isMyTurn}
                  awaitingName={state.awaitingResponse}
                  onBid={() => placeBid(parsedBid)}
                  onPass={pass}
                  onQuick={applyQuick}
                  onAllIn={applyAllIn}
                  onClear={clearInput}
                  myPoints={myPlayer?.points ?? 0}
                  t={t}
                />
                {showManualUnlock && (
                  <button
                    type="button"
                    onClick={manualForceTimeout}
                    className="mt-1 w-full py-1.5 rounded-lg bg-red-600/80 hover:bg-red-500 text-white text-xs font-bold transition-colors"
                  >
                    {t("manualUnlock")}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Colonne droite : joueur B (ou adverse) */}
        {rightPlayer && (
          <PlayerColumn
            player={rightPlayer}
            cardById={cardById}
            isYou={!isSpectator && rightPlayer.name === myName}
            isHisTurn={state.awaitingResponse === rightPlayer.name}
            avatar={playerAvatars[rightPlayer.name] ?? null}
            teamSize={teamSize}
            t={t}
          />
        )}
      </div>

      {/* ───── Chat : 1/3 ───── */}
      <div className="flex-1 min-h-0 border-t border-surface-800/60 bg-surface-950/95">
        <div className="max-w-2xl w-full mx-auto h-full flex flex-col">
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

// ── Sous-composant : colonne joueur (avatar → nom → points → cartes) ────
function PlayerColumn({
  player,
  cardById,
  isYou,
  isHisTurn,
  avatar,
  teamSize,
  t,
}: {
  player: OutbidPlayer;
  cardById: Map<string, DYPCard>;
  isYou: boolean;
  isHisTurn: boolean;
  avatar: string | null;
  teamSize: number;
  t: ReturnType<typeof useTranslations>;
}) {
  // Slots fixes = teamSize, remplis chronologiquement
  const slots = Array.from({ length: teamSize }, (_, i) => player.team[i] ?? null);

  return (
    <div
      className={`h-full min-h-0 flex flex-col border-r border-surface-800/60 first:border-l-0 last:border-r-0 first:border-r last:border-l ${
        isHisTurn ? "bg-amber-950/15" : "bg-surface-900/30"
      }`}
    >
      {/* Header : avatar + nom + points */}
      <div
        className={`shrink-0 flex flex-col items-center gap-0.5 px-1 py-2 border-b ${
          isHisTurn
            ? "border-amber-600/60 bg-amber-950/30"
            : "border-surface-800/60"
        }`}
      >
        <div
          className={`relative w-12 h-12 rounded-full overflow-hidden ring-2 ${
            isHisTurn ? "ring-amber-400" : "ring-surface-700"
          }`}
        >
          {avatar ? (
            <Image
              src={avatar}
              alt={player.name}
              fill
              sizes="48px"
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-brand-600 to-ghost-600 flex items-center justify-center text-white text-base font-bold">
              {player.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <p className="text-white text-xs font-bold truncate max-w-full px-1 text-center">
          {isYou ? t("you") : player.name}
        </p>
        <p className="text-amber-400 text-[11px] font-mono font-bold leading-none">
          {formatPoints(player.points)}
        </p>
      </div>

      {/* Cartes empilées : 1 ligne par slot, taille = (hauteur dispo) / teamSize */}
      <div
        className="flex-1 min-h-0 px-1 py-1 grid gap-0.5"
        style={{ gridTemplateRows: `repeat(${teamSize}, minmax(0, 1fr))` }}
      >
        <AnimatePresence>
          {slots.map((entry, i) => {
            if (!entry) {
              return (
                <div
                  key={`empty-${i}`}
                  className="rounded-md border border-dashed border-surface-800/50"
                />
              );
            }
            const card = cardById.get(entry.cardId);
            return (
              <motion.div
                key={`${entry.cardId}-${i}`}
                initial={{ scale: 0.6, opacity: 0, y: -12 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 320, damping: 20 }}
                className="relative rounded-md overflow-hidden ring-1 ring-amber-700/40 bg-surface-900"
                title={card ? `${card.name} — ${formatPoints(entry.price)} pts` : ""}
              >
                {card?.imageUrl ? (
                  <Image
                    src={card.imageUrl}
                    alt={card.name}
                    fill
                    sizes="100px"
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-amber-900/60 to-surface-900 flex items-center justify-center">
                    <span className="text-[8px] text-amber-400 font-bold truncate px-1">
                      {card?.name ?? "?"}
                    </span>
                  </div>
                )}
                {/* Badge prix en coin */}
                <div className="absolute top-0.5 right-0.5 px-1 py-px rounded bg-black/85 text-amber-300 text-[8px] font-mono font-bold leading-tight">
                  {formatPoints(entry.price)}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Sous-composant : carte courante en haut au centre ────────────────────
function CurrentCardDisplay({ card }: { card: DYPCard | null }) {
  if (!card) {
    return (
      <div className="w-28 h-28 rounded-xl bg-surface-900/60 ring-1 ring-surface-800 flex items-center justify-center">
        <span className="text-surface-700 text-2xl">⌛</span>
      </div>
    );
  }
  return (
    <motion.div
      key={card.id}
      initial={{ opacity: 0, scale: 0.8, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 220, damping: 22 }}
      className="relative w-32 h-32 sm:w-36 sm:h-36 rounded-xl overflow-hidden ring-2 ring-amber-500/70"
      style={{ boxShadow: "0 0 22px rgba(245,158,11,0.45)" }}
    >
      {card.imageUrl ? (
        <Image
          src={card.imageUrl}
          alt={card.name}
          fill
          sizes="(max-width: 768px) 30vw, 150px"
          className="object-cover"
          unoptimized
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-amber-900/70 via-surface-900 to-brand-900/70" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 px-1.5 pb-1 pt-2">
        <p className="font-display font-bold text-white text-xs leading-tight drop-shadow-lg line-clamp-2 text-center">
          {card.name}
        </p>
      </div>
    </motion.div>
  );
}

// ── Sous-composant : UI de décision (toujours visible, grisée si pas mon tour) ──
function DecisionUI({
  bidInput,
  setBidInput,
  minBid,
  maxBid,
  isBidValid,
  isSubmitting,
  isMyTurn,
  awaitingName,
  onBid,
  onPass,
  onQuick,
  onAllIn,
  onClear,
  myPoints,
  t,
}: {
  bidInput: string;
  setBidInput: (v: string) => void;
  minBid: number;
  maxBid: number;
  isBidValid: boolean;
  isSubmitting: boolean;
  isMyTurn: boolean;
  awaitingName: string | null;
  onBid: () => void;
  onPass: () => void;
  onQuick: (delta: number) => void;
  onAllIn: () => void;
  onClear: () => void;
  myPoints: number;
  t: ReturnType<typeof useTranslations>;
}) {
  const disabled = !isMyTurn || isSubmitting;
  const wrapperOpacity = isMyTurn ? "opacity-100" : "opacity-50";

  return (
    <div
      className={`rounded-xl border p-2 transition-opacity ${wrapperOpacity} ${
        isMyTurn
          ? "border-amber-700/50 bg-amber-950/20"
          : "border-surface-800/60 bg-surface-900/40"
      }`}
      aria-disabled={!isMyTurn}
    >
      {/* Bandeau de statut */}
      <div className="flex items-center justify-between text-[10px] font-mono mb-1.5">
        <span className={isMyTurn ? "text-amber-300 font-bold" : "text-surface-500"}>
          {isMyTurn
            ? t("yourTurn")
            : t("waitingForOther", { name: awaitingName ?? "?" })}
        </span>
        <span className="text-surface-500">
          {formatPoints(myPoints)} {t("points")}
        </span>
      </div>

      {/* Input + bouton Surenchérir + clear */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <input
            type="number"
            inputMode="numeric"
            value={bidInput}
            onChange={(e) => setBidInput(e.target.value.replace(/[^0-9]/g, ""))}
            min={minBid}
            max={maxBid}
            placeholder={t("bidPlaceholder", { min: formatPoints(minBid) })}
            disabled={disabled}
            className="w-full bg-surface-900/80 border border-surface-700/60 rounded-lg pl-3 pr-8 py-2 text-amber-300 font-mono font-bold text-base text-center focus:outline-none focus:ring-2 focus:ring-amber-500/60 disabled:cursor-not-allowed disabled:opacity-60"
          />
          {bidInput && !disabled && (
            <button
              type="button"
              onClick={onClear}
              aria-label={t("clear")}
              className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded text-surface-500 hover:text-surface-200"
            >
              ×
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onBid}
          disabled={disabled || !isBidValid}
          className={`px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
            !disabled && isBidValid
              ? "bg-amber-500 hover:bg-amber-400 text-white"
              : "bg-surface-800/60 text-surface-700 cursor-not-allowed"
          }`}
        >
          {t("bidAction")}
        </button>
      </div>

      {/* Boutons rapides : ADDITIONNENT à l'input */}
      <div className="grid grid-cols-4 gap-1 mt-1.5">
        {OUTBID_QUICK_BIDS.map((delta) => (
          <button
            key={delta}
            type="button"
            onClick={() => onQuick(delta)}
            disabled={disabled || maxBid < minBid}
            className="py-1.5 rounded-md bg-surface-800/80 hover:bg-surface-700 text-amber-300 text-xs font-mono font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            +{formatPoints(delta)}
          </button>
        ))}
        <button
          type="button"
          onClick={onAllIn}
          disabled={disabled || maxBid < minBid}
          className="py-1.5 rounded-md bg-red-700/80 hover:bg-red-600 text-white text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {t("allIn")}
        </button>
      </div>

      {/* Pass */}
      <button
        type="button"
        onClick={onPass}
        disabled={disabled}
        className="mt-1.5 w-full py-2 rounded-lg border border-surface-700/60 bg-surface-900/60 hover:bg-surface-800/60 text-surface-300 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
      >
        {t("pass")}
      </button>
    </div>
  );
}
