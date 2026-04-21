"use client";

import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { compressImage, ModerationError } from "@/lib/compressImage";
import { useAuth } from "@/hooks/useAuth";

/**
 * Customisation Premium du profil :
 *   - Bannière (zone image cliquable type avatar — passe par compressImage()
 *     donc compression WebP + filtre NSFW identiques aux autres uploads)
 *   - Lien web (validation côté RPC : URL valide + blocklist domaine)
 *   - Couleur d'accent (color picker compact)
 *
 * Layout compact destiné à être embedded dans le modal Edit Profile.
 * Affichée uniquement aux comptes Premium.
 */
export default function PremiumCustomization() {
  const t = useTranslations("premium.customization");
  const { user, profile, refreshProfile } = useAuth();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [linkUrl, setLinkUrl] = useState(profile?.profile_link_url ?? "");
  const [accentColor, setAccentColor] = useState(profile?.profile_accent_color ?? "#a78bfa");
  const [bannerUrl, setBannerUrl] = useState<string | null>(profile?.profile_banner_url ?? null);

  const [bannerUploading, setBannerUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const linkChanged = (linkUrl ?? "") !== (profile?.profile_link_url ?? "");
  const accentChanged = (accentColor ?? "") !== (profile?.profile_accent_color ?? "#a78bfa");
  const bannerChanged = (bannerUrl ?? "") !== (profile?.profile_banner_url ?? "");
  const dirty = linkChanged || accentChanged || bannerChanged;

  async function handleBannerFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setBannerUploading(true);
    setError(null);
    setSuccess(false);

    try {
      // compressImage applique compression WebP + modération NSFW (cf. compressImage.ts).
      const optimized = await compressImage(file, {
        maxWidthOrHeight: 1200,
        maxSizeMB: 0.5,
        quality: 0.82,
      });

      const path = `${user.id}/banner.webp`;
      const { error: uploadErr } = await supabase.storage
        .from("profile-banners")
        .upload(path, optimized, { upsert: true, contentType: "image/webp" });

      if (uploadErr) {
        setError(t("errors.upload"));
        return;
      }

      const { data: urlData } = supabase.storage.from("profile-banners").getPublicUrl(path);
      setBannerUrl(`${urlData.publicUrl}?v=${Date.now()}`);
    } catch (err) {
      if (err instanceof ModerationError) {
        setError(err.message);
      } else {
        setError(t("errors.upload"));
      }
    } finally {
      setBannerUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function clearBanner() {
    setBannerUrl(null);
    setError(null);
  }

  async function saveAll() {
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      if (linkChanged) {
        const { error: linkErr } = await supabase.rpc("update_profile_link", { new_url: linkUrl });
        if (linkErr) {
          const msg = linkErr.message;
          if (msg.includes("not_premium")) setError(t("errors.notPremium"));
          else if (msg.includes("invalid_url")) setError(t("errors.invalidUrl"));
          else if (msg.includes("blocked_domain")) setError(t("errors.blockedDomain"));
          else setError(t("errors.generic"));
          return;
        }
      }

      if (bannerChanged || accentChanged) {
        const { error: brandErr } = await supabase.rpc("update_profile_branding", {
          new_banner_url: bannerUrl,
          new_accent_color: accentColor,
        });
        if (brandErr) {
          const msg = brandErr.message;
          if (msg.includes("not_premium")) setError(t("errors.notPremium"));
          else if (msg.includes("invalid_color")) setError(t("errors.invalidColor"));
          else setError(t("errors.generic"));
          return;
        }
      }

      await refreshProfile();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2200);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Bannière — zone cliquable identique au pattern avatar */}
      <div className="space-y-1.5">
        <label className="text-surface-400 text-[11px] font-medium block">{t("bannerLabel")}</label>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={bannerUploading}
          className="relative w-full aspect-[3/1] rounded-xl overflow-hidden border border-surface-700/40 bg-surface-800/40 group disabled:opacity-60 disabled:cursor-wait"
          aria-label={bannerUrl ? t("replaceBanner") : t("uploadBanner")}
        >
          {bannerUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={bannerUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-surface-950/0 group-hover:bg-surface-950/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                <span className="text-white text-xs font-medium px-2 py-1 rounded-md bg-surface-900/80">
                  ✏️ {t("replaceBanner")}
                </span>
              </div>
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-surface-500 group-hover:text-brand-300 transition-colors">
              <span className="text-2xl">🖼️</span>
              <span className="text-[11px] font-medium">{t("uploadBanner")}</span>
            </div>
          )}
          {bannerUploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-surface-950/60 text-white text-xs">
              {t("uploading")}…
            </div>
          )}
        </button>
        {bannerUrl && !bannerUploading && (
          <button
            type="button"
            onClick={clearBanner}
            className="text-surface-500 hover:text-red-400 text-[11px] underline underline-offset-2 transition-colors"
          >
            {t("removeBanner")}
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleBannerFile}
          className="sr-only"
        />
      </div>

      {/* Lien profil — compact */}
      <div className="space-y-1.5">
        <label className="text-surface-400 text-[11px] font-medium block">{t("linkLabel")}</label>
        <input
          type="url"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          placeholder="https://twitch.tv/ton-pseudo"
          maxLength={200}
          className="w-full bg-surface-800 border border-surface-700 focus:border-brand-500 text-white placeholder-surface-600 text-sm rounded-xl px-3 py-2.5 outline-none transition-colors"
        />
        <p className="text-surface-600 text-[10px] leading-snug">{t("linkHint")}</p>
      </div>

      {/* Couleur d'accent — picker + hex inline */}
      <div className="space-y-1.5">
        <label className="text-surface-400 text-[11px] font-medium block">{t("accentLabel")}</label>
        <div className="flex items-center gap-2 bg-surface-800 border border-surface-700 rounded-xl px-2 py-1.5">
          <input
            type="color"
            value={accentColor}
            onChange={(e) => setAccentColor(e.target.value)}
            className="w-8 h-8 rounded-md cursor-pointer bg-transparent border-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-0"
          />
          <input
            type="text"
            value={accentColor}
            onChange={(e) => setAccentColor(e.target.value)}
            placeholder="#a78bfa"
            maxLength={9}
            className="flex-1 bg-transparent text-surface-200 font-mono text-xs outline-none"
          />
        </div>
      </div>

      {/* Save unifié — discret */}
      {dirty && (
        <button
          type="button"
          onClick={saveAll}
          disabled={saving}
          className="w-full py-2 rounded-xl bg-brand-600/20 hover:bg-brand-600/30 border border-brand-500/40 text-brand-200 text-xs font-semibold transition-colors disabled:opacity-50"
        >
          {saving ? `${t("saving")}…` : t("saveBranding")}
        </button>
      )}

      {error && (
        <p className="text-red-400 text-[11px] text-center bg-red-950/30 border border-red-800/30 rounded-lg px-2 py-1.5">
          {error}
        </p>
      )}
      {success && (
        <p className="text-brand-300 text-[11px] text-center">{t("saved")}</p>
      )}
    </div>
  );
}
