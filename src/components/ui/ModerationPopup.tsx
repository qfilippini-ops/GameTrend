"use client";

import { motion, AnimatePresence } from "framer-motion";

interface ModerationPopupProps {
  /** Liste des champs bloqués, ex: ["Couverture", 'Carte "Pomme"'] */
  fields: string[];
  onClose: () => void;
}

export default function ModerationPopup({ fields, onClose }: ModerationPopupProps) {
  if (fields.length === 0) return null;

  const last = fields[fields.length - 1];
  const extra = fields.length - 1;

  return (
    <AnimatePresence>
      <motion.div
        key={fields.length}
        initial={{ opacity: 0, y: 24, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] w-[calc(100vw-32px)] max-w-sm"
      >
        <div
          className="rounded-2xl border border-red-800/50 bg-surface-950 overflow-hidden"
          style={{ boxShadow: "0 12px 40px rgba(0,0,0,0.8), 0 0 0 1px rgba(220,38,38,0.15)" }}
        >
          <div className="flex items-start gap-3 px-4 py-3.5">
            <span className="text-2xl shrink-0 mt-0.5">🔞</span>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm leading-snug">
                Image refusée
                {extra > 0 && (
                  <span className="ml-2 text-xs bg-red-900/60 text-red-300 px-1.5 py-0.5 rounded-full">
                    +{extra} autre{extra > 1 ? "s" : ""}
                  </span>
                )}
              </p>
              <p className="text-surface-400 text-xs mt-0.5">
                <span className="text-red-400 font-medium">{last}</span>
                {" "}contient du contenu inapproprié et n&apos;a pas été ajouté.
              </p>
              <p className="text-surface-600 text-[11px] mt-1">
                Choisis une autre image pour continuer.
              </p>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 text-surface-600 hover:text-white transition-colors text-base leading-none mt-0.5"
              aria-label="Fermer"
            >
              ✕
            </button>
          </div>
          <div
            className="h-1 bg-red-700/60"
            style={{ width: "100%" }}
          />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
