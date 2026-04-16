"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import Avatar from "@/components/ui/Avatar";
import { useAuth } from "@/hooks/useAuth";
import { useFriendsList } from "@/hooks/useFriendsList";
import { getActivityStatus, ACTIVITY_LABELS, ACTIVITY_COLORS } from "@/types/social";

export default function FriendsPanel() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const isConnected = !!(user && !user.is_anonymous);
  const { friends, loading } = useFriendsList(isConnected ? user!.id : null);

  const onlineCount = friends.filter(
    (f) => f.is_online || !!f.room_id
  ).length;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative w-9 h-9 flex items-center justify-center rounded-xl bg-surface-800/80 border border-surface-700/50 text-surface-300 hover:text-white hover:border-brand-500/50 transition-all"
        aria-label="Amis"
      >
        👥
        {isConnected && onlineCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-emerald-500 border border-surface-900 text-white text-[9px] font-bold flex items-center justify-center">
            {onlineCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: -8 }}
            transition={{ type: "spring", stiffness: 350, damping: 30 }}
            className="absolute right-0 top-12 z-[200] w-72 rounded-2xl border border-surface-700/40 bg-surface-900 shadow-2xl overflow-hidden"
          >
            {!isConnected ? (
              /* Non connecté */
              <div className="px-5 py-6 text-center flex flex-col items-center gap-3">
                <span className="text-3xl">👥</span>
                <p className="text-white font-display font-bold text-sm">Tes amis</p>
                <p className="text-surface-400 text-xs leading-relaxed">
                  Connecte-toi pour voir tes amis, rejoindre leurs parties et suivre leur activité.
                </p>
                <Link
                  href="/auth/login"
                  onClick={() => setOpen(false)}
                  className="mt-1 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold transition-colors"
                >
                  Se connecter
                </Link>
              </div>
            ) : (
              /* Connecté */
              <>
                <div className="flex items-center justify-between px-4 py-3 border-b border-surface-800/60">
                  <p className="text-white font-display font-bold text-sm">Amis</p>
                  {onlineCount > 0 && (
                    <span className="text-xs text-emerald-400 font-medium">
                      {onlineCount} en ligne
                    </span>
                  )}
                </div>

                <div className="max-h-72 overflow-y-auto">
                  {loading ? (
                    <div className="py-6 text-center text-surface-600 text-sm">
                      Chargement…
                    </div>
                  ) : friends.length === 0 ? (
                    <div className="py-8 text-center">
                      <p className="text-3xl mb-2">👥</p>
                      <p className="text-surface-500 text-sm">Aucun ami encore</p>
                      <p className="text-surface-700 text-xs mt-1">
                        Visite le profil d&apos;un joueur pour l&apos;ajouter
                      </p>
                    </div>
                  ) : (
                    friends.map((f) => {
                      const status = getActivityStatus(f);
                      const canJoin = !!f.room_id && f.room_phase === "lobby";
                      const joinUrl = canJoin
                        ? `/games/${f.game_type ?? "ghostword"}/online/${f.room_id}`
                        : null;

                      return (
                        <div
                          key={f.user_id}
                          className="flex items-center gap-3 px-4 py-2.5 border-b border-surface-800/30 last:border-0 hover:bg-surface-800/20 transition-colors"
                        >
                          <div className="relative shrink-0">
                            <Link href={`/profile/${f.user_id}`} onClick={() => setOpen(false)}>
                              <Avatar
                                src={f.avatar_url}
                                name={f.username}
                                size="sm"
                                className="rounded-xl"
                              />
                            </Link>
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface-900 ${ACTIVITY_COLORS[status]}`}
                            />
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium truncate">
                              {f.username ?? "Joueur"}
                            </p>
                            <p
                              className={`text-xs truncate ${
                                status === "offline" ? "text-surface-600" : "text-surface-400"
                              }`}
                            >
                              {ACTIVITY_LABELS[status]}
                              {f.game_type && status !== "offline" && ` · ${f.game_type}`}
                            </p>
                          </div>

                          {joinUrl && (
                            <Link
                              href={joinUrl}
                              onClick={() => setOpen(false)}
                              className="shrink-0 text-xs px-2.5 py-1.5 rounded-xl bg-brand-600/20 text-brand-300 border border-brand-600/30 hover:bg-brand-600/30 font-medium transition-colors"
                            >
                              Rejoindre
                            </Link>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="px-4 py-2.5 border-t border-surface-800/40">
                  <Link
                    href="/friends"
                    onClick={() => setOpen(false)}
                    className="block w-full text-center text-brand-400 text-xs font-medium hover:text-brand-300 transition-colors"
                  >
                    Gérer mes amis →
                  </Link>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
