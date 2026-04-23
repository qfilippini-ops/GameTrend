"use client";

/**
 * Phase "playing" de Outbid online (1v1 enchères).
 *
 * Layout :
 *   - Scène (2/3 hauteur), grille 10% / 80% / 10% :
 *       • Colonne gauche (10%)  : joueur A — avatar, nom, points, cartes carrées
 *       • Colonne centre (80%)  : carte courante centrée verticalement, panel d'enchère en bas
 *       • Colonne droite (10%)  : joueur B, mêmes éléments
 *   - Chat (1/3 hauteur)
 *
 * Auto-fill :
 *   - Côté serveur, `_outbid_advance_card` se contente de marquer
 *     `autoFill: true`, `autoFillReceiver`, `autoFillStartedAt`.
 *   - Le client anime les cartes restantes vers le receiver (1 carte / seconde).
 *   - Une fois l'animation terminée, le client appelle
 *     `outbid_finalize_autofill` pour distribuer effectivement les cartes
 *     et passer en phase 'result'.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

// Durée d'apparition d'une carte d'auto-fill côté client (ms)
const AUTOFILL_REVEAL_MS = 900;

// Thème par joueur (position A ou B). Classes statiques pour Tailwind.
const PLAYER_THEMES = {
  A: {
    bg: "bg-amber-950/20",
    bgActive: "bg-amber-900/40",
    borderActive: "border-amber-500/80",
    ring: "ring-amber-700/40",
    ringActive: "ring-amber-300",
    text: "text-amber-300",
    textBright: "text-amber-200",
    badgeBg: "bg-amber-500",
    badgeText: "text-amber-950",
    glow: "0 0 28px rgba(245,158,11,0.45)",
    glowSoft: "0 0 12px rgba(245,158,11,0.18)",
    glowInset: "inset 0 0 32px rgba(245,158,11,0.22)",
  },
  B: {
    bg: "bg-sky-950/20",
    bgActive: "bg-sky-900/40",
    borderActive: "border-sky-500/80",
    ring: "ring-sky-700/40",
    ringActive: "ring-sky-300",
    text: "text-sky-300",
    textBright: "text-sky-200",
    badgeBg: "bg-sky-500",
    badgeText: "text-sky-950",
    glow: "0 0 28px rgba(56,189,248,0.45)",
    glowSoft: "0 0 12px rgba(56,189,248,0.18)",
    glowInset: "inset 0 0 32px rgba(56,189,248,0.22)",
  },
} as const;
type PlayerSlot = "A" | "B";

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
  autoFillReceiver?: string | null;
  autoFillStartedAt?: string | null;
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

  // ── Tick global (200ms) pour timer & auto-fill ────────────────────
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

  // Affichage : moi à gauche / adverse à droite.
  // Le SLOT (A ou B) reste intrinsèque au joueur (pour fixer la couleur).
  const leftPlayer: OutbidPlayer | null = isSpectator
    ? state?.playerA ?? null
    : myPlayer;
  const rightPlayer: OutbidPlayer | null = isSpectator
    ? state?.playerB ?? null
    : otherPlayer;
  const leftSlot: PlayerSlot | null = state && leftPlayer
    ? leftPlayer.name === state.playerA.name
      ? "A"
      : "B"
    : null;
  const rightSlot: PlayerSlot | null = state && rightPlayer
    ? rightPlayer.name === state.playerA.name
      ? "A"
      : "B"
    : null;

  // ── Auto-fill : calcul des cartes "révélées" côté client ──────────
  const isAutoFill = !!state?.autoFill;
  const autoFillReceiver = state?.autoFillReceiver ?? null;
  const autoFillStartedMs = parseTimestamp(state?.autoFillStartedAt);
  const remainingCards = state
    ? state.cardOrder.slice(state.currentCardIndex)
    : [];
  const autoFillRevealCount = isAutoFill && autoFillStartedMs > 0
    ? Math.min(
        remainingCards.length,
        Math.floor((now - autoFillStartedMs) / AUTOFILL_REVEAL_MS)
      )
    : 0;

  // ── Carte courante (pendant auto-fill : carte en cours d'attribution) ──
  let currentCardId: string | null = null;
  if (state) {
    if (isAutoFill) {
      currentCardId = remainingCards[autoFillRevealCount] ?? null;
    } else {
      currentCardId = state.cardOrder[state.currentCardIndex] ?? null;
    }
  }
  const currentCard = currentCardId ? cardById.get(currentCardId) ?? null : null;

  // ── Joueurs "affichés" : team réelle + cartes auto-fill déjà révélées ──
  const augmentedPlayer = (p: OutbidPlayer | null): OutbidPlayer | null => {
    if (!p || !isAutoFill || autoFillReceiver !== p.name) return p;
    const extra = remainingCards
      .slice(0, autoFillRevealCount)
      .map((cardId) => ({ cardId, price: 0 }));
    return { ...p, team: [...p.team, ...extra] };
  };
  const displayedLeft = augmentedPlayer(leftPlayer);
  const displayedRight = augmentedPlayer(rightPlayer);

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
    !!state && !!myPlayer && state.awaitingResponse === myName && !isAutoFill;
  const currentBid = state?.currentBid ?? null;

  // Vibration à 5s restantes (1 seule fois par décision)
  const vibratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!state || isAutoFill) return;
    const key = `${state.currentCardIndex}-${voteRound}`;
    if (isUrgent && isMyTurn && vibratedRef.current !== key) {
      vibratedRef.current = key;
      vibrate(60);
    }
    if (!isUrgent && vibratedRef.current === key && remainingSec > 5) {
      vibratedRef.current = null;
    }
  }, [isUrgent, isMyTurn, state, voteRound, remainingSec, isAutoFill]);

  // ── Saisie de mise ────────────────────────────────────────────────
  const [bidInput, setBidInput] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    if (amount < minBid || amount > maxBid) return;
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
    if (!myPlayer) return;
    setBidInput((prev) => {
      const current = Number(prev);
      const base = Number.isFinite(current) && current > 0 ? current : 0;
      return String(Math.min(maxBid, base + delta));
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
    isAutoFill: boolean;
  }>({
    roomId: room.id,
    voteRound,
    decisionStartedMs: 0,
    tourMs: 60000,
    finished: false,
    isAutoFill: false,
  });

  useEffect(() => {
    stateRef.current = {
      roomId: room.id,
      voteRound,
      decisionStartedMs,
      tourMs,
      finished: !!state?.finished,
      isAutoFill,
    };
  });

  const lastTimeoutAttemptRef = useRef<{ key: string; ts: number } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const tick = async () => {
      const s = stateRef.current;
      if (s.finished || s.isAutoFill) return;
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

  // ── Auto-finalize de l'auto-fill : trigger une fois animation terminée ──
  const finalizeRef = useRef<{ key: string; ts: number } | null>(null);
  useEffect(() => {
    if (!isAutoFill) return;
    if (autoFillRevealCount < remainingCards.length) return;
    // Petite pause finale (300ms) après la dernière carte révélée
    const key = `${room.id}:${voteRound}`;
    const last = finalizeRef.current;
    if (last && last.key === key && Date.now() - last.ts < 1500) return;
    finalizeRef.current = { key, ts: Date.now() };
    const tm = setTimeout(async () => {
      const supabase = createClient();
      const { error } = await supabase.rpc("outbid_finalize_autofill", {
        p_room_id: room.id,
        p_vote_round: voteRound,
      });
      if (error) {
        console.error("[outbid_finalize_autofill]", error);
      }
    }, 400);
    return () => clearTimeout(tm);
  }, [isAutoFill, autoFillRevealCount, remainingCards.length, room.id, voteRound]);

  // ── Bouton manuel de secours après 5s de blocage (hors auto-fill) ─
  const [showManualUnlock, setShowManualUnlock] = useState(false);
  useEffect(() => {
    setShowManualUnlock(false);
    if (!state || state.finished || isAutoFill) return;
    if (remainingSec > 0) return;
    const tm = setTimeout(() => setShowManualUnlock(true), 5000);
    return () => clearTimeout(tm);
  }, [state, remainingSec, voteRound, isAutoFill]);

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
  const cardNumber = Math.min(
    isAutoFill
      ? state.currentCardIndex + autoFillRevealCount + 1
      : state.currentCardIndex + 1,
    totalCards
  );
  const teamSize = state.teamSize;

  // Slot du bidder courant (pour colorer la mise centrale)
  const bidderSlot: PlayerSlot | null = currentBid
    ? currentBid.bidder === state.playerA.name
      ? "A"
      : currentBid.bidder === state.playerB.name
        ? "B"
        : null
    : null;
  const autoFillReceiverSlot: PlayerSlot | null = autoFillReceiver
    ? autoFillReceiver === state.playerA.name
      ? "A"
      : autoFillReceiver === state.playerB.name
        ? "B"
        : null
    : null;

  return (
    <div className="h-screen bg-surface-950 bg-grid flex flex-col overflow-hidden">
      {/* ───── Scène : 2/3 ───── */}
      <div className="flex-[2] min-h-0 grid grid-cols-[10%_80%_10%]">
        {/* Colonne gauche : joueur */}
        {displayedLeft && leftSlot && (
          <PlayerColumn
            slot={leftSlot}
            player={displayedLeft}
            cardById={cardById}
            isYou={!isSpectator && displayedLeft.name === myName}
            isHisTurn={!isAutoFill && state.awaitingResponse === displayedLeft.name}
            isAutoFillReceiver={isAutoFill && autoFillReceiver === displayedLeft.name}
            avatar={playerAvatars[displayedLeft.name] ?? null}
            teamSize={teamSize}
            t={t}
          />
        )}

        {/* Colonne centre : carte centrée + bid panel ancré en bas */}
        <div className="min-h-0 flex flex-col px-2 py-2 gap-2">
          {/* Carte + enchère + timer (centrés verticalement) */}
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-2">
            <CurrentCardDisplay card={currentCard} />
            <p className="text-surface-600 text-[10px] font-mono">
              {t("cardCounter", { current: cardNumber, total: totalCards })}
            </p>
            {currentBid && !isAutoFill && bidderSlot && (
              <motion.div
                key={`bid-${currentBid.amount}-${currentBid.bidder}`}
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 320, damping: 20 }}
                className={`px-5 py-2 rounded-xl border-2 ${PLAYER_THEMES[bidderSlot].borderActive} ${PLAYER_THEMES[bidderSlot].bgActive}`}
                style={{ boxShadow: PLAYER_THEMES[bidderSlot].glowSoft }}
              >
                <p
                  className={`text-center font-mono font-black text-3xl leading-none ${PLAYER_THEMES[bidderSlot].textBright}`}
                >
                  {formatPoints(currentBid.amount)}
                </p>
              </motion.div>
            )}
            {isAutoFill && autoFillReceiver && autoFillReceiverSlot && (
              <div
                className={`px-3 py-1.5 rounded-xl border-2 ${PLAYER_THEMES[autoFillReceiverSlot].borderActive} ${PLAYER_THEMES[autoFillReceiverSlot].bgActive}`}
              >
                <p
                  className={`text-center font-mono text-xs font-bold ${PLAYER_THEMES[autoFillReceiverSlot].textBright}`}
                >
                  {t("autoFillBanner", { name: autoFillReceiver })}
                </p>
              </div>
            )}
            {!isAutoFill && (
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
            )}
          </div>

          {/* Bid panel : ancré en bas */}
          {!isSpectator && !isAutoFill && (
            <div className="shrink-0">
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
            </div>
          )}
        </div>

        {/* Colonne droite : joueur */}
        {displayedRight && rightSlot && (
          <PlayerColumn
            slot={rightSlot}
            player={displayedRight}
            cardById={cardById}
            isYou={!isSpectator && displayedRight.name === myName}
            isHisTurn={!isAutoFill && state.awaitingResponse === displayedRight.name}
            isAutoFillReceiver={isAutoFill && autoFillReceiver === displayedRight.name}
            avatar={playerAvatars[displayedRight.name] ?? null}
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

// ── Sous-composant : colonne joueur ──────────────────────────────────────
// Colonne très étroite (10% large). ResizeObserver pour calculer la taille
// exacte des slots carrés afin que tout rentre dans la hauteur dispo.
// Couleur déterminée par `slot` (A = ambre, B = bleu).
function PlayerColumn({
  slot,
  player,
  cardById,
  isYou,
  isHisTurn,
  isAutoFillReceiver,
  avatar,
  teamSize,
  t,
}: {
  slot: PlayerSlot;
  player: OutbidPlayer;
  cardById: Map<string, DYPCard>;
  isYou: boolean;
  isHisTurn: boolean;
  isAutoFillReceiver: boolean;
  avatar: string | null;
  teamSize: number;
  t: ReturnType<typeof useTranslations>;
}) {
  const theme = PLAYER_THEMES[slot];
  const slots = Array.from({ length: teamSize }, (_, i) => player.team[i] ?? null);
  const SLOT_GAP = 6; // px — mini gap visible entre les cartes

  const stackRef = useRef<HTMLDivElement>(null);
  const [slotSize, setSlotSize] = useState(0);

  useLayoutEffect(() => {
    const el = stackRef.current;
    if (!el) return;

    const compute = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const totalGap = SLOT_GAP * Math.max(0, teamSize - 1);
      const maxByHeight = Math.floor((h - totalGap) / teamSize);
      const size = Math.max(8, Math.min(w, maxByHeight));
      setSlotSize(size);
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [teamSize]);

  const highlight = isAutoFillReceiver || isHisTurn;
  const bgClass = highlight ? theme.bgActive : theme.bg;
  const borderActive = highlight ? `border-2 ${theme.borderActive}` : "border border-surface-800/60";
  const ringClass = highlight ? theme.ringActive : theme.ring;
  // Avatar +20% si c'est son tour
  const avatarSize = highlight ? 44 : 36;

  return (
    <motion.div
      animate={{ opacity: highlight ? 1 : 0.85 }}
      transition={{ duration: 0.25 }}
      className={`h-full min-h-0 flex flex-col ${bgClass} ${borderActive} relative`}
      style={highlight ? { boxShadow: theme.glowInset } : undefined}
    >
      {/* Header : avatar + nom + points */}
      <div
        className={`shrink-0 flex flex-col items-center gap-0.5 px-0.5 py-2 ${
          highlight ? `border-b-2 ${theme.borderActive}` : "border-b border-surface-800/60"
        }`}
      >
        <motion.div
          animate={{ width: avatarSize, height: avatarSize }}
          transition={{ type: "spring", stiffness: 280, damping: 22 }}
          className={`relative rounded-full overflow-hidden ring-2 ${ringClass}`}
          style={highlight ? { boxShadow: theme.glow } : undefined}
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
        </motion.div>
        <p
          className={`text-[10px] font-bold truncate max-w-full text-center leading-tight pt-0.5 ${
            highlight ? theme.textBright : "text-white/85"
          }`}
        >
          {isYou ? t("you") : player.name}
        </p>
        <p className={`text-[10px] font-mono font-bold leading-none ${theme.text}`}>
          {formatPoints(player.points)}
        </p>
      </div>

      {/* Stack de cartes carrées, centré verticalement */}
      <div
        ref={stackRef}
        className="flex-1 min-h-0 flex flex-col items-center justify-center px-0.5 py-1"
        style={{ gap: `${SLOT_GAP}px` }}
      >
        {slotSize > 0 && (
          <AnimatePresence>
            {slots.map((entry, i) => {
              const sizeStyle = { width: slotSize, height: slotSize };
              if (!entry) {
                return (
                  <div
                    key={`empty-${i}`}
                    className={`rounded border border-dashed ${
                      highlight ? "border-white/15" : "border-surface-800/50"
                    }`}
                    style={sizeStyle}
                  />
                );
              }
              const card = cardById.get(entry.cardId);
              return (
                <motion.div
                  key={`${entry.cardId}-${i}`}
                  initial={{ scale: 0.5, opacity: 0, y: -16 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 22 }}
                  className={`relative rounded overflow-hidden ring-1 ${theme.ring} bg-surface-900`}
                  style={sizeStyle}
                  title={card ? `${card.name} — ${formatPoints(entry.price)} pts` : ""}
                >
                  {card?.imageUrl ? (
                    <Image
                      src={card.imageUrl}
                      alt={card.name}
                      fill
                      sizes={`${Math.ceil(slotSize)}px`}
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-surface-800 to-surface-900" />
                  )}
                  {slotSize >= 28 && (
                    <div
                      className={`absolute top-0 right-0 px-0.5 rounded-bl bg-black/85 ${theme.text} text-[8px] font-mono font-bold leading-tight`}
                    >
                      {entry.price === 0 ? "★" : formatPoints(entry.price)}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  );
}

// ── Sous-composant : carte courante centrée ──────────────────────────────
function CurrentCardDisplay({ card }: { card: DYPCard | null }) {
  if (!card) {
    return (
      <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-2xl bg-surface-900/60 ring-1 ring-surface-800 flex items-center justify-center">
        <span className="text-surface-700 text-3xl">⌛</span>
      </div>
    );
  }
  return (
    <motion.div
      key={card.id}
      initial={{ opacity: 0, scale: 0.8, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 220, damping: 22 }}
      className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-2xl overflow-hidden ring-2 ring-amber-500/70"
      style={{ boxShadow: "0 0 28px rgba(245,158,11,0.45)" }}
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
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 px-2 pb-1.5 pt-3">
        <p className="font-display font-bold text-white text-sm leading-tight drop-shadow-lg line-clamp-2 text-center">
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
