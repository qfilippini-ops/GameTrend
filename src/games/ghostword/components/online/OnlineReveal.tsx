"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { vibrate } from "@/lib/utils";
import { getMyPrivateData } from "@/app/actions/rooms";
import { createClient } from "@/lib/supabase/client";
import Avatar from "@/components/ui/Avatar";
import type { RoomPlayer } from "@/types/rooms";

interface OnlineRevealProps {
  roomId: string;
  players: RoomPlayer[];
  myName: string;
  playerAvatars?: Record<string, string | null>;
}

export default function OnlineReveal({ roomId, players, myName, playerAvatars }: OnlineRevealProps) {
  const [privateData, setPrivateData] = useState<{
    role: string;
    word: string | null;
    wordImageUrl: string | null;
  } | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);

  const readyCount = players.filter((p) => p.is_ready).length;
  const totalCount = players.length;

  useEffect(() => {
    getMyPrivateData(roomId).then((res) => {
      if ("error" in res) return;
      setPrivateData(res);
      setLoading(false);
    });
  }, [roomId]);

  async function handleFlip() {
    vibrate([30, 20, 60]);
    setFlipped(true);
  }

  async function handleConfirm() {
    vibrate(80);
    setConfirmed(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("room_players")
        .update({ is_ready: true })
        .eq("room_id", roomId)
        .eq("user_id", user.id);
    }
  }

  const hasWord = !!privateData?.word;

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col items-center justify-center px-5 select-none relative overflow-hidden">
      {/* Ambient */}
      <div
        className="absolute top-1/3 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full blur-3xl pointer-events-none transition-all duration-1000"
        style={{
          background: flipped
            ? hasWord ? "rgba(68, 96, 255, 0.12)" : "rgba(217, 70, 239, 0.08)"
            : "rgba(46, 51, 96, 0.06)",
        }}
      />

      {/* Avatars joueurs (top) */}
      <div className="absolute top-0 left-0 right-0 px-4 pt-safe pt-4">
        <div className="flex items-center justify-center gap-2.5 flex-wrap mb-1.5">
          {players.map((p) => (
            <div key={p.display_name} className="relative">
              <div className={`transition-all duration-500 ${p.is_ready ? "opacity-100" : "opacity-30"}`}>
                <Avatar
                  src={playerAvatars?.[p.display_name]}
                  name={p.display_name}
                  size="sm"
                  className="rounded-xl"
                />
              </div>
              {p.is_ready && (
                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-surface-950 flex items-center justify-center">
                  <span className="text-white text-[8px] font-bold leading-none">✓</span>
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="text-center text-surface-700 text-xs font-mono tracking-widest">
          {readyCount} / {totalCount} prêts
        </p>
      </div>

      <div className="w-full max-w-sm relative z-10 pt-24">
        {loading ? (
          <div className="text-center py-20">
            <div className="text-5xl animate-pulse mb-4">👻</div>
            <p className="text-surface-500 text-sm">Récupération de ta carte…</p>
          </div>
        ) : (
          <>
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
                {/* Dos */}
                <div
                  className="backface-hidden w-full rounded-3xl border border-surface-700/40 bg-surface-900/80 flex flex-col items-center justify-center p-10 gap-5"
                  style={{ minHeight: "320px", backfaceVisibility: "hidden" }}
                >
                  <div className="relative">
                    <div className="text-8xl font-black text-surface-800 leading-none" style={{ fontFamily: "monospace" }}>?</div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-20 h-20 rounded-full border border-surface-700/25"
                        style={{ background: "radial-gradient(circle, rgba(68,96,255,0.06) 0%, transparent 70%)" }} />
                    </div>
                  </div>
                  <p className="text-surface-600 text-sm font-medium">Tape pour révéler ton mot</p>
                </div>

                {/* Face */}
                <div
                  className="absolute inset-0 backface-hidden w-full rounded-3xl border-2 flex flex-col items-center justify-center p-8"
                  style={{
                    backfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
                    minHeight: "320px",
                    background: hasWord
                      ? "linear-gradient(145deg, #0c1145 0%, #181c3a 100%)"
                      : "linear-gradient(145deg, #1a0830 0%, #0e0318 100%)",
                    borderColor: hasWord ? "rgba(68,96,255,0.5)" : "rgba(217,70,239,0.35)",
                    boxShadow: hasWord
                      ? "0 0 40px rgba(68,96,255,0.2)"
                      : "0 0 40px rgba(217,70,239,0.15)",
                  }}
                >
                  {hasWord ? (
                    <div className="text-center w-full">
                      <p className="text-brand-400/40 text-[10px] uppercase tracking-[0.3em] mb-6">Ton mot secret</p>
                      {privateData?.wordImageUrl && (
                        <div className="relative w-36 h-36 mx-auto mb-5 rounded-2xl overflow-hidden border border-brand-500/25"
                          style={{ boxShadow: "0 0 24px rgba(68,96,255,0.3)" }}>
                          <Image src={privateData.wordImageUrl} alt={privateData.word!} fill className="object-cover" unoptimized />
                        </div>
                      )}
                      <p
                        className={`font-display font-black text-white tracking-tight leading-none ${privateData?.wordImageUrl ? "text-3xl" : "text-5xl"}`}
                        style={{ textShadow: "0 0 40px rgba(107,137,255,0.7)" }}
                      >
                        {privateData?.word}
                      </p>
                      <p className="text-brand-400/20 text-xs mt-8 tracking-wide">Mémorise-le — ne le révèle pas.</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="text-6xl mb-5 animate-float">💨</div>
                      <p className="text-ghost-400/40 text-[10px] uppercase tracking-[0.3em] mb-3">Tu es le Vide</p>
                      <p className="text-4xl font-display font-black text-white" style={{ textShadow: "0 0 40px rgba(217,70,239,0.6)" }}>
                        Aucun mot
                      </p>
                      <p className="text-ghost-400/20 text-xs mt-8 tracking-wide">Bluffe. Imite. Survie.</p>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>

            <AnimatePresence>
              {flipped && !confirmed && (
                <motion.button
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5, type: "spring", stiffness: 300, damping: 24 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={handleConfirm}
                  className="w-full bg-gradient-brand text-white font-display font-bold text-lg py-4 rounded-2xl glow-brand hover:opacity-92 transition-opacity"
                >
                  Mémorisé ✓
                </motion.button>
              )}
              {confirmed && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center justify-center gap-2 py-4 text-brand-400 text-sm font-medium"
                >
                  <div className="w-4 h-4 rounded-full border-2 border-brand-400 border-t-transparent animate-spin" />
                  En attente des autres joueurs…
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </div>
  );
}
