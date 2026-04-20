"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { vibrate } from "@/lib/utils";
import { eliminatePlayer } from "@/games/ghostword/engine";
import type { GhostWordGameState, GhostWordPlayer } from "@/types/games";

interface VoteScreenProps {
  state: GhostWordGameState;
  onEliminate: (playerId: string) => void;
}

export default function VoteScreen({ state, onEliminate }: VoteScreenProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [votePhase, setVotePhase] = useState<"voting" | "result">("voting");
  const [eliminatedId, setEliminatedId] = useState<string | null>(null);
  const [willEnd, setWillEnd] = useState(false);

  const alive = state.players.filter((p) => !p.isEliminated);

  function castVote(targetId: string) {
    vibrate(40);
    setSelected(targetId);
  }

  function confirmVote() {
    if (!selected) return;
    vibrate([50, 30, 80]);
    setEliminatedId(selected);
    // Simulation de l'élimination pour savoir si la partie va se terminer
    // (et donc masquer le message "La partie continue…").
    const simulated = eliminatePlayer(state, selected);
    setWillEnd(Boolean(simulated.winner));
    setVotePhase("result");
    setTimeout(() => onEliminate(selected), 2600);
  }

  const eliminatedPlayer = eliminatedId ? alive.find((p) => p.id === eliminatedId) : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen bg-surface-950 flex flex-col px-5 pt-safe relative overflow-hidden"
    >
      {/* Red ambient */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-red-900/8 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="relative z-10 pt-6 pb-4 text-center">
        <p className="text-surface-700 text-[10px] uppercase tracking-[0.25em] font-mono mb-1.5">
          Vote · Round {state.voteRound + 1}
        </p>
        <h1 className="text-2xl font-display font-black text-white">
          {votePhase === "voting" ? "🗳 Qui éliminez-vous ?" : "Résultat du vote"}
        </h1>
      </div>

      <AnimatePresence mode="wait">
        {votePhase === "voting" ? (
          <motion.div
            key="voting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="relative z-10 flex-1 flex flex-col"
          >
            <p className="text-surface-600 text-sm text-center mb-5">
              Qui cache un mot différent — ou pire, aucun mot ?
            </p>

            <div className="flex flex-col gap-2.5 flex-1">
              {alive.map((player) => (
                <PlayerVoteCard
                  key={player.id}
                  player={player}
                  isSelected={selected === player.id}
                  onSelect={() => castVote(player.id)}
                />
              ))}
            </div>

            <div className="py-6">
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={confirmVote}
                disabled={!selected}
                className={`w-full py-5 rounded-2xl font-display font-bold text-lg transition-all ${
                  selected
                    ? "bg-red-700 hover:bg-red-600 text-white"
                    : "bg-surface-800/60 text-surface-700 cursor-not-allowed border border-surface-700/30"
                }`}
                style={selected ? { boxShadow: "0 0 24px rgba(239,68,68,0.3)" } : undefined}
              >
                Confirmer l'élimination ⚡
              </motion.button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="result"
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            className="relative z-10 flex-1 flex flex-col items-center justify-center gap-6 text-center"
          >
            {/* Glow rouge */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-red-900/15 rounded-full blur-3xl pointer-events-none" />

            <motion.div
              animate={{ rotate: [0, -12, 12, -6, 6, 0] }}
              transition={{ delay: 0.15, duration: 0.7 }}
              className="text-7xl relative z-10"
            >
              💀
            </motion.div>

            <div className="relative z-10">
              <p className="text-red-500/60 text-xs uppercase tracking-widest mb-2 font-mono">éliminé</p>
              <h2
                className="text-4xl font-display font-black text-white"
                style={{ textShadow: "0 0 40px rgba(239, 68, 68, 0.5)" }}
              >
                {eliminatedPlayer?.name ?? "???"}
              </h2>
            </div>

            {!willEnd && (
              <p className="text-surface-700 text-xs font-mono relative z-10">La partie continue…</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function PlayerVoteCard({ player, isSelected, onSelect }: {
  player: GhostWordPlayer;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onSelect}
      className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left relative overflow-hidden ${
        isSelected
          ? "border-red-500/50 bg-red-950/25"
          : "border-surface-700/40 bg-surface-900/50 hover:border-surface-600/50 hover:bg-surface-900/80"
      }`}
      style={isSelected ? { boxShadow: "0 0 20px rgba(239, 68, 68, 0.2)" } : undefined}
    >
      {/* Left accent bar */}
      {isSelected && (
        <motion.div
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          className="absolute left-0 top-0 bottom-0 w-1 bg-red-500 rounded-l-2xl"
        />
      )}

      <div
        className={`w-11 h-11 rounded-xl flex items-center justify-center font-display font-bold text-base shrink-0 transition-all ${
          isSelected ? "bg-red-600/80 text-white" : "bg-surface-800 text-surface-400"
        }`}
      >
        {player.name.charAt(0).toUpperCase()}
      </div>

      <span className="font-semibold text-white text-base flex-1">{player.name}</span>

      <AnimatePresence>
        {isSelected && (
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0 }}
            className="w-7 h-7 rounded-full bg-red-600/30 border border-red-500/40 flex items-center justify-center shrink-0"
          >
            <span className="text-red-400 text-sm font-bold">✗</span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
