"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "@/i18n/navigation";
import { createTicket, type TicketType } from "@/app/actions/tickets";
import {
  TICKET_ALLOWED_IMAGE_TYPES,
  TICKET_BODY_MAX,
  TICKET_BODY_MIN,
  TICKET_MAX_ATTACHMENTS,
  TICKET_TITLE_MAX,
  TICKET_TITLE_MIN,
} from "@/lib/support/limits";
import { compressImage } from "@/lib/compressImage";
import { createClient } from "@/lib/supabase/client";

interface TicketDialogProps {
  open: boolean;
  onClose: () => void;
}

// Pièce jointe locale en cours d'édition. Une fois uploadée, on retient le
// path Supabase (relatif au bucket privé) + une URL signée pour preview.
interface PendingAttachment {
  id: string;            // identifiant local (clé React)
  path: string;          // chemin dans le bucket "ticket-attachments"
  previewUrl: string;    // URL signée (15 min) pour la preview locale
  uploading: boolean;    // pendant la compression / l'upload
  error?: string;        // message d'erreur affiché sous la vignette
}

const ATTACH_BUCKET = "ticket-attachments";

// Modale de soumission de ticket. Trois types : bug / idée / autre.
// Validation côté front (longueurs, MIME) ET côté serveur (RPC create_ticket
// + CHECK SQL + filtrage des paths). Les images sont compressées en WebP
// (≤ 0.5 MB) et uploadées immédiatement, on ne stocke en base que le path.
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
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // sessionId : prefixe stable pour l'upload des fichiers d'un même
  // brouillon. Permet, en cas d'annulation, de cleanup d'un coup tout le
  // dossier (non implémenté côté client, on laisse l'admin purger).
  const sessionIdRef = useRef<string>(crypto.randomUUID());

  function resetState() {
    setType("bug");
    setTitle("");
    setBody("");
    setError(null);
    setSent(false);
    setAttachments([]);
    sessionIdRef.current = crypto.randomUUID();
  }

  useEffect(() => {
    if (open) resetState();
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

  async function handleFiles(files: FileList | null) {
    if (!files || !user) return;
    const remaining = TICKET_MAX_ATTACHMENTS - attachments.length;
    if (remaining <= 0) {
      setError(t("errTooManyAttachments"));
      return;
    }
    const list = Array.from(files).slice(0, remaining);
    if (list.length === 0) return;

    setError(null);
    const supabase = createClient();

    for (const raw of list) {
      // Validation MIME basique. La compression convertit en WebP, ce qui
      // est aussi dans la liste des types autorisés du bucket.
      if (
        !(TICKET_ALLOWED_IMAGE_TYPES as readonly string[]).includes(raw.type)
      ) {
        setError(t("errInvalidImageType"));
        continue;
      }

      const localId = crypto.randomUUID();
      setAttachments((prev) => [
        ...prev,
        {
          id: localId,
          path: "",
          previewUrl: URL.createObjectURL(raw),
          uploading: true,
        },
      ]);

      try {
        // moderate: false → on évite les faux positifs NSFW sur des
        // screenshots d'UI / d'erreurs.
        const compressed = await compressImage(raw, {
          maxWidthOrHeight: 1600,
          maxSizeMB: 0.5,
          quality: 0.85,
          moderate: false,
        });

        const path = `${user.id}/${sessionIdRef.current}/${localId}.webp`;
        const { error: uploadError } = await supabase.storage
          .from(ATTACH_BUCKET)
          .upload(path, compressed, {
            cacheControl: "3600",
            upsert: false,
            contentType: compressed.type || "image/webp",
          });
        if (uploadError) throw uploadError;

        const { data: signed } = await supabase.storage
          .from(ATTACH_BUCKET)
          .createSignedUrl(path, 60 * 15);

        setAttachments((prev) =>
          prev.map((a) =>
            a.id === localId
              ? {
                  ...a,
                  path,
                  previewUrl: signed?.signedUrl ?? a.previewUrl,
                  uploading: false,
                }
              : a
          )
        );
      } catch (e) {
        console.error("[TicketDialog] upload", e);
        setAttachments((prev) =>
          prev.map((a) =>
            a.id === localId
              ? { ...a, uploading: false, error: t("errUpload") }
              : a
          )
        );
      }
    }

    // Reset l'input pour permettre de re-sélectionner le même fichier
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function removeAttachment(id: string) {
    const target = attachments.find((a) => a.id === id);
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    if (target?.path) {
      try {
        const supabase = createClient();
        await supabase.storage.from(ATTACH_BUCKET).remove([target.path]);
      } catch (e) {
        // Best-effort : si le delete échoue, l'admin pourra purger.
        console.warn("[TicketDialog] remove attachment", e);
      }
    }
  }

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
    if (attachments.some((a) => a.uploading)) {
      setError(t("errStillUploading"));
      return;
    }
    const paths = attachments
      .filter((a) => a.path && !a.error)
      .map((a) => a.path);

    startTransition(async () => {
      const res = await createTicket(type, trimmedTitle, trimmedBody, paths);
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

  const remainingSlots = TICKET_MAX_ATTACHMENTS - attachments.length;

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

              {/* ── Attachments ──────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] uppercase tracking-wider text-surface-500 font-bold">
                    {t("attachmentsLabel")}
                  </label>
                  <span className="text-[10px] text-surface-600 tabular-nums">
                    {attachments.length}/{TICKET_MAX_ATTACHMENTS}
                  </span>
                </div>

                {attachments.length > 0 && (
                  <div className="grid grid-cols-3 gap-1.5 mb-2">
                    {attachments.map((a) => (
                      <div
                        key={a.id}
                        className="relative aspect-square rounded-lg overflow-hidden border border-surface-700/60 bg-surface-950/60"
                      >
                        {/* preview */}
                        {a.previewUrl && (
                          // On utilise <img> brute : les URLs signées Supabase
                          // ne sont pas dans la liste des domaines next/image.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={a.previewUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        )}
                        {a.uploading && (
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                            <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                          </div>
                        )}
                        {a.error && (
                          <div className="absolute inset-0 bg-rose-950/80 flex items-center justify-center text-[9px] text-rose-200 text-center px-1">
                            {a.error}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removeAttachment(a.id)}
                          aria-label={t("removeAttachment")}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white text-xs leading-none flex items-center justify-center hover:bg-rose-600/90 transition-colors"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept={(TICKET_ALLOWED_IMAGE_TYPES as readonly string[]).join(",")}
                  multiple
                  onChange={(e) => {
                    void handleFiles(e.target.files);
                  }}
                  className="hidden"
                  disabled={pending || remainingSlots <= 0}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={pending || remainingSlots <= 0}
                  className="w-full px-3 py-2 rounded-lg border border-dashed border-surface-700/60 text-surface-400 text-xs hover:border-brand-500/40 hover:text-brand-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  {remainingSlots > 0
                    ? t("addImage")
                    : t("attachmentsLimit")}
                </button>
                <p className="text-[10px] text-surface-600 mt-1">
                  {t("attachmentsHint")}
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
                    body.trim().length < TICKET_BODY_MIN ||
                    attachments.some((a) => a.uploading)
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
