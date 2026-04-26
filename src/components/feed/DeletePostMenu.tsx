"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { deleteMyPost, type PostType } from "@/app/actions/posts";

// Menu contextuel "⋯" affiché sur les publications du feed pour leur auteur.
// Les deux types de publications passent désormais par le RPC delete_my_post,
// qui :
//   - 'result' : nettoie post_reactions / post_comments / notifs liées
//   - 'preset' : idem + supprime la ligne presets (cascade SQL pour
//     preset_likes/preset_comments). Les assets storage (covers / images)
//     ne sont PAS nettoyés ici — pour un nettoyage complet d'un preset,
//     utiliser DeletePresetButton sur la page preset.

type DeleteKind = "result" | "preset";

interface DeletePostMenuProps {
  kind: DeleteKind;
  postId: string; // result_id OU preset_id
  // Appelé après suppression réussie (le parent retire la publication
  // localement, sinon on attend la prochaine pagination).
  onDeleted?: () => void;
}

export function DeletePostMenu({
  kind,
  postId,
  onDeleted,
}: DeletePostMenuProps) {
  const t = useTranslations("feed.postMenu");

  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Ferme le menu au clic extérieur.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteMyPost(kind as PostType, postId);
      if (!res.ok) {
        setError(res.error ?? t("errDelete"));
        return;
      }
      setConfirming(false);
      setOpen(false);
      onDeleted?.();
    });
  }

  return (
    <div ref={wrapRef} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label={t("openMenu")}
        className="w-7 h-7 flex items-center justify-center rounded-full text-surface-400 hover:bg-surface-800/60 hover:text-surface-100 transition-colors"
      >
        ⋯
      </button>

      <AnimatePresence>
        {open && !confirming && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-8 z-20 min-w-[160px] rounded-lg bg-surface-900 border border-surface-700 shadow-xl py-1"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setConfirming(true);
              }}
              className="w-full px-3 py-2 text-left text-sm text-rose-300 hover:bg-rose-950/40 transition-colors"
            >
              🗑️ {t("delete")}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de confirmation */}
      <AnimatePresence>
        {confirming && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={(e) => {
              e.stopPropagation();
              if (!pending) setConfirming(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-surface-900 border border-surface-700 rounded-2xl p-5 max-w-sm w-full shadow-2xl"
            >
              <h3 className="font-display font-bold text-lg text-surface-100">
                {t("confirmTitle")}
              </h3>
              <p className="text-sm text-surface-400 mt-2">
                {t("confirmBody")}
              </p>
              {error && (
                <p className="text-xs text-rose-400 mt-2">{error}</p>
              )}
              <div className="mt-4 flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={pending}
                  className="px-3 py-2 rounded-lg text-sm text-surface-300 hover:bg-surface-800/60 transition-colors"
                >
                  {t("cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={pending}
                  className="px-3 py-2 rounded-lg text-sm font-bold bg-rose-600 hover:bg-rose-500 text-white transition-colors disabled:opacity-60"
                >
                  {pending ? "…" : t("confirmDelete")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
