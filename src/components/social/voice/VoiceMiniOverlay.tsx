"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import Avatar from "@/components/ui/Avatar";
import { useAuth } from "@/hooks/useAuth";
import { useGroup } from "@/hooks/useGroup";
import { useGroupVoice } from "@/hooks/useGroupVoice";

/**
 * Mini-overlay vocal flottant, monté globalement (cf. layout) pour rester
 * visible partout — y compris dans les scènes de jeu. N'apparaît que quand
 * l'utilisateur est *connecté* au vocal (status === "connected").
 *
 * Affiche :
 *   - une pile horizontale d'avatars de tous les participants vocaux
 *     (rings verts animés sur ceux qui parlent)
 *   - un bouton micro toggle rapide
 *
 * Design : ancré bottom-left pour ne JAMAIS chevaucher le bouton "Options"
 * en jeu (qui est ancré top-right) ni le GroupPanel ouvert (qui est centré).
 */
export default function VoiceMiniOverlay() {
  const tNav = useTranslations("groups.voice");
  const { user } = useAuth();
  const isConnected = !!(user && !user.is_anonymous);
  const { group } = useGroup();
  const voice = useGroupVoice(group?.id ?? null);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !isConnected) return null;
  if (voice.status !== "connected") return null;

  const speakingCount = voice.participants.filter((p) => p.isSpeaking).length;

  async function handleToggleMic() {
    await voice.toggleMic();
  }

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="voice-mini-overlay"
        initial={{ opacity: 0, y: 10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className="fixed bottom-20 left-3 z-30 pb-safe"
      >
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-2xl bg-surface-900/90 backdrop-blur border border-surface-700/60 shadow-xl shadow-black/40">
          <button
            onClick={handleToggleMic}
            disabled={voice.mutedByHost}
            className={`w-8 h-8 flex items-center justify-center rounded-xl text-sm transition-colors ${
              voice.mutedByHost
                ? "bg-red-950/60 border border-red-500/40 text-red-300 cursor-not-allowed"
                : voice.isMicEnabled
                  ? "bg-emerald-600/80 border border-emerald-400/60 text-white hover:bg-emerald-500"
                  : "bg-surface-800 border border-surface-700/40 text-surface-300 hover:text-white"
            }`}
            aria-label={
              voice.mutedByHost
                ? tNav("mutedByHost")
                : voice.isMicEnabled
                  ? tNav("micOff")
                  : tNav("micOn")
            }
            title={
              voice.mutedByHost
                ? tNav("mutedByHost")
                : voice.isMicEnabled
                  ? tNav("micOff")
                  : tNav("micOn")
            }
          >
            {voice.mutedByHost ? "🔇" : voice.isMicEnabled ? "🎤" : "🎙️"}
          </button>

          <div className="flex -space-x-1.5 items-center">
            {voice.participants.slice(0, 5).map((p) => {
              const ringIntensity = p.isSpeaking
                ? Math.min(p.audioLevel * 2, 1)
                : 0;
              const ringOpacity = 0.4 + ringIntensity * 0.6;
              return (
                <div
                  key={p.identity}
                  className="rounded-full"
                  style={
                    p.isSpeaking
                      ? {
                          boxShadow: `0 0 0 2px rgba(34,197,94,${ringOpacity}), 0 0 10px rgba(34,197,94,${ringOpacity * 0.6})`,
                        }
                      : undefined
                  }
                  title={p.name}
                >
                  <Avatar
                    src={p.avatarUrl}
                    name={p.name}
                    size="xs"
                    className="ring-1 ring-surface-900"
                  />
                </div>
              );
            })}
            {voice.participants.length > 5 && (
              <span className="ml-2 text-[10px] text-surface-400">
                +{voice.participants.length - 5}
              </span>
            )}
          </div>

          {speakingCount > 0 && (
            <span
              className="ml-1 w-2 h-2 rounded-full bg-emerald-400 animate-pulse"
              aria-hidden
            />
          )}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
