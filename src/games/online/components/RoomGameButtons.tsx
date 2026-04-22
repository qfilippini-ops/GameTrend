"use client";

/**
 * Boutons flottants "Quitter" / "Menu" affichés en haut à droite des écrans
 * de jeu (hors lobby). Génériques — partagés par tous les jeux online.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";

export interface RoomGameButtonsLabels {
  options: string;
  leave: string;
  menu: string;
  cancel: string;
}

interface RoomGameButtonsProps {
  roomId: string;
  myName: string;
  labels: RoomGameButtonsLabels;
  onBeforeLeave: () => void;
  onLeave: () => void;
  onGoHome: () => void;
}

export default function RoomGameButtons({
  roomId,
  myName,
  labels,
  onBeforeLeave,
  onLeave,
  onGoHome,
}: RoomGameButtonsProps) {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  async function doLeave() {
    setLeaving(true);
    onBeforeLeave();
    const supabase = createClient();
    await supabase.rpc("quit_room_fn", {
      p_room_id: roomId,
      p_display_name: myName,
    });
    onLeave();
  }

  return (
    <div className="fixed top-3 right-3 z-50">
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -8 }}
            className="flex flex-col gap-1.5 p-2.5 rounded-2xl border border-surface-700/50 bg-surface-950/97 backdrop-blur-xl shadow-2xl w-[180px]"
          >
            <button
              onClick={doLeave}
              disabled={leaving}
              className="w-full py-2.5 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-500 transition-colors disabled:opacity-50"
            >
              {leaving ? "…" : labels.leave}
            </button>
            <button
              onClick={() => {
                setOpen(false);
                onGoHome();
              }}
              className="w-full py-2.5 rounded-xl border border-surface-700/40 text-surface-300 text-xs font-medium hover:text-white hover:border-surface-600 transition-colors"
            >
              {labels.menu}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="w-full py-1.5 text-surface-600 text-xs hover:text-surface-400 transition-colors"
            >
              {labels.cancel}
            </button>
          </motion.div>
        ) : (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-surface-700/40 bg-surface-950/90 backdrop-blur-xl text-surface-500 hover:text-surface-300 hover:border-surface-600/40 transition-all text-xs shadow-lg"
          >
            {labels.options}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
