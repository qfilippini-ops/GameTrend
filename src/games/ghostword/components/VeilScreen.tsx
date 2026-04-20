"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { vibrate } from "@/lib/utils";
import type { GhostWordPlayer } from "@/types/games";

interface VeilScreenProps {
  player: GhostWordPlayer;
  playerNumber: number;
  totalPlayers: number;
  onReveal: () => void;
}

export default function VeilScreen({ player, playerNumber, totalPlayers, onReveal }: VeilScreenProps) {
  const t = useTranslations("games.ghostword.veil");
  function handleReveal() {
    vibrate(50);
    onReveal();
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative min-h-screen bg-surface-950 scanlines flex flex-col items-center justify-between px-6 select-none overflow-hidden"
    >
      {/* Ambient glows */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 bg-brand-600/6 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/4 w-48 h-48 bg-ghost-600/5 rounded-full blur-3xl pointer-events-none" />

      {/* Progress — top */}
      <div className="relative z-10 w-full pt-safe pt-5">
        <div className="flex gap-1.5 mb-2">
          {Array.from({ length: totalPlayers }).map((_, i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full transition-all duration-500"
              style={{
                background:
                  i < playerNumber - 1
                    ? "linear-gradient(90deg, #4460ff, #d946ef)"
                    : i === playerNumber - 1
                    ? "rgba(68, 96, 255, 0.5)"
                    : "rgba(46, 51, 96, 0.35)",
                boxShadow: i < playerNumber - 1 ? "0 0 8px rgba(68, 96, 255, 0.4)" : "none",
              }}
            />
          ))}
        </div>
        <p className="text-center text-surface-700 text-xs font-mono tracking-widest">
          {playerNumber} / {totalPlayers}
        </p>
      </div>

      {/* Main */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-center gap-0">
        <motion.div
          initial={{ scale: 0.75, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 260, damping: 20 }}
          className="flex flex-col items-center"
        >
          <div className="text-7xl mb-8 animate-float">🫣</div>

          <p className="text-surface-600 text-xs uppercase tracking-[0.2em] font-medium mb-4">
            {t("passPhoneTo")}
          </p>

          <h1 className="text-5xl font-display font-black text-white mb-3 leading-none tracking-tight">
            {player.name}
          </h1>

          {/* Neon underline */}
          <div
            className="mx-auto mb-10 h-px w-28 rounded-full"
            style={{
              background: "linear-gradient(90deg, transparent, #4460ff, #d946ef, transparent)",
              boxShadow: "0 0 16px rgba(68, 96, 255, 0.5)",
            }}
          />

          <p className="text-surface-500 text-sm max-w-xs mx-auto leading-relaxed">
            {t("ensurePrivacy")}
          </p>
          <p className="text-surface-600 text-xs mt-1">
            {t("tapWhenReady")}
          </p>
        </motion.div>
      </div>

      {/* CTA */}
      <div className="relative z-10 w-full pb-safe pb-10">
        <motion.button
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, type: "spring", stiffness: 300, damping: 22 }}
          whileTap={{ scale: 0.96 }}
          onClick={handleReveal}
          className="w-full bg-gradient-brand text-white font-display font-bold text-xl py-5 rounded-2xl glow-brand hover:opacity-92 transition-opacity"
        >
          {t("revealMyWord")}
        </motion.button>
      </div>
    </motion.div>
  );
}
