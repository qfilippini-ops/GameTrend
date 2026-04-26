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
   * que si l'utilisateur clique sur "Partager sur le feed".
   */
  result: SaveGameResultInput;
  /** Texte personnalisé pour la Web Share API (sinon généré automatiquement) */
  shareText?: string;
  /** URL à partager : par défaut /presets/[id] si fourni, sinon URL courante */
  shareUrl?: string;
}

// Refonte 2026-04 : on sépare deux actions distinctes
//   1. "Partager sur le feed" : push BDD complet (is_shared = true) →
//      apparaît dans les feeds suivis et sur le profil de l'auteur.
//   2. "Partager le lien" : Web Share API / clipboard, pour partager
//      l'URL vers d'autres apps / réseaux. Ne touche PAS au feed.
//
// Les deux boutons sont indépendants. L'un peut être réalisé sans
// l'autre. Le bouton "feed" disparaît (ou devient "déjà publié") une
// fois la publication effectuée.
export default function ShareResultButton({ result, shareText, shareUrl }: ShareResultButtonProps) {
  const t = useTranslations("share");
  const { user } = useAuth();

  // ID de la ligne `game_results` créée en mode minimal (sans result_data).
  // Permet d'updater la même ligne si l'utilisateur publie ensuite, plutôt
  // que d'en créer une nouvelle.
  const [trackedId, setTrackedId] = useState<string | null>(null);
  const [feedStatus, setFeedStatus] = useState<"idle" | "publishing" | "done">("idle");
  const [linkStatus, setLinkStatus] = useState<"idle" | "sharing" | "done">("idle");
  const trackedRef = useRef(false);

  const isLoggedIn = !!user && !user.is_anonymous;

  // Sauvegarde MINIMALE au mount (stats du profil) — silencieuse.
  useEffect(() => {
    if (trackedRef.current || !isLoggedIn || !result.presetId) return;
    trackedRef.current = true;
    trackGameResult({ gameType: result.gameType, presetId: result.presetId }).then((res) => {
      if (res) setTrackedId(res.id);
    });
  }, [isLoggedIn, result.gameType, result.presetId]);

  async function handlePublishOnFeed() {
    if (feedStatus !== "idle" || !isLoggedIn) return;
    setFeedStatus("publishing");
    const res = await shareGameResult(result, trackedId);
    if ("error" in res) {
      console.error("[ShareResultButton] publish", res.error);
      setFeedStatus("idle");
      return;
    }
    setFeedStatus("done");
  }

  async function handleShareLink() {
    if (linkStatus === "sharing") return;
    setLinkStatus("sharing");

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
      setLinkStatus("idle");
      return;
    }
    setLinkStatus("done");
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {/* ── 1. Publier sur le feed (BDD) ─────────────────────────── */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handlePublishOnFeed}
          disabled={!isLoggedIn || feedStatus !== "idle"}
          className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-brand-700/40 hover:bg-brand-600/50 text-white font-semibold border border-brand-600/40 transition-colors text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {feedStatus === "done"
            ? t("publishedOnFeed")
            : feedStatus === "publishing"
              ? t("publishingOnFeed")
              : t("publishOnFeed")}
        </motion.button>

        {/* ── 2. Partager le lien (Web Share API / clipboard) ──────── */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleShareLink}
          disabled={linkStatus === "sharing"}
          className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-surface-800/60 hover:bg-surface-700/60 text-white font-semibold border border-surface-700/40 transition-colors text-sm disabled:opacity-60"
        >
          {linkStatus === "done"
            ? t("shareLinkDone")
            : linkStatus === "sharing"
              ? t("shareLinkSharing")
              : t("shareLink")}
        </motion.button>
      </div>

      {feedStatus === "done" && (
        <p className="text-[11px] text-emerald-500/80 text-center">
          {t("visibilityHint")}
        </p>
      )}
      {!isLoggedIn && (
        <p className="text-[11px] text-surface-600 text-center">
          {t("loginToFeedHint")}
        </p>
      )}
    </div>
  );
}
