"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { compressImage, ModerationError } from "@/lib/compressImage";
import Avatar from "@/components/ui/Avatar";
import type { Profile } from "@/types/database";
import { useSubscription } from "@/hooks/useSubscription";
import PremiumCustomization from "@/components/premium/PremiumCustomization";

interface EditProfileModalProps {
  profile: Profile;
  userId: string;
  onClose: () => void;
  onSaved: (updated: Partial<Profile>) => void;
}

const USERNAME_MIN = 2;
const USERNAME_MAX = 30;
const BIO_MAX = 200;

/**
 * Détecte les liens dans la bio pour empêcher les utilisateurs Free
 * de contourner la fonctionnalité Premium "lien externe".
 *
 * Couvre :
 *   - http(s)://...
 *   - www.xxx
 *   - sous-domaine.tld où tld ∈ liste blanche réaliste
 *   - emails (mailto: ou foo@bar.tld)
 */
const LINK_TLDS = [
  "com","fr","net","org","io","gg","co","tv","app","dev","me","xyz","info","biz","us","uk","de","es","it","jp","ru","cn","in","br","au","ca","tech","store","online","site","cloud","digital","live","life","world","news","today","click","link","page","website","space","fun","games","shop","art","blog","ai","pro","social","media","stream","games","games","gg",
] as const;

const URL_REGEX = new RegExp(
  `(?:https?:\\/\\/|www\\.)\\S+|(?:[a-z0-9-]+\\.)+(?:${LINK_TLDS.join("|")})\\b`,
  "i"
);
const EMAIL_REGEX = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

function detectLink(text: string): boolean {
  if (!text) return false;
  return URL_REGEX.test(text) || EMAIL_REGEX.test(text);
}

export default function EditProfileModal({
  profile,
  userId,
  onClose,
  onSaved,
}: EditProfileModalProps) {
  const t = useTranslations("profile.editModal");
  const tPremium = useTranslations("premium.customization");
  const { isPremium } = useSubscription();
  const [username, setUsername] = useState(profile.username ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.avatar_url ?? null);
  const [loading, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const usernameError =
    username.trim().length > 0 && username.trim().length < USERNAME_MIN
      ? t("usernameMin", { min: USERNAME_MIN })
      : username.length > USERNAME_MAX
        ? t("usernameMax", { max: USERNAME_MAX })
        : null;

  const bioError = detectLink(bio) ? t("bioNoLinks") : null;

  const isValid =
    username.trim().length >= USERNAME_MIN &&
    username.length <= USERNAME_MAX &&
    bio.length <= BIO_MAX &&
    !usernameError &&
    !bioError;

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    const preview = URL.createObjectURL(file);
    setAvatarPreview(preview);
  }

  async function handleSave() {
    if (!isValid) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();

    let newAvatarUrl: string | null = profile.avatar_url ?? null;

    // ── Upload nouvel avatar ───────────────────────────────────
    if (avatarFile) {
      let optimized: File;
      try {
        optimized = await compressImage(avatarFile, {
          maxWidthOrHeight: 400,
          maxSizeMB: 0.2,
          quality: 0.85,
        });
      } catch (err) {
        if (err instanceof ModerationError) {
          setError(err.message);
          setSaving(false);
          return;
        }
        throw err;
      }

      // Chemin fixe : {userId}/avatar.webp — upsert remplace l'ancien
      const path = `${userId}/avatar.webp`;
      const { error: uploadErr } = await supabase.storage
        .from("avatars")
        .upload(path, optimized, { upsert: true, contentType: "image/webp" });

      if (uploadErr) {
        setError(t("uploadError", { message: uploadErr.message }));
        setSaving(false);
        return;
      }

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
      // Cache-busting : forcer le navigateur à recharger l'image
      newAvatarUrl = `${urlData.publicUrl}?v=${Date.now()}`;
    }

    // ── Mettre à jour le profil ────────────────────────────────
    const { error: updateErr } = await supabase
      .from("profiles")
      .update({
        username: username.trim(),
        bio: bio.trim() || null,
        avatar_url: newAvatarUrl,
      })
      .eq("id", userId);

    if (updateErr) {
      if (updateErr.message.includes("bio_contains_link")) {
        setError(t("bioNoLinks"));
      } else if (updateErr.message.includes("username")) {
        setError(t("usernameTaken"));
      } else {
        setError(t("saveError"));
      }
      setSaving(false);
      return;
    }

    onSaved({
      username: username.trim(),
      bio: bio.trim() || null,
      avatar_url: newAvatarUrl,
    });
    setSaving(false);
    onClose();
  }

  return (
    <AnimatePresence>
      {/* Overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-surface-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center px-4 pb-4 sm:pb-0"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ type: "spring", damping: 28, stiffness: 350 }}
          className="w-full max-w-sm rounded-3xl border border-surface-700/40 bg-surface-900 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-surface-800/60 shrink-0">
            <h2 className="text-white font-display font-bold text-lg">{t("headerTitle")}</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-xl text-surface-500 hover:text-white hover:bg-surface-800 transition-all text-lg"
            >
              ✕
            </button>
          </div>

          <div className="px-5 py-5 space-y-5 overflow-y-auto">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <Avatar
                  src={avatarPreview}
                  name={username || profile.username}
                  size="xl"
                />
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-brand-600 hover:bg-brand-500 border-2 border-surface-900 flex items-center justify-center text-white text-sm transition-colors"
                  title={t("changeAvatarTitle")}
                >
                  ✏️
                </button>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="sr-only"
              />
              <p className="text-surface-600 text-xs">{t("avatarHint")}</p>
            </div>

            {/* Pseudo */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-surface-300">{t("usernameRequired")}</label>
                <span className={`text-xs ${username.length > USERNAME_MAX ? "text-red-400" : "text-surface-600"}`}>
                  {username.length}/{USERNAME_MAX}
                </span>
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t("usernamePlaceholder")}
                maxLength={USERNAME_MAX + 5}
                className={`w-full bg-surface-800 border text-white placeholder-surface-600 rounded-xl px-4 py-3 text-sm outline-none transition-colors ${
                  usernameError ? "border-red-500 focus:border-red-400" : "border-surface-700 focus:border-brand-500"
                }`}
              />
              {usernameError && (
                <p className="text-red-400 text-xs mt-1">{usernameError}</p>
              )}
            </div>

            {/* Bio */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-surface-300">{t("bio")}</label>
                <span className={`text-xs ${bio.length > BIO_MAX ? "text-red-400" : "text-surface-600"}`}>
                  {bio.length}/{BIO_MAX}
                </span>
              </div>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
                placeholder={t("bioPlaceholder")}
                rows={3}
                className={`w-full bg-surface-800 border text-white placeholder-surface-600 rounded-xl px-4 py-3 text-sm outline-none transition-colors resize-none ${
                  bioError ? "border-red-500 focus:border-red-400" : "border-surface-700 focus:border-brand-500"
                }`}
              />
              {bioError && (
                <p className="text-red-400 text-xs mt-1">{bioError}</p>
              )}
            </div>

            {error && (
              <p className="text-red-400 text-xs text-center bg-red-950/30 border border-red-800/30 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            {/* ── Personnalisation Premium (lien, bannière, accent) ─────────── */}
            {isPremium && (
              <div className="pt-2 border-t border-surface-800/60">
                <p className="text-surface-400 text-xs uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <span>👑</span>
                  {tPremium("title")}
                </p>
                <PremiumCustomization />
              </div>
            )}

            {/* Boutons */}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-2xl border border-surface-700/40 text-surface-400 hover:text-white hover:border-surface-600 text-sm font-medium transition-all"
              >
                {t("cancel")}
              </button>
              <button
                onClick={handleSave}
                disabled={loading || !isValid}
                className="flex-1 py-3 rounded-2xl bg-gradient-brand text-white text-sm font-bold glow-brand hover:opacity-92 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {loading ? t("saving") : t("save")}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
