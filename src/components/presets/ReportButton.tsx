"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { submitReport } from "@/app/actions/report";

const REASON_IDS = [
  "inappropriate_image",
  "hate_speech",
  "violence",
  "spam",
  "copyright",
  "other",
] as const;
const REASON_EMOJIS: Record<typeof REASON_IDS[number], string> = {
  inappropriate_image: "🔞",
  hate_speech: "🚫",
  violence: "⚠️",
  spam: "📢",
  copyright: "©️",
  other: "✏️",
};

type ReasonId = typeof REASON_IDS[number];

interface ReportButtonProps {
  presetId: string;
  presetName?: string;
  userId: string | null;
}

export default function ReportButton({ presetId, presetName, userId }: ReportButtonProps) {
  const router = useRouter();
  const t = useTranslations("presets.report");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReasonId | null>(null);
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpen() {
    if (!userId) {
      router.push(`/auth/login?redirect=/presets/${presetId}`);
      return;
    }
    setOpen(true);
  }

  async function handleSubmit() {
    if (!reason || !userId) return;
    setLoading(true);
    setError(null);

    const result = await submitReport({
      presetId,
      reason,
      details,
      presetName,
    });

    setLoading(false);

    if (!result.success) {
      setError(result.error ?? t("errorGeneric"));
      return;
    }
    setDone(true);
  }

  function handleClose() {
    setOpen(false);
    setTimeout(() => {
      setReason(null);
      setDetails("");
      setDone(false);
      setError(null);
    }, 300);
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="text-surface-600 hover:text-red-400 text-xs transition-colors flex items-center gap-1"
        title={t("tooltip")}
      >
        <span>⚑</span>
        <span>{t("buttonLabel")}</span>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[99] bg-black/50 backdrop-blur-sm"
              onClick={handleClose}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="fixed inset-0 z-[100] flex items-center justify-center px-5 pointer-events-none"
            >
              <div
                className="pointer-events-auto w-full max-w-sm rounded-3xl border border-surface-700/30 bg-surface-950 overflow-hidden"
                style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.8)" }}
              >
                {done ? (
                  <div className="px-6 py-8 text-center space-y-3">
                    <div className="text-4xl">✅</div>
                    <p className="text-white font-display font-bold">{t("doneTitle")}</p>
                    <p className="text-surface-400 text-sm">
                      {t("doneText")}
                    </p>
                    <button
                      onClick={handleClose}
                      className="w-full py-3 rounded-2xl bg-surface-800 text-white font-semibold text-sm mt-2"
                    >
                      {t("close")}
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between px-5 py-4 border-b border-surface-800/60">
                      <p className="text-white font-display font-bold text-sm">{t("title")}</p>
                      <button onClick={handleClose} className="text-surface-600 hover:text-white transition-colors text-lg">✕</button>
                    </div>

                    <div className="px-5 py-4 space-y-3">
                      <p className="text-surface-400 text-xs">{t("chooseReason")}</p>

                      <div className="space-y-1.5">
                        {REASON_IDS.map((id) => (
                          <button
                            key={id}
                            onClick={() => setReason(id)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all text-sm border ${
                              reason === id
                                ? "bg-red-950/40 border-red-700/40 text-white"
                                : "bg-surface-900/50 border-surface-800/40 text-surface-300 hover:border-surface-700/60"
                            }`}
                          >
                            <span className="text-base shrink-0">{REASON_EMOJIS[id]}</span>
                            <span className="flex-1">{t(`reasons.${id}`)}</span>
                            {reason === id && <span className="text-red-400 shrink-0">●</span>}
                          </button>
                        ))}
                      </div>

                      {reason && (
                        <textarea
                          value={details}
                          onChange={(e) => setDetails(e.target.value)}
                          placeholder={t("detailsPlaceholder")}
                          maxLength={500}
                          rows={2}
                          className="w-full bg-surface-900/60 border border-surface-700/40 rounded-xl px-3 py-2.5 text-sm text-white placeholder-surface-600 resize-none outline-none focus:border-surface-600"
                        />
                      )}

                      {error && <p className="text-red-400 text-xs">{error}</p>}

                      <button
                        onClick={handleSubmit}
                        disabled={!reason || loading}
                        className="w-full py-3 rounded-2xl font-display font-bold text-sm text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ background: "linear-gradient(135deg, #dc2626, #b91c1c)" }}
                      >
                        {loading ? t("submitting") : t("submit")}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
