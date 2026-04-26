"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import Avatar from "@/components/ui/Avatar";
import { useAuth } from "@/hooks/useAuth";
import { useGroup } from "@/hooks/useGroup";
import {
  acceptGroupInvite,
  declineGroupInvite,
} from "@/app/actions/groups";

/**
 * Affiche les invitations de groupe en attente sous forme de **toast push**
 * dans le coin supérieur droit (en dessous du header), pour qu'elles soient
 * impossibles à manquer. Réagit en realtime via `useGroup.pendingInvites`.
 *
 * Une fois acceptée/refusée, l'invitation disparaît côté DB et le toast
 * s'efface automatiquement.
 */
export default function GroupInviteToasts() {
  const t = useTranslations("notifications.groupInvite");
  const tg = useTranslations("notifications");
  const { user } = useAuth();
  const isConnected = !!(user && !user.is_anonymous);
  const { pendingInvites } = useGroup();

  const [mounted, setMounted] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isConnected || !mounted) return null;

  const visible = pendingInvites.filter((i) => !dismissedIds.has(i.id));

  async function handle(invitationId: string, action: "accept" | "decline") {
    setBusyIds((prev) => new Set(prev).add(invitationId));
    if (action === "accept") {
      await acceptGroupInvite(invitationId);
    } else {
      await declineGroupInvite(invitationId);
    }
    setBusyIds((prev) => {
      const next = new Set(prev);
      next.delete(invitationId);
      return next;
    });
  }

  function dismiss(invitationId: string) {
    setDismissedIds((prev) => new Set(prev).add(invitationId));
  }

  return createPortal(
    <div
      aria-live="polite"
      className="fixed top-20 right-4 z-[400] flex flex-col gap-3 max-w-[calc(100vw-2rem)] w-[340px] pointer-events-none"
    >
      <AnimatePresence initial={false}>
        {visible.map((invite) => {
          const busy = busyIds.has(invite.id);
          return (
            <motion.div
              key={invite.id}
              layout
              initial={{ opacity: 0, x: 80, scale: 0.92 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 80, scale: 0.92 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className="pointer-events-auto rounded-2xl border border-brand-500/40 bg-surface-900/95 backdrop-blur-xl shadow-2xl p-3 ring-1 ring-brand-500/20"
              style={{
                boxShadow:
                  "0 10px 40px -8px rgba(68,96,255,0.45), 0 0 0 1px rgba(68,96,255,0.15)",
              }}
            >
              <div className="flex items-start gap-3">
                <Avatar
                  src={invite.inviter_avatar}
                  name={invite.inviter_username ?? "?"}
                  size="sm"
                  className="rounded-xl shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm leading-snug">
                    <span className="mr-1">💬</span>
                    <span className="font-medium">
                      {invite.inviter_username ?? tg("anonymous")}
                    </span>{" "}
                    {t("invites")}
                  </p>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handle(invite.id, "accept")}
                      disabled={busy}
                      className="flex-1 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {tg("accept")}
                    </button>
                    <button
                      onClick={() => handle(invite.id, "decline")}
                      disabled={busy}
                      className="flex-1 px-3 py-1.5 rounded-xl border border-surface-700/40 text-surface-300 text-xs hover:text-red-400 hover:border-red-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {tg("decline")}
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => dismiss(invite.id)}
                  title={tg("delete")}
                  aria-label={tg("delete")}
                  className="shrink-0 w-6 h-6 flex items-center justify-center rounded-lg text-surface-500 hover:text-white hover:bg-surface-800/60 transition-colors text-xs"
                >
                  ✕
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>,
    document.body
  );
}
