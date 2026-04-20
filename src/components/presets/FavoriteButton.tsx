"use client";

import { useTranslations } from "next-intl";
import { useFavorites } from "@/hooks/useFavorites";

interface FavoriteButtonProps {
  presetId: string;
  userId?: string | null;
  /** "icon" = petit bouton carré, "full" = bouton pleine largeur avec texte */
  variant?: "icon" | "full";
  className?: string;
}

export default function FavoriteButton({
  presetId,
  userId,
  variant = "icon",
  className = "",
}: FavoriteButtonProps) {
  const t = useTranslations("presets.detail");
  const { isFavorited, toggle, loading } = useFavorites(presetId, userId);

  if (!userId) return null;

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    toggle();
  }

  if (variant === "full") {
    return (
      <button
        onClick={handleClick}
        disabled={loading}
        className={`flex items-center justify-center gap-2 w-full bg-surface-800 hover:bg-surface-700 border transition-colors font-semibold py-3 rounded-2xl text-sm disabled:opacity-50 ${
          isFavorited
            ? "border-amber-500/60 text-amber-400"
            : "border-surface-600 text-surface-300 hover:text-white"
        } ${className}`}
      >
        <span>{isFavorited ? "★" : "☆"}</span>
        <span>{isFavorited ? t("unfavorite") : t("favorite")}</span>
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all disabled:opacity-50 ${
        isFavorited
          ? "bg-amber-500/90 text-white"
          : "bg-surface-900/70 text-surface-400 hover:text-amber-400"
      } ${className}`}
    >
      {isFavorited ? "★" : "☆"}
    </button>
  );
}
