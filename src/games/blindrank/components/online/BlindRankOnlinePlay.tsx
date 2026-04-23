"use client";

/**
 * Phase "playing" de Blind Rank online.
 *
 * Affiche :
 *   - Bandeau supérieur : carte courante + timer
 *   - Rack vertical (1..N) : chaque rang affiche soit la carte placée (locked),
 *     soit les avatars des votants (cliquable pour voter)
 *   - Chat realtime en bas
 *
 * Logique :
 *   - Vote via RPC `blindrank_cast_vote`
 *   - Quand le timer expire, le 1er joueur online (par join_order) appelle
 *     `blindrank_force_timeout` pour résoudre la manche.
 *   - Tout le reste (résolution, transition de carte, fin de partie) est
 *     géré côté serveur par le trigger PG → atomique, pas de race.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import Avatar from "@/components/ui/Avatar";
import RoomChat from "@/games/online/components/RoomChat";
import { createClient } from "@/lib/supabase/client";
import { vibrate } from "@/lib/utils";
import type {
  OnlineRoom,
  RoomPlayer,
  RoomMessage,
  RoomVote,
} from "@/types/rooms";
import type { BlindRankCard } from "@/types/games";

interface BlindRankOnlineState {
  presetId: string | null;
  rackSize: number;
  tourTimeSeconds: number;
  tieBreak: "low" | "high";
  drawOrder: string[];
  cards: BlindRankCard[];
  currentCardIndex: number;
  slots: (BlindRankCard | null)[];
  currentRoundStartedAt: string;
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

function readState(room: OnlineRoom): BlindRankOnlineState | null {
  const cfg = (room.config ?? {}) as Record<string, unknown>;
  const s = cfg.blindrank as BlindRankOnlineState | undefined;
  if (!s || !Array.isArray(s.slots)) return null;
  return s;
}

function rankIndexFromVote(target: string): number | null {
  if (!target?.startsWith("rank:")) return null;
  const n = Number(target.slice(5));
  return Number.isFinite(n) ? n : null;
}

export default function BlindRankOnlinePlay({
  room,
  players,
  messages,
  votes,
  myName,
  onlineNames,
  playerAvatars,
}: Props) {
  const t = useTranslations("games.blindrank.online.play");
  const tChat = useTranslations("games.blindrank.online.chat");

  const state = readState(room);
  const voteRound = room.vote_round ?? 0;
  const currentVotes = votes.filter((v) => v.vote_round === voteRound);

  // Ma carte courante
  const currentCard = state?.cards[state.currentCardIndex] ?? null;
  const totalCards = state?.cards.length ?? 0;

  // Mon vote actuel
  const myVote = currentVotes.find((v) => v.voter_name === myName);
  const myRankIndex = myVote ? rankIndexFromVote(myVote.target_name) : null;

  // Votes par rang : rankIndex → noms[]
  const votesByRank = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const v of currentVotes) {
      const idx = rankIndexFromVote(v.target_name);
      if (idx == null) continue;
      const list = map.get(idx) ?? [];
      list.push(v.voter_name);
      map.set(idx, list);
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

  // Quand timer = 0 : le 1er joueur online (par join_order) force la résolution.
  const forcedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!state) return;
    if (remainingMs > 0) return;
    if (forcedRef.current === `${room.id}:${voteRound}`) return;

    const sortedPlayers = [...players].sort(
      (a, b) => a.join_order - b.join_order
    );
    const firstOnline = sortedPlayers.find((p) =>
      onlineNames.size === 0 ? true : onlineNames.has(p.display_name)
    );
    if (firstOnline?.display_name !== myName) return;

    forcedRef.current = `${room.id}:${voteRound}`;
    const supabase = createClient();
    supabase
      .rpc("blindrank_force_timeout", {
        p_room_id: room.id,
        p_vote_round: voteRound,
      })
      .then(({ error }) => {
        if (error) console.error("[blindrank_force_timeout]", error);
      });
  }, [remainingMs, voteRound, room.id, state, players, onlineNames, myName]);

  // ── Voter ─────────────────────────────────────────────────
  async function castVote(rankIndex: number) {
    if (!state) return;
    if (state.slots[rankIndex] !== null) return;
    if (myRankIndex === rankIndex) return;
    vibrate(40);
    const supabase = createClient();
    const { error } = await supabase.rpc("blindrank_cast_vote", {
      p_room_id: room.id,
      p_vote_round: voteRound,
      p_rank_index: rankIndex,
    });
    if (error) console.error("[blindrank_cast_vote]", error);
  }

  if (!state) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <p className="text-surface-500 text-sm animate-pulse">{t("preparing")}</p>
      </div>
    );
  }

  const placedCount = state.slots.filter((s) => s !== null).length;
  const remainingCards = totalCards - state.currentCardIndex - 1;

  return (
    <div className="min-h-screen bg-surface-950 bg-grid flex flex-col">
      {/* Bandeau carte + timer */}
      <div className="px-4 pt-safe pt-4 pb-3 space-y-3 shrink-0 max-w-md w-full mx-auto">
        <div className="flex items-center justify-between text-xs text-surface-500">
          <span className="font-mono">
            {t("cardCount", {
              current: state.currentCardIndex + 1,
              total: totalCards,
            })}
          </span>
          <span className="font-mono">
            {t("placed", { placed: placedCount, total: state.rackSize })}
          </span>
        </div>

        {/* Carte courante */}
        <div className="relative rounded-3xl overflow-hidden border border-cyan-700/30 bg-gradient-to-br from-cyan-950/70 via-surface-900 to-brand-950/60 p-4">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(circle at 50% 0%, rgba(6,182,212,0.15) 0%, transparent 65%)",
            }}
          />
          <div className="relative z-10 flex items-center gap-4">
            {currentCard?.imageUrl ? (
              <div className="relative w-20 h-20 rounded-2xl overflow-hidden border border-cyan-700/40 shrink-0">
                <Image
                  src={currentCard.imageUrl}
                  alt={currentCard.name}
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-cyan-900/40 border border-cyan-700/40 flex items-center justify-center shrink-0">
                <span className="text-3xl">🎴</span>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-cyan-300/70 text-[10px] uppercase tracking-widest mb-1">
                {t("currentCard")}
              </p>
              <p className="text-white font-display font-black text-xl leading-tight truncate">
                {currentCard?.name ?? "—"}
              </p>
              <p className="text-surface-500 text-xs mt-0.5">
                {remainingCards > 0
                  ? t("remainingAfter", { count: remainingCards })
                  : t("lastCard")}
              </p>
            </div>
          </div>

          {/* Timer */}
          <div className="mt-4 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-surface-500">{t("timeLeft")}</span>
              <span
                className={`font-mono font-bold ${
                  remainingSec <= 5 ? "text-red-400" : "text-cyan-300"
                }`}
              >
                {remainingSec}s
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-800/60 overflow-hidden">
              <motion.div
                className={`h-full ${
                  remainingSec <= 5 ? "bg-red-500" : "bg-cyan-500"
                }`}
                animate={{ width: `${progress * 100}%` }}
                transition={{ duration: 0.2, ease: "linear" }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Rack vertical */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-3">
        <div className="max-w-md w-full mx-auto space-y-1.5">
          {state.slots.map((slot, idx) => {
            const rank = idx + 1;
            const isLocked = slot !== null;
            const voters = votesByRank.get(idx) ?? [];
            const isMine = myRankIndex === idx;

            return (
              <button
                key={idx}
                type="button"
                onClick={() => castVote(idx)}
                disabled={isLocked}
                className={`w-full flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-all ${
                  isLocked
                    ? "border-surface-700/30 bg-surface-900/40 cursor-default"
                    : isMine
                    ? "border-cyan-500/60 bg-cyan-950/30 ring-1 ring-cyan-500/40"
                    : "border-surface-700/40 bg-surface-900/50 hover:border-cyan-700/40 hover:bg-cyan-950/15 active:scale-[0.99]"
                }`}
              >
                {/* Rang */}
                <span
                  className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center font-display font-black text-sm ${
                    isLocked
                      ? "bg-surface-800/60 text-surface-600"
                      : "bg-cyan-900/40 text-cyan-300 border border-cyan-700/30"
                  }`}
                >
                  #{rank}
                </span>

                {/* Contenu */}
                <div className="flex-1 min-w-0">
                  {isLocked && slot ? (
                    <div className="flex items-center gap-2">
                      {slot.imageUrl && (
                        <div className="relative w-7 h-7 rounded-lg overflow-hidden border border-surface-700/40 shrink-0">
                          <Image
                            src={slot.imageUrl}
                            alt={slot.name}
                            fill
                            sizes="28px"
                            className="object-cover"
                          />
                        </div>
                      )}
                      <p className="text-white text-sm font-bold truncate">
                        {slot.name}
                      </p>
                    </div>
                  ) : (
                    <p className="text-surface-500 text-xs">
                      {voters.length === 0
                        ? t("emptySlot")
                        : t("votesCount", { count: voters.length })}
                    </p>
                  )}
                </div>

                {/* Avatars votants (si non lock) */}
                {!isLocked && voters.length > 0 && (
                  <div className="flex -space-x-2 shrink-0">
                    <AnimatePresence>
                      {voters.slice(0, 4).map((name) => (
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
                    {voters.length > 4 && (
                      <div className="w-6 h-6 rounded-full bg-surface-800 border-2 border-surface-950 flex items-center justify-center text-[9px] font-bold text-surface-400">
                        +{voters.length - 4}
                      </div>
                    )}
                  </div>
                )}
              </button>
            );
          })}
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
