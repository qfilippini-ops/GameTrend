"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations, useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import Avatar from "@/components/ui/Avatar";
import { Link } from "@/i18n/navigation";

export default function NotificationBell() {
  const t = useTranslations("notifications");
  const locale = useLocale();
  const { user } = useAuth();
  const {
    notifications,
    unreadCount,
    markAllRead,
    markRead,
    deleteNotification,
    refresh: refreshNotifs,
  } = useNotifications(user && !user.is_anonymous ? user.id : null);

  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Version simplifiée pour les non-connectés
  if (!user || user.is_anonymous) {
    return (
      <div className="relative" ref={panelRef}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="relative w-9 h-9 flex items-center justify-center rounded-xl bg-surface-800/80 border border-surface-700/50 text-surface-300 hover:text-white hover:border-brand-500/50 transition-all"
          aria-label={t("ariaLabel")}
        >
          🔔
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
              <div className="px-5 py-6 text-center flex flex-col items-center gap-3">
                <span className="text-3xl">👥</span>
                <p className="text-white font-display font-bold text-sm">{t("joinCommunityTitle")}</p>
                <p className="text-surface-400 text-xs leading-relaxed">
                  {t("joinCommunityText")}
                </p>
                <Link
                  href="/auth/login"
                  onClick={() => setOpen(false)}
                  className="mt-1 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold transition-colors"
                >
                  {t("loginCta")}
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  async function handleRespond(
    notif: (typeof notifications)[0],
    response: "accept" | "decline"
  ) {
    if (!notif.friendship_id) return;
    const { data } = await supabase.rpc("respond_to_friend_request", {
      p_friendship_id: notif.friendship_id,
      p_response: response,
    });
    if (!data?.error) {
      await markRead(notif.id);
      refreshNotifs();
    }
  }

  function togglePanel() {
    if (open) {
      setOpen(false);
    } else {
      setOpen(true);
      // Badge effacé immédiatement à l'ouverture
      if (unreadCount > 0) markAllRead();
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={togglePanel}
        className="relative w-9 h-9 flex items-center justify-center rounded-xl bg-surface-800/80 border border-surface-700/50 text-surface-300 hover:text-white hover:border-brand-500/50 transition-all"
        aria-label={t("ariaLabel")}
      >
        🔔
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              key="badge"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-500 text-white text-[10px] font-bold flex items-center justify-center"
              style={{ boxShadow: "0 0 8px rgba(68,96,255,0.7)" }}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: -8 }}
            transition={{ type: "spring", stiffness: 350, damping: 30 }}
            className="absolute right-0 top-12 z-[200] w-80 rounded-2xl border border-surface-700/40 bg-surface-900 shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-800/60">
              <p className="text-white font-display font-bold text-sm">{t("title")}</p>
            </div>

            {/* Liste */}
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-4xl mb-2">🔔</p>
                  <p className="text-surface-500 text-sm">{t("empty")}</p>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {notifications.map((notif) => (
                    <motion.div
                      key={notif.id}
                      initial={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0, overflow: "hidden" }}
                      transition={{ duration: 0.18 }}
                      className="border-b border-surface-800/30 last:border-0"
                    >
                      <div className="px-4 py-3">
                        <div className="flex items-start gap-3">
                          <Link
                            href={`/profile/${notif.from_user_id}`}
                            onClick={() => setOpen(false)}
                            className="shrink-0 mt-0.5"
                          >
                            <Avatar
                              src={notif.from_profile?.avatar_url}
                              name={notif.from_profile?.username}
                              size="sm"
                              className="rounded-xl"
                            />
                          </Link>

                          <div className="flex-1 min-w-0">
                            {notif.type === "friend_request" ? (
                              <>
                                <p className="text-white text-sm leading-snug">
                                  <span className="font-medium">
                                    {notif.from_profile?.username ?? t("anonymous")}
                                  </span>{" "}
                                  {t("wantsFriend")}
                                </p>
                                {notif.friendship_id && (
                                  <div className="flex gap-2 mt-2">
                                    <button
                                      onClick={() => handleRespond(notif, "accept")}
                                      className="px-3 py-1 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500 transition-colors"
                                    >
                                      {t("accept")}
                                    </button>
                                    <button
                                      onClick={() => handleRespond(notif, "decline")}
                                      className="px-3 py-1 rounded-xl border border-surface-700/40 text-surface-400 text-xs hover:text-red-400 transition-colors"
                                    >
                                      {t("decline")}
                                    </button>
                                  </div>
                                )}
                              </>
                            ) : notif.type === "new_referral" ? (
                              <p className="text-white text-sm leading-snug">
                                <span className="mr-1">🎉</span>
                                {t("newReferral", {
                                  name: notif.from_profile?.username ?? t("anonymous"),
                                })}
                              </p>
                            ) : notif.type === "outbid_navi_shared" ? (
                              (() => {
                                const resultId =
                                  (notif.payload as { result_id?: string } | null | undefined)
                                    ?.result_id ?? null;
                                const href = resultId
                                  ? `/feed#result-${resultId}`
                                  : `/profile/${notif.from_user_id}`;
                                // Si je suis l'auteur du partage, on affiche un
                                // libellé "self" (pas de "X vient de partager…").
                                const isSelf = notif.from_user_id === user?.id;
                                return (
                                  <Link
                                    href={href}
                                    onClick={() => {
                                      setOpen(false);
                                      void markRead(notif.id);
                                    }}
                                    className="block group"
                                  >
                                    <p className="text-white text-sm leading-snug">
                                      <span className="mr-1">🤖</span>
                                      {isSelf ? (
                                        <span className="group-hover:text-violet-300 transition-colors">
                                          {t("outbidNaviShared.self")}
                                        </span>
                                      ) : (
                                        <>
                                          <span className="font-medium group-hover:text-violet-300 transition-colors">
                                            {notif.from_profile?.username ?? t("anonymous")}
                                          </span>{" "}
                                          {t("outbidNaviShared.other")}
                                        </>
                                      )}
                                    </p>
                                  </Link>
                                );
                              })()
                            ) : (
                              <p className="text-white text-sm leading-snug">
                                <span className="font-medium">
                                  {notif.from_profile?.username ?? t("anonymous")}
                                </span>{" "}
                                {t("acceptedFriend")}
                              </p>
                            )}
                            <p className="text-surface-600 text-xs mt-1">
                              {new Date(notif.created_at).toLocaleDateString(locale === "en" ? "en-US" : "fr-FR", {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>

                          {/* Bouton supprimer */}
                          <button
                            onClick={() => deleteNotification(notif.id)}
                            title={t("delete")}
                            className="shrink-0 w-6 h-6 flex items-center justify-center rounded-lg text-surface-600 hover:text-red-400 hover:bg-red-950/40 transition-all text-xs"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2.5 border-t border-surface-800/40">
              <button
                onClick={() => { setOpen(false); router.push("/friends"); }}
                className="w-full text-center text-brand-400 text-xs font-medium hover:text-brand-300 transition-colors"
              >
                {t("viewAllFriends")}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
