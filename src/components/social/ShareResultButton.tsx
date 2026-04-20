"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useAuth } from "@/hooks/useAuth";
import {
  trackGameResult,
  shareGameResult,
  type SaveGameResultInput,
} from "@/app/actions/gameResults";

interface ShareResultButtonProps {
  /**
   * Données complètes du résultat. Le `resultData` n'est envoyé en BDD
   * que si l'utilisateur clique sur "Partager".
   */
  result: SaveGameResultInput;
  /** Texte personnalisé pour la Web Share API (sinon généré automatiquement) */
  shareText?: string;
  /** URL à partager : par défaut /presets/[id] si fourni, sinon URL courante */
  shareUrl?: string;
}

export default function ShareResultButton({ result, shareText, shareUrl }: ShareResultButtonProps) {
  const t = useTranslations("share");
  const { user } = useAuth();
  // ID de la ligne `game_results` créée en mode minimal (sans result_data).
  // Permet d'updater la même ligne si l'utilisateur partage ensuite, plutôt
  // que d'en créer une nouvelle.
  const [trackedId, setTrackedId] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<"idle" | "sharing" | "shared">("idle");
  const trackedRef = useRef(false);

  const isLoggedIn = user && !user.is_anonymous;

  // Sauvegarde MINIMALE au mount (pour les stats du profil) — silencieuse,
  // pas de message à l'utilisateur. Aucun result_data envoyé.
  useEffect(() => {
    if (trackedRef.current || !isLoggedIn || !result.presetId) return;
    trackedRef.current = true;
    trackGameResult({ gameType: result.gameType, presetId: result.presetId }).then((res) => {
      if (res) setTrackedId(res.id);
    });
  }, [isLoggedIn, result.gameType, result.presetId]);

  async function handleShare() {
    if (shareStatus === "sharing") return;
    setShareStatus("sharing");

    const url = shareUrl ?? (typeof window !== "undefined" ? window.location.origin : "");
    const text = shareText ?? t("defaultText");

    let didShare = false;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "GameTrend", text, url });
        didShare = true;
      } catch {
        /* annulé par l'utilisateur */
      }
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        didShare = true;
      } catch {
        /* ignore */
      }
    }

    if (!didShare) {
      setShareStatus("idle");
      return;
    }

    // Partage effectif → on enrichit la ligne en BDD avec result_data
    // complet et on passe is_shared = true (visible dans le feed).
    if (isLoggedIn) {
      await shareGameResult(result, trackedId);
    }
    setShareStatus("shared");
  }

  return (
    <div className="space-y-2">
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={handleShare}
        disabled={shareStatus === "sharing"}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-surface-800/60 hover:bg-surface-700/60 text-white font-semibold border border-surface-700/40 transition-colors text-sm disabled:opacity-60"
      >
        {shareStatus === "shared" ? (
          <>{t("shared")}</>
        ) : shareStatus === "sharing" ? (
          <>{t("sharing")}</>
        ) : (
          <>{t("shareResult")}</>
        )}
      </motion.button>

      {shareStatus === "shared" && isLoggedIn && (
        <p className="text-[11px] text-emerald-500/80 text-center">
          {t("visibilityHint")}
        </p>
      )}
      {!isLoggedIn && (
        <p className="text-[11px] text-surface-600 text-center">
          {t("loginHint")}
        </p>
      )}
    </div>
  );
}
