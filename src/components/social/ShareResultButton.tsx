"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { saveGameResult, markResultShared, type SaveGameResultInput } from "@/app/actions/gameResults";

interface ShareResultButtonProps {
  /** Données passées à saveGameResult — sauvegardées une seule fois au mount */
  result: SaveGameResultInput;
  /** Texte personnalisé pour la Web Share API (sinon généré automatiquement) */
  shareText?: string;
  /** URL à partager : par défaut /presets/[id] si fourni, sinon URL courante */
  shareUrl?: string;
}

export default function ShareResultButton({ result, shareText, shareUrl }: ShareResultButtonProps) {
  const { user } = useAuth();
  const [resultId, setResultId] = useState<string | null>(null);
  const [savedStatus, setSavedStatus] = useState<"idle" | "saving" | "saved" | "anon">("idle");
  const [shared, setShared] = useState(false);
  const savedRef = useRef(false);

  const isLoggedIn = user && !user.is_anonymous;

  // Sauvegarde auto une seule fois quand l'utilisateur est connecté
  useEffect(() => {
    if (savedRef.current || !isLoggedIn) {
      if (!isLoggedIn) setSavedStatus("anon");
      return;
    }
    savedRef.current = true;
    setSavedStatus("saving");
    saveGameResult(result).then((res) => {
      if ("error" in res) {
        setSavedStatus("idle");
      } else {
        setResultId(res.id);
        setSavedStatus("saved");
      }
    });
  }, [isLoggedIn, result]);

  async function handleShare() {
    const url = shareUrl ?? (typeof window !== "undefined" ? window.location.origin : "");
    const text = shareText ?? "Viens jouer avec moi sur GameTrend !";

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "GameTrend", text, url });
        setShared(true);
        if (resultId) markResultShared(resultId);
      } catch {
        /* annulé par l'utilisateur */
      }
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        setShared(true);
      } catch {
        /* ignore */
      }
    }
  }

  return (
    <div className="space-y-2">
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={handleShare}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-surface-800/60 hover:bg-surface-700/60 text-white font-semibold border border-surface-700/40 transition-colors text-sm"
      >
        {shared ? (
          <>✓ Partagé !</>
        ) : (
          <>📤 Partager le résultat</>
        )}
      </motion.button>

      {savedStatus === "saved" && (
        <p className="text-[11px] text-emerald-500/80 text-center">
          ✓ Résultat enregistré sur ton profil
        </p>
      )}
      {savedStatus === "anon" && (
        <p className="text-[11px] text-surface-600 text-center">
          Connecte-toi pour sauvegarder tes résultats
        </p>
      )}
    </div>
  );
}
