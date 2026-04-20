"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { vibrate } from "@/lib/utils";
import type { GhostWordPlayer } from "@/types/games";

interface RevealScreenProps {
  player: GhostWordPlayer;
  onDone: () => void;
}

export default function RevealScreen({ player, onDone }: RevealScreenProps) {
  const t = useTranslations("games.ghostword.reveal");
  const [flipped, setFlipped] = useState(false);

  function handleFlip() {
    vibrate([30, 20, 60]);
    setFlipped(true);
  }

  function handleDone() {
    vibrate(80);
    onDone();
  }

  const hasWord = !!player.word;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-surface-950 flex flex-col items-center justify-center px-5 select-none relative overflow-hidden"
    >
      {/* Ambient */}
      <div
        className="absolute top-1/3 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full blur-3xl pointer-events-none transition-all duration-1000"
        style={{
          background: flipped
            ? hasWord ? "rgba(68, 96, 255, 0.12)" : "rgba(217, 70, 239, 0.08)"
            : "rgba(46, 51, 96, 0.06)",
        }}
      />

      <div className="w-full max-w-sm relative z-10">

        {/* Carte retournable */}
        <div
          className="relative w-full cursor-pointer mb-5"
          style={{ perspective: "1200px" }}
          onClick={!flipped ? handleFlip : undefined}
        >
          <motion.div
            className="relative w-full"
            style={{ transformStyle: "preserve-3d" }}
            animate={{ rotateY: flipped ? 180 : 0 }}
            transition={{ duration: 0.65, type: "spring", stiffness: 220, damping: 28 }}
          >
            {/* Dos de carte */}
            <div
              className="backface-hidden w-full rounded-3xl border border-surface-700/40 bg-surface-900/80 flex flex-col items-center justify-center p-10 gap-5"
              style={{ minHeight: "340px", backfaceVisibility: "hidden" }}
            >
              {/* Motif décoratif */}
              <div className="relative">
                <div
                  className="text-8xl font-black text-surface-800 leading-none select-none"
                  style={{ fontFamily: "monospace", textShadow: "0 0 40px rgba(68,96,255,0.1)" }}
                >
                  ?
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-20 h-20 rounded-full border border-surface-700/30"
                    style={{ background: "radial-gradient(circle, rgba(68,96,255,0.06) 0%, transparent 70%)" }} />
                </div>
              </div>
              <p className="text-surface-600 text-sm font-medium text-center">
                {t("tapToReveal")}
              </p>
            </div>

            {/* Face : mot */}
            <div
              className="absolute inset-0 backface-hidden w-full rounded-3xl border-2 flex flex-col items-center justify-center p-8 overflow-hidden"
              style={{
                backfaceVisibility: "hidden",
                transform: "rotateY(180deg)",
                minHeight: "340px",
                background: hasWord
                  ? "linear-gradient(145deg, #0c1145 0%, #181c3a 100%)"
                  : "linear-gradient(145deg, #1a0830 0%, #0e0318 100%)",
                borderColor: hasWord ? "rgba(68, 96, 255, 0.5)" : "rgba(217, 70, 239, 0.35)",
                boxShadow: hasWord
                  ? "0 0 40px rgba(68, 96, 255, 0.2), inset 0 0 40px rgba(68, 96, 255, 0.04)"
                  : "0 0 40px rgba(217, 70, 239, 0.15), inset 0 0 40px rgba(217, 70, 239, 0.04)",
              }}
            >
              {hasWord ? (
                <div className="text-center w-full">
                  <p className="text-brand-400/40 text-[10px] uppercase tracking-[0.3em] mb-6">
                    {t("yourSecretWord")}
                  </p>
                  {player.wordImageUrl && (
                    <div
                      className="relative w-36 h-36 mx-auto mb-5 rounded-2xl overflow-hidden border border-brand-500/25"
                      style={{ boxShadow: "0 0 24px rgba(68, 96, 255, 0.3)" }}
                    >
                      <Image src={player.wordImageUrl} alt={player.word!} fill className="object-cover" unoptimized />
                    </div>
                  )}
                  <p
                    className={`font-display font-black text-white tracking-tight leading-none ${
                      player.wordImageUrl ? "text-3xl" : "text-5xl"
                    }`}
                    style={{ textShadow: "0 0 40px rgba(107, 137, 255, 0.7)" }}
                  >
                    {player.word}
                  </p>
                  <p className="text-brand-400/20 text-xs mt-8 tracking-wide">
                    {t("memorize")}
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <div className="text-6xl mb-5 animate-float">💨</div>
                  <p className="text-ghost-400/40 text-[10px] uppercase tracking-[0.3em] mb-3">
                    {t("youAreVoid")}
                  </p>
                  <p
                    className="text-4xl font-display font-black text-white"
                    style={{ textShadow: "0 0 40px rgba(217, 70, 239, 0.6)" }}
                  >
                    {t("noWordTitle")}
                  </p>
                  <p className="text-ghost-400/20 text-xs mt-8 tracking-wide">
                    {t("voidTip")}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </div>

        {/* Bouton suivant */}
        <AnimatePresence>
          {flipped && (
            <motion.button
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, type: "spring", stiffness: 300, damping: 24 }}
              whileTap={{ scale: 0.96 }}
              onClick={handleDone}
              className="w-full bg-surface-800/80 hover:bg-surface-700/80 text-white font-display font-bold text-base py-4 rounded-2xl transition-colors border border-surface-700/40"
            >
              {t("memorized")}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
