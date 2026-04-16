"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useFriendship } from "@/hooks/useFriendship";

interface FriendButtonProps {
  targetUserId: string;
  /** Classe CSS supplémentaire pour l'intégration dans différents contextes */
  className?: string;
}

export default function FriendButton({ targetUserId, className = "" }: FriendButtonProps) {
  const { state, loading, actionLoading, sendRequest, respond, removeFriend } = useFriendship(targetUserId);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);

  async function handleAdd() {
    const res = await sendRequest();
    if (res?.error) setFeedback(res.error);
  }

  async function handleRespond(r: "accept" | "decline") {
    if (!state.id) return;
    await respond(state.id, r);
  }

  if (loading) {
    return (
      <div className={`h-10 w-28 rounded-2xl bg-surface-800 animate-pulse ${className}`} />
    );
  }

  return (
    <div className={`relative ${className}`}>
      <AnimatePresence mode="wait">
        {feedback && (
          <motion.p
            key="fb"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute -top-7 left-0 right-0 text-center text-xs text-red-400"
          >
            {feedback}
          </motion.p>
        )}
      </AnimatePresence>

      {/* ── Aucun lien ── */}
      {state.status === "none" && (
        <button
          onClick={handleAdd}
          disabled={actionLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-gradient-brand text-white text-sm font-bold glow-brand hover:opacity-92 disabled:opacity-50 transition-all"
        >
          {actionLoading ? "…" : "👤 Ajouter"}
        </button>
      )}

      {/* ── Demande envoyée (je suis requester) ── */}
      {state.status === "pending" && state.isRequester && (
        <button
          onClick={() => removeFriend()}
          disabled={actionLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-2xl border border-surface-600/50 bg-surface-800/60 text-surface-400 text-sm font-medium hover:border-red-700/50 hover:text-red-400 disabled:opacity-50 transition-all"
        >
          {actionLoading ? "…" : "⏳ En attente"}
        </button>
      )}

      {/* ── Demande reçue (je suis addressee) ── */}
      {state.status === "pending" && !state.isRequester && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleRespond("accept")}
            disabled={actionLoading}
            className="px-4 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold disabled:opacity-50 transition-all"
          >
            ✓ Accepter
          </button>
          <button
            onClick={() => handleRespond("decline")}
            disabled={actionLoading}
            className="px-3 py-2 rounded-2xl border border-surface-700/40 text-surface-400 hover:text-red-400 text-sm disabled:opacity-50 transition-all"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Amis ── */}
      {state.status === "accepted" && (
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="flex items-center gap-2 px-4 py-2 rounded-2xl border border-emerald-700/40 bg-emerald-950/30 text-emerald-400 text-sm font-bold hover:border-emerald-600/60 transition-all"
          >
            ✓ Amis
          </button>
          <AnimatePresence>
            {showMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.92, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: -4 }}
                className="absolute right-0 top-12 z-20 w-44 rounded-2xl border border-surface-700/40 bg-surface-900 shadow-xl p-1.5"
              >
                <button
                  onClick={() => { removeFriend(); setShowMenu(false); }}
                  disabled={actionLoading}
                  className="w-full py-2 px-3 rounded-xl text-red-400 text-sm hover:bg-red-950/40 transition-colors text-left"
                >
                  Retirer des amis
                </button>
                <button
                  onClick={() => setShowMenu(false)}
                  className="w-full py-2 px-3 rounded-xl text-surface-500 text-xs hover:bg-surface-800 transition-colors text-left"
                >
                  Annuler
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Bloqué ── */}
      {state.status === "blocked" && (
        <span className="px-4 py-2 rounded-2xl border border-surface-700/30 text-surface-600 text-sm">
          Bloqué
        </span>
      )}
    </div>
  );
}
