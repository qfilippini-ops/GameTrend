"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { compressImage, ModerationError } from "@/lib/compressImage";
import Avatar from "@/components/ui/Avatar";
import type { Profile } from "@/types/database";

interface EditProfileModalProps {
  profile: Profile;
  userId: string;
  onClose: () => void;
  onSaved: (updated: Partial<Profile>) => void;
}

const USERNAME_MIN = 2;
const USERNAME_MAX = 30;
const BIO_MAX = 200;

export default function EditProfileModal({
  profile,
  userId,
  onClose,
  onSaved,
}: EditProfileModalProps) {
  const [username, setUsername] = useState(profile.username ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.avatar_url ?? null);
  const [loading, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const usernameError =
    username.trim().length > 0 && username.trim().length < USERNAME_MIN
      ? `Minimum ${USERNAME_MIN} caractères`
      : username.length > USERNAME_MAX
        ? `Maximum ${USERNAME_MAX} caractères`
        : null;

  const isValid =
    username.trim().length >= USERNAME_MIN &&
    username.length <= USERNAME_MAX &&
    bio.length <= BIO_MAX &&
    !usernameError;

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
        setError(`Erreur upload avatar : ${uploadErr.message}`);
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
      if (updateErr.message.includes("username")) {
        setError("Ce pseudo est déjà pris, choisis-en un autre.");
      } else {
        setError("Erreur lors de la sauvegarde.");
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
          className="w-full max-w-sm rounded-3xl border border-surface-700/40 bg-surface-900 shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-surface-800/60">
            <h2 className="text-white font-display font-bold text-lg">Modifier le profil</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-xl text-surface-500 hover:text-white hover:bg-surface-800 transition-all text-lg"
            >
              ✕
            </button>
          </div>

          <div className="px-5 py-5 space-y-5">
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
                  title="Changer l'avatar"
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
              <p className="text-surface-600 text-xs">Clique sur l&apos;avatar pour le changer</p>
            </div>

            {/* Pseudo */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-surface-300">Pseudo *</label>
                <span className={`text-xs ${username.length > USERNAME_MAX ? "text-red-400" : "text-surface-600"}`}>
                  {username.length}/{USERNAME_MAX}
                </span>
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ton pseudo"
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
                <label className="text-sm font-medium text-surface-300">Bio</label>
                <span className={`text-xs ${bio.length > BIO_MAX ? "text-red-400" : "text-surface-600"}`}>
                  {bio.length}/{BIO_MAX}
                </span>
              </div>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
                placeholder="Dis quelque chose sur toi…"
                rows={3}
                className="w-full bg-surface-800 border border-surface-700 focus:border-brand-500 text-white placeholder-surface-600 rounded-xl px-4 py-3 text-sm outline-none transition-colors resize-none"
              />
            </div>

            {error && (
              <p className="text-red-400 text-xs text-center bg-red-950/30 border border-red-800/30 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            {/* Boutons */}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-2xl border border-surface-700/40 text-surface-400 hover:text-white hover:border-surface-600 text-sm font-medium transition-all"
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={loading || !isValid}
                className="flex-1 py-3 rounded-2xl bg-gradient-brand text-white text-sm font-bold glow-brand hover:opacity-92 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {loading ? "Sauvegarde…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
