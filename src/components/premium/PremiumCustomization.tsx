"use client";

import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/compressImage";
import { useAuth } from "@/hooks/useAuth";

/**
 * Customisation Premium du profil :
 *   - Lien web (validation côté RPC : URL valide + blocklist domaine)
 *   - Bannière upload (Supabase Storage bucket profile-banners)
 *   - Couleur d'accent (hex picker)
 *
 * Affichée uniquement aux comptes Premium dans la section "Mon abonnement".
 */
export default function PremiumCustomization() {
  const t = useTranslations("premium.customization");
  const { user, profile, refreshProfile } = useAuth();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [linkUrl, setLinkUrl] = useState(profile?.profile_link_url ?? "");
  const [accentColor, setAccentColor] = useState(profile?.profile_accent_color ?? "#a78bfa");
  const [bannerUrl, setBannerUrl] = useState<string | null>(profile?.profile_banner_url ?? null);

  const [linkSaving, setLinkSaving] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSuccess, setLinkSuccess] = useState(false);

  const [brandingSaving, setBrandingSaving] = useState(false);
  const [brandingError, setBrandingError] = useState<string | null>(null);
  const [brandingSuccess, setBrandingSuccess] = useState(false);

  const [bannerUploading, setBannerUploading] = useState(false);

  async function saveLink() {
    setLinkSaving(true);
    setLinkError(null);
    setLinkSuccess(false);
    const { error } = await supabase.rpc("update_profile_link", { new_url: linkUrl });
    if (error) {
      const msg = error.message;
      if (msg.includes("not_premium")) setLinkError(t("errors.notPremium"));
      else if (msg.includes("invalid_url")) setLinkError(t("errors.invalidUrl"));
      else if (msg.includes("blocked_domain")) setLinkError(t("errors.blockedDomain"));
      else setLinkError(t("errors.generic"));
    } else {
      setLinkSuccess(true);
      await refreshProfile();
      setTimeout(() => setLinkSuccess(false), 2500);
    }
    setLinkSaving(false);
  }

  async function handleBannerFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setBannerUploading(true);
    setBrandingError(null);

    try {
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
        setBrandingError(t("errors.upload"));
        setBannerUploading(false);
        return;
      }

      const { data: urlData } = supabase.storage.from("profile-banners").getPublicUrl(path);
      const finalUrl = `${urlData.publicUrl}?v=${Date.now()}`;
      setBannerUrl(finalUrl);
    } catch {
      setBrandingError(t("errors.upload"));
    } finally {
      setBannerUploading(false);
    }
  }

  async function saveBranding() {
    setBrandingSaving(true);
    setBrandingError(null);
    setBrandingSuccess(false);
    const { error } = await supabase.rpc("update_profile_branding", {
      new_banner_url: bannerUrl,
      new_accent_color: accentColor,
    });
    if (error) {
      const msg = error.message;
      if (msg.includes("not_premium")) setBrandingError(t("errors.notPremium"));
      else if (msg.includes("invalid_color")) setBrandingError(t("errors.invalidColor"));
      else setBrandingError(t("errors.generic"));
    } else {
      setBrandingSuccess(true);
      await refreshProfile();
      setTimeout(() => setBrandingSuccess(false), 2500);
    }
    setBrandingSaving(false);
  }

  async function clearBanner() {
    setBannerUrl(null);
  }

  return (
    <div className="space-y-4">
      <h3 className="text-surface-500 text-xs uppercase tracking-widest font-medium">
        {t("title")}
      </h3>

      {/* Lien profil */}
      <div className="rounded-xl bg-surface-800/40 border border-surface-700/40 p-3 space-y-2">
        <label className="block text-surface-300 text-sm font-medium">{t("linkLabel")}</label>
        <p className="text-surface-500 text-xs">{t("linkHint")}</p>
        <div className="flex gap-2">
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://twitch.tv/ton-pseudo"
            className="flex-1 bg-surface-900 border border-surface-700 focus:border-brand-500 text-white text-sm rounded-lg px-3 py-2 outline-none"
            maxLength={200}
          />
          <button
            onClick={saveLink}
            disabled={linkSaving}
            className="px-3 py-2 rounded-lg bg-gradient-brand text-white text-sm font-medium disabled:opacity-50"
          >
            {linkSaving ? "…" : t("save")}
          </button>
        </div>
        {linkError && <p className="text-red-400 text-xs">{linkError}</p>}
        {linkSuccess && <p className="text-brand-300 text-xs">{t("saved")}</p>}
      </div>

      {/* Bannière */}
      <div className="rounded-xl bg-surface-800/40 border border-surface-700/40 p-3 space-y-3">
        <label className="block text-surface-300 text-sm font-medium">{t("bannerLabel")}</label>
        <p className="text-surface-500 text-xs">{t("bannerHint")}</p>

        <div className="aspect-[3/1] rounded-lg overflow-hidden border border-surface-700/40 bg-surface-900 relative">
          {bannerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bannerUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-surface-700 text-xs">
              {t("bannerEmpty")}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={bannerUploading}
            className="flex-1 py-2 rounded-lg bg-surface-900 border border-surface-700 text-surface-200 text-sm hover:border-brand-500/50 transition-colors disabled:opacity-50"
          >
            {bannerUploading ? t("uploading") : bannerUrl ? t("replaceBanner") : t("uploadBanner")}
          </button>
          {bannerUrl && (
            <button
              onClick={clearBanner}
              className="px-3 py-2 rounded-lg border border-surface-700 text-surface-400 hover:text-red-400 hover:border-red-500/50 text-sm transition-colors"
            >
              ✕
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleBannerFile}
          className="sr-only"
        />
      </div>

      {/* Couleur d'accent */}
      <div className="rounded-xl bg-surface-800/40 border border-surface-700/40 p-3 space-y-3">
        <label className="block text-surface-300 text-sm font-medium">{t("accentLabel")}</label>
        <p className="text-surface-500 text-xs">{t("accentHint")}</p>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={accentColor}
            onChange={(e) => setAccentColor(e.target.value)}
            className="w-12 h-12 rounded-lg cursor-pointer bg-transparent border border-surface-700"
          />
          <input
            type="text"
            value={accentColor}
            onChange={(e) => setAccentColor(e.target.value)}
            className="flex-1 bg-surface-900 border border-surface-700 focus:border-brand-500 text-white font-mono text-sm rounded-lg px-3 py-2 outline-none"
            placeholder="#a78bfa"
            maxLength={9}
          />
        </div>
      </div>

      <button
        onClick={saveBranding}
        disabled={brandingSaving}
        className="w-full py-2.5 rounded-xl bg-gradient-brand text-white text-sm font-bold glow-brand disabled:opacity-50"
      >
        {brandingSaving ? "…" : t("saveBranding")}
      </button>

      {brandingError && (
        <p className="text-red-400 text-xs text-center">{brandingError}</p>
      )}
      {brandingSuccess && (
        <p className="text-brand-300 text-xs text-center">{t("saved")}</p>
      )}
    </div>
  );
}
