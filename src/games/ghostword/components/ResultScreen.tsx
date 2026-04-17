"use client";

import { motion } from "framer-motion";
import type { GhostWordGameState, GhostWordConfig } from "@/types/games";
import ShareResultButton from "@/components/social/ShareResultButton";

interface ResultScreenProps {
  state: GhostWordGameState;
  config: GhostWordConfig;
  onPlayAgain: () => void;
  onGoHome: () => void;
  presetId?: string | null;
  presetName?: string | null;
}

const ROLE_STYLES: Record<string, { border: string; bg: string; dot: string; label: string; emoji: string }> = {
  initie: { border: "border-brand-700/30",   bg: "bg-brand-950/30",   dot: "bg-brand-500",   label: "Initié",  emoji: "🧠" },
  ombre:  { border: "border-ghost-700/30",   bg: "bg-ghost-950/30",   dot: "bg-ghost-500",   label: "Ombre",   emoji: "👻" },
  vide:   { border: "border-surface-700/30", bg: "bg-surface-900/30", dot: "bg-surface-500", label: "Le Vide", emoji: "💨" },
};

export default function ResultScreen({ state, config, onPlayAgain, onGoHome, presetId, presetName }: ResultScreenProps) {
  const winner = state.winner!;
  const winnerName = config.roles[winner].name;
  const winningPlayers = state.players.filter((p) => p.role === winner);

  const isInitie = winner === "initie";
  const isOmbre = winner === "ombre";

  const winnerEmoji = isInitie ? "🧠" : isOmbre ? "👻" : "💨";

  const glowColor = isInitie
    ? "rgba(68, 96, 255, 0.55)"
    : isOmbre
    ? "rgba(217, 70, 239, 0.55)"
    : "rgba(107, 114, 128, 0.4)";

  const ambientColor = isInitie
    ? "rgba(68, 96, 255, 0.09)"
    : isOmbre
    ? "rgba(217, 70, 239, 0.08)"
    : "rgba(107, 114, 128, 0.05)";

  const winnerGradient = isInitie
    ? "from-brand-950 via-surface-950 to-surface-950"
    : isOmbre
    ? "from-ghost-950 via-surface-950 to-surface-950"
    : "from-surface-900 via-surface-950 to-surface-950";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`min-h-screen bg-gradient-to-b ${winnerGradient} flex flex-col px-5 pt-safe relative overflow-hidden`}
    >
      {/* Ambient */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full blur-3xl pointer-events-none"
        style={{ background: ambientColor }}
      />

      {/* Hero */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center pt-10 pb-6">

        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 280, damping: 18, delay: 0.1 }}
          className="text-8xl mb-5"
        >
          {winnerEmoji}
        </motion.div>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.35 }}
          className="mb-5"
        >
          <p className="text-surface-600 text-[10px] uppercase tracking-[0.25em] mb-2">
            Victoire de
          </p>
          <h1
            className="text-5xl font-display font-black text-white mb-1 leading-none"
            style={{ textShadow: `0 0 50px ${glowColor}` }}
          >
            {winnerName}
          </h1>
          {winner === "ombre" && winnerName !== "Ombre" && (
            <p className="text-surface-700 text-xs mt-1.5">le rôle caché</p>
          )}
          {winner === "vide" && winnerName !== "Le Vide" && (
            <p className="text-surface-700 text-xs mt-1.5">sans mot</p>
          )}
        </motion.div>

        {/* Joueurs gagnants */}
        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="flex flex-wrap justify-center gap-2 mb-8"
        >
          {winningPlayers.map((p) => (
            <span
              key={p.id}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-semibold text-sm text-white border"
              style={{
                background: ambientColor.replace("0.09", "0.35"),
                borderColor: glowColor.replace("0.55", "0.3"),
              }}
            >
              🏆 {p.name}
            </span>
          ))}
        </motion.div>

        {/* Révélation des rôles */}
        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.65 }}
          className="w-full max-w-sm"
        >
          <p className="text-surface-700 text-[10px] uppercase tracking-[0.2em] mb-3 font-mono">
            Révélation des rôles & mots
          </p>
          <div className="space-y-2">
            {state.players.map((p, i) => {
              const style = ROLE_STYLES[p.role] ?? ROLE_STYLES.initie;
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.7 + i * 0.06 }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${style.border} ${style.bg} relative overflow-hidden ${
                    p.isEliminated ? "opacity-40" : ""
                  }`}
                >
                  {/* Left accent dot */}
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />

                  <span className="text-base shrink-0">{style.emoji}</span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-white font-semibold text-sm">{p.name}</span>
                      {p.isEliminated && (
                        <span className="text-[10px] text-surface-700 border border-surface-800 rounded px-1">éliminé</span>
                      )}
                    </div>
                    <p className="text-surface-600 text-xs">{config.roles[p.role].name}</p>
                  </div>

                  <div className="text-right shrink-0">
                    {p.word ? (
                      <p className="text-sm font-bold text-white">{p.word}</p>
                    ) : (
                      <p className="text-xs text-surface-700 italic">aucun mot</p>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </div>

      {/* Actions */}
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 1.0 }}
        className="relative z-10 pb-safe pb-8 space-y-3"
      >
        <button
          onClick={onPlayAgain}
          className="w-full bg-gradient-brand text-white font-display font-bold py-5 rounded-2xl glow-brand hover:opacity-92 transition-opacity text-lg"
        >
          Rejouer 🔄
        </button>

        <ShareResultButton
          result={{
            gameType: "ghostword",
            presetId: presetId ?? null,
            presetName: presetName ?? null,
            resultData: {
              winner,
              winnerLabel: winnerName,
              winningPlayers: winningPlayers.map((p) => p.name),
              players: state.players.map((p) => ({ name: p.name, role: p.role, eliminated: p.isEliminated })),
            },
          }}
          shareText={`J'ai gagné une partie de GhostWord : ${winnerName} ${winnerEmoji} ! Viens jouer avec moi sur GameTrend.`}
        />

        <button
          onClick={onGoHome}
          className="w-full bg-surface-800/50 hover:bg-surface-700/50 text-surface-200 font-semibold py-4 rounded-2xl transition-colors border border-surface-700/40 text-sm"
        >
          Retour à l'accueil
        </button>
      </motion.div>
    </motion.div>
  );
}
