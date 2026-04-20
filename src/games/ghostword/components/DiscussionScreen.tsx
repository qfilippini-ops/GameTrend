"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { vibrate } from "@/lib/utils";
import type { GhostWordGameState } from "@/types/games";

interface DiscussionScreenProps {
  state: GhostWordGameState;
  onNext: () => void;
}

export default function DiscussionScreen({ state, onNext }: DiscussionScreenProps) {
  const t = useTranslations("games.ghostword.discussion");
  const { discussionTurn, discussionTurnsPerRound } = state;
  const isVoteNext = discussionTurn === discussionTurnsPerRound;
  const alive = state.players.filter((p) => !p.isEliminated);

  function handleNext() {
    vibrate(isVoteNext ? [50, 30, 100] : 50);
    onNext();
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-surface-950 flex flex-col px-5 pt-safe relative overflow-hidden"
    >
      {/* Ambient */}
      <div
        className="absolute top-0 right-0 w-72 h-72 rounded-full blur-3xl pointer-events-none transition-all duration-700"
        style={{ background: isVoteNext ? "rgba(239, 68, 68, 0.07)" : "rgba(68, 96, 255, 0.05)" }}
      />
      <div className="absolute bottom-1/3 left-0 w-48 h-48 rounded-full blur-3xl pointer-events-none"
        style={{ background: "rgba(68, 96, 255, 0.04)" }} />

      {/* Header */}
      <div className="relative z-10 pt-6 pb-4 text-center">
        <p className="text-surface-700 text-[10px] uppercase tracking-[0.25em] font-mono mb-1.5">
          {t("header", { round: state.voteRound + 1, turn: discussionTurn, total: discussionTurnsPerRound })}
        </p>
        <h1 className={`text-2xl font-display font-black ${isVoteNext ? "text-red-300" : "text-white"}`}>
          {isVoteNext ? t("lastTurnTitle") : t("discussionTitle")}
        </h1>
      </div>

      {/* Barre de progression */}
      <div className="relative z-10 flex gap-1.5 mb-6">
        {Array.from({ length: discussionTurnsPerRound }).map((_, i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full transition-all duration-400"
            style={{
              background:
                i < discussionTurn
                  ? isVoteNext && i === discussionTurnsPerRound - 1
                    ? "linear-gradient(90deg, #ef4444, #f97316)"
                    : "linear-gradient(90deg, #4460ff, #d946ef)"
                  : "rgba(46, 51, 96, 0.35)",
              boxShadow: i < discussionTurn ? "0 0 8px rgba(68, 96, 255, 0.35)" : "none",
            }}
          />
        ))}
      </div>

      {/* Centre */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-6">
        <motion.div
          key={`turn-${discussionTurn}`}
          initial={{ scale: 0.88, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 280, damping: 22 }}
          className={`w-full rounded-3xl border p-7 text-center ${
            isVoteNext
              ? "border-red-800/30 bg-red-950/20"
              : "border-surface-700/40 bg-surface-900/50"
          }`}
        >
          <div className="text-5xl mb-4">
            {isVoteNext ? "⚡" : "💬"}
          </div>
          <p className={`font-display font-bold text-lg mb-2 ${isVoteNext ? "text-red-200" : "text-white"}`}>
            {isVoteNext ? t("lastTurnHeading") : t("discussionHeading")}
          </p>
          <p className="text-surface-500 text-sm leading-relaxed max-w-xs mx-auto">
            {isVoteNext ? t("lastTurnSubtitle") : t("discussionSubtitle")}
          </p>
        </motion.div>

        {/* Joueurs en vie */}
        <div className="w-full">
          <p className="text-surface-700 text-[10px] uppercase tracking-widest text-center mb-2">
            {t("playersInGame")}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {alive.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 bg-surface-900/60 border border-surface-700/30 rounded-xl px-3 py-1.5"
              >
                <div className="w-5 h-5 rounded-lg bg-brand-700/40 flex items-center justify-center text-[10px] font-bold text-brand-300 shrink-0">
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-white text-sm font-medium">{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="relative z-10 py-8">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleNext}
          className={`w-full py-5 rounded-2xl font-display font-bold text-lg transition-all ${
            isVoteNext
              ? "bg-red-700 hover:bg-red-600 text-white"
              : "bg-gradient-brand text-white glow-brand hover:opacity-92"
          }`}
          style={isVoteNext ? { boxShadow: "0 0 24px rgba(239,68,68,0.3)" } : undefined}
        >
          {isVoteNext ? t("goToVote") : t("nextTurn")}
        </motion.button>
      </div>
    </motion.div>
  );
}
