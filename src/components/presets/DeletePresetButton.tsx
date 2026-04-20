"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { extractStoragePath } from "@/lib/storageUtils";
import type { GhostWordConfig } from "@/types/games";

interface DeletePresetButtonProps {
  presetId: string;
  /** Redirection après suppression. Ignoré si onDeleted est fourni. */
  redirectTo?: string;
  /** Callback appelé après suppression (pas de redirect si fourni). */
  onDeleted?: () => void;
  variant?: "icon" | "full";
  className?: string;
}

export default function DeletePresetButton({
  presetId,
  redirectTo = "/profile",
  onDeleted,
  variant = "full",
  className = "",
}: DeletePresetButtonProps) {
  const router = useRouter();
  const t = useTranslations("presets.detail");
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    const supabase = createClient();

    // ── 1. Récupérer les URLs d'images avant suppression ──────
    const { data: preset } = await supabase
      .from("presets")
      .select("cover_url, config")
      .eq("id", presetId)
      .maybeSingle();

    const pathsToDelete: string[] = [];

    if (preset) {
      // Cover image
      if (preset.cover_url) {
        const p = extractStoragePath(preset.cover_url);
        if (p) pathsToDelete.push(p);
      }

      // Images des mots dans les familles
      const config = preset.config as GhostWordConfig | null;
      if (config?.families) {
        for (const family of config.families) {
          for (const word of family.words) {
            if (word.imageUrl) {
              const p = extractStoragePath(word.imageUrl);
              if (p) pathsToDelete.push(p);
            }
          }
        }
      }
    }

    // ── 2. Supprimer les fichiers Storage ─────────────────────
    if (pathsToDelete.length > 0) {
      const { error: storageErr } = await supabase.storage
        .from("covers")
        .remove(pathsToDelete);
      if (storageErr) {
        console.warn("[DeletePreset] Storage cleanup partiel :", storageErr.message);
      }
    }

    // ── 3. Supprimer la ligne preset (cascade sur preset_likes) ─
    const { error } = await supabase
      .from("presets")
      .delete()
      .eq("id", presetId);

    if (!error) {
      if (onDeleted) {
        onDeleted();
      } else {
        router.push(redirectTo);
        router.refresh();
      }
    } else {
      setLoading(false);
      setConfirming(false);
    }
  }

  if (variant === "icon") {
    return confirming ? (
      <div className={`flex items-center gap-1 ${className}`}>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="text-xs bg-red-600 hover:bg-red-500 text-white px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
        >
          {loading ? "..." : t("delete")}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-xs text-surface-400 hover:text-white px-2 py-1 rounded-lg transition-colors"
        >
          {t("cancel")}
        </button>
      </div>
    ) : (
      <button
        onClick={() => setConfirming(true)}
        className={`text-red-500 hover:text-red-400 hover:bg-red-950/30 transition-colors ${className}`}
      >
        🗑
      </button>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {confirming ? (
        <div className="rounded-2xl bg-red-950/30 border border-red-700/50 p-4 space-y-3">
          <p className="text-red-300 text-sm font-medium text-center">
            {t("deleteConfirmFull")}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setConfirming(false)}
              className="flex-1 py-2.5 rounded-xl bg-surface-700 hover:bg-surface-600 text-white text-sm font-semibold transition-colors"
            >
              {t("cancel")}
            </button>
            <button
              onClick={handleDelete}
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-bold transition-colors disabled:opacity-50"
            >
              {loading ? t("deleting") : t("confirmDelete")}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="w-full text-center text-red-500 hover:text-red-400 hover:bg-red-950/20 border border-red-900/40 hover:border-red-700/50 font-semibold py-3 rounded-2xl transition-colors text-sm"
        >
          {t("deleteCta")}
        </button>
      )}
    </div>
  );
}
