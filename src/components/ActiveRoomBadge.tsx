"use client";

import { useRouter, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useActiveRoom } from "@/hooks/useActiveRoom";

const PHASE_LABELS: Record<string, string> = {
  lobby:      "En lobby",
  reveal:     "En partie",
  discussion: "En partie",
  vote:       "En partie",
  result:     "Résultats",
};

const GAME_PATHS: Record<string, string> = {
  ghostword: "/games/ghostword/online",
};

export default function ActiveRoomBadge() {
  const router = useRouter();
  const pathname = usePathname();
  const { activeRoom, loading } = useActiveRoom();

  if (loading || !activeRoom) return null;

  // Masquer si on est déjà dans cette room
  const roomPath = `${GAME_PATHS[activeRoom.game_type] ?? "/games"}/${activeRoom.id}`;
  if (pathname.startsWith(roomPath)) return null;

  const label = PHASE_LABELS[activeRoom.phase] ?? "En jeu";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.9 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        className="fixed bottom-28 right-4 z-50"
      >
        <button
          onClick={() => router.push(roomPath)}
          className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl border border-emerald-600/40 bg-surface-950/90 backdrop-blur-xl text-white shadow-lg hover:border-emerald-500/60 transition-all"
          style={{ boxShadow: "0 0 20px rgba(52,211,153,0.12), 0 4px 24px rgba(0,0,0,0.5)" }}
        >
          {/* Pulsing dot */}
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
          </span>
          <span className="text-sm font-medium text-emerald-300">{label}</span>
          <span className="text-xs font-mono text-surface-500 border-l border-surface-700/50 pl-2">
            {activeRoom.id}
          </span>
          <span className="text-surface-500 text-xs">→</span>
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
