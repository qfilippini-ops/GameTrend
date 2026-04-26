"use client";

import { useEffect, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "@/i18n/navigation";
import { createTicket, type TicketType } from "@/app/actions/tickets";
import {
  TICKET_BODY_MAX,
  TICKET_BODY_MIN,
  TICKET_TITLE_MAX,
  TICKET_TITLE_MIN,
} from "@/lib/support/limits";

interface TicketDialogProps {
  open: boolean;
  onClose: () => void;
}

// Modale de soumission de ticket. Trois types : bug / idée / autre.
// Validation côté front (longueurs) ET côté serveur (RPC create_ticket
// + CHECK SQL). Pas de liste publique des tickets : c'est privé à
// l'auteur (RLS) et l'admin (service_role). Une fois soumis, on affiche
// un état "envoyé" et on ferme après 1.5s.
export function TicketDialog({ open, onClose }: TicketDialogProps) {
  const t = useTranslations("home.roadmap.ticket");
  const { user } = useAuth();
  const isLoggedIn = !!user && !user.is_anonymous;

  const [type, setType] = useState<TicketType>("bug");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  // Reset à chaque ouverture pour éviter un état résiduel après un envoi.
  useEffect(() => {
    if (open) {
      setType("bug");
      setTitle("");
      setBody("");
      setError(null);
      setSent(false);
    }
  }, [open]);

  // ESC pour fermer
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, pending]);

  function submit() {
    setError(null);
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (
      trimmedTitle.length < TICKET_TITLE_MIN ||
      trimmedTitle.length > TICKET_TITLE_MAX
    ) {
      setError(t("errInvalidTitle"));
      return;
    }
    if (
      trimmedBody.length < TICKET_BODY_MIN ||
      trimmedBody.length > TICKET_BODY_MAX
    ) {
      setError(t("errInvalidBody"));
      return;
    }
    startTransition(async () => {
      const res = await createTicket(type, trimmedTitle, trimmedBody);
      if (!res.ok) {
        setError(t("errSubmit"));
        return;
      }
      setSent(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    });
  }

  if (!open) return null;

  const typeOptions: { value: TicketType; emoji: string }[] = [
    { value: "bug", emoji: "🐛" },
    { value: "idea", emoji: "💡" },
    { value: "other", emoji: "💬" },
  ];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={() => {
          if (!pending) onClose();
        }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md rounded-2xl border border-surface-700/50 bg-surface-900 p-5 space-y-3 max-h-[90vh] overflow-y-auto"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display font-bold text-white text-lg">
                {t("title")}
              </h3>
              <p className="text-xs text-surface-500 mt-0.5">{t("subtitle")}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              aria-label={t("close")}
              className="text-surface-500 hover:text-surface-200 transition-colors text-xl leading-none px-2"
            >
              ×
            </button>
          </div>

          {!isLoggedIn ? (
            <div className="space-y-3 py-4">
              <p className="text-surface-300 text-sm">{t("loginRequired")}</p>
              <Link
                href="/auth/login"
                className="block w-full text-center px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-bold transition-colors"
              >
                {t("loginCta")}
              </Link>
            </div>
          ) : sent ? (
            <div className="py-6 text-center space-y-2">
              <div className="text-4xl">✅</div>
              <p className="text-emerald-400 font-bold">{t("sent")}</p>
              <p className="text-surface-500 text-xs">{t("sentDetail")}</p>
            </div>
          ) : (
            <>
              {/* ── Type ──────────────────────────────────────── */}
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-surface-500 font-bold mb-1.5">
                  {t("typeLabel")}
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {typeOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setType(opt.value)}
                      className={`py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                        type === opt.value
                          ? "bg-brand-600 text-white"
                          : "bg-surface-800/60 border border-surface-700/60 text-surface-300 hover:text-surface-100"
                      }`}
                    >
                      <span aria-hidden>{opt.emoji}</span>
                      {t(`type.${opt.value}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Title ─────────────────────────────────────── */}
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-surface-500 font-bold mb-1.5">
                  {t("titleField")}
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) =>
                    setTitle(e.target.value.slice(0, TICKET_TITLE_MAX))
                  }
                  maxLength={TICKET_TITLE_MAX}
                  placeholder={t("titlePlaceholder")}
                  className="w-full px-3 py-2 rounded-lg bg-surface-950/60 border border-surface-700/60 text-surface-100 text-sm placeholder:text-surface-600 focus:outline-none focus:border-brand-500/60"
                  disabled={pending}
                />
                <p
                  className={`text-[10px] text-right pr-1 mt-0.5 tabular-nums ${
                    title.length >= TICKET_TITLE_MAX - 10
                      ? "text-amber-400"
                      : "text-surface-600"
                  }`}
                >
                  {title.length}/{TICKET_TITLE_MAX}
                </p>
              </div>

              {/* ── Body ──────────────────────────────────────── */}
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-surface-500 font-bold mb-1.5">
                  {t("bodyField")}
                </label>
                <textarea
                  value={body}
                  onChange={(e) =>
                    setBody(e.target.value.slice(0, TICKET_BODY_MAX))
                  }
                  maxLength={TICKET_BODY_MAX}
                  rows={5}
                  placeholder={t("bodyPlaceholder")}
                  className="w-full px-3 py-2 rounded-lg bg-surface-950/60 border border-surface-700/60 text-surface-100 text-sm placeholder:text-surface-600 focus:outline-none focus:border-brand-500/60 resize-none"
                  disabled={pending}
                />
                <p
                  className={`text-[10px] text-right pr-1 mt-0.5 tabular-nums ${
                    body.length >= TICKET_BODY_MAX - 100
                      ? "text-amber-400"
                      : "text-surface-600"
                  }`}
                >
                  {body.length}/{TICKET_BODY_MAX}
                </p>
              </div>

              {error && (
                <p className="text-rose-400 text-xs">{error}</p>
              )}

              <div className="flex gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={pending}
                  className="px-4 py-2 rounded-xl text-sm text-surface-300 hover:bg-surface-800/60 transition-colors"
                >
                  {t("cancel")}
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={
                    pending ||
                    title.trim().length < TICKET_TITLE_MIN ||
                    body.trim().length < TICKET_BODY_MIN
                  }
                  className="px-4 py-2 rounded-xl text-sm font-bold bg-brand-600 hover:bg-brand-500 text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {pending ? t("sending") : t("submit")}
                </button>
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
