"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { vibrate } from "@/lib/utils";

interface ShareButtonProps {
  url: string;
  name: string;
  fullWidth?: boolean;
  /** Affiche seulement l'icône (sans texte) — utile dans le header sur mobile */
  iconOnly?: boolean;
}

export default function ShareButton({ url, name, fullWidth = false, iconOnly = false }: ShareButtonProps) {
  const t = useTranslations("presets.detail");
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    vibrate(50);

    if (navigator.share) {
      try {
        await navigator.share({
          title: `GameTrend — ${name}`,
          text: t("shareInviteText", { name }),
          url,
        });
        return;
      } catch {
        // fallback clipboard
      }
    }

    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (iconOnly) {
    return (
      <button
        onClick={handleShare}
        title={t("shareTitle")}
        className="w-9 h-9 flex items-center justify-center rounded-xl bg-surface-800/80 border border-surface-700/50 text-surface-300 hover:text-white hover:border-brand-500/50 transition-all text-sm"
      >
        {copied ? "✅" : "🔗"}
      </button>
    );
  }

  return (
    <button
      onClick={handleShare}
      className={`${
        fullWidth ? "w-full" : ""
      } flex items-center justify-center gap-2 bg-surface-800 hover:bg-surface-700 text-white font-semibold py-3 px-4 rounded-2xl border border-surface-600 transition-colors text-sm`}
    >
      {copied ? t("shareCopied") : t("shareThis")}
    </button>
  );
}
