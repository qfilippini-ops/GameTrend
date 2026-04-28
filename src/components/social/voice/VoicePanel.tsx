"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useGroupVoice } from "@/hooks/useGroupVoice";
import VoiceParticipantRow from "./VoiceParticipantRow";

interface VoicePanelProps {
  groupId: string;
  selfIsHost: boolean;
  onProfileClick?: () => void;
}

/**
 * Bandeau vocal affiché en haut de l'onglet "Membres" du GroupPanel.
 *
 * Trois états :
 *   - idle    → bouton « Rejoindre le vocal »
 *   - connecting → spinner « Connexion… »
 *   - connected  → barre de contrôle (micro on/off, quitter) + liste des
 *                  participants vocaux avec ring "qui parle"
 *
 * Si le serveur LiveKit n'est pas configuré (renvoie 503), on affiche un
 * message d'erreur explicite et on désactive le bouton.
 */
export default function VoicePanel({
  groupId,
  selfIsHost,
  onProfileClick,
}: VoicePanelProps) {
  const t = useTranslations("groups.voice");
  const voice = useGroupVoice(groupId);
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);

  async function handleJoin() {
    await voice.join();
  }

  async function handleLeave() {
    await voice.leave();
  }

  async function handleToggleMic() {
    await voice.toggleMic();
  }

  async function handleHostMute(targetUserId: string, currentlyMuted: boolean) {
    setPendingTarget(targetUserId);
    try {
      await voice.muteMember(targetUserId, currentlyMuted);
    } catch (err) {
      console.error("[VoicePanel] mute failed", err);
    }
    setPendingTarget(null);
  }

  if (voice.status === "idle") {
    return (
      <div className="px-3 py-3 border-b border-surface-800/40">
        <button
          onClick={handleJoin}
          className="w-full px-3 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-brand-600 hover:from-emerald-500 hover:to-brand-500 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2"
        >
          <span className="text-base">🎧</span>
          <span>{t("joinVoice")}</span>
        </button>
        {voice.error && (
          <p className="mt-2 text-[11px] text-red-400/80 text-center">
            {voice.error === "livekit_not_configured"
              ? t("errorNotConfigured")
              : t("errorTokenFailed")}
          </p>
        )}
      </div>
    );
  }

  if (voice.status === "connecting") {
    return (
      <div className="px-3 py-3 border-b border-surface-800/40">
        <div className="w-full px-3 py-2.5 rounded-xl bg-surface-800/60 text-surface-400 text-sm flex items-center justify-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full border-2 border-surface-600 border-t-brand-500 animate-spin" />
          <span>{t("connecting")}</span>
        </div>
      </div>
    );
  }

  if (voice.status === "error") {
    return (
      <div className="px-3 py-3 border-b border-surface-800/40">
        <button
          onClick={handleJoin}
          className="w-full px-3 py-2.5 rounded-xl bg-surface-800/80 hover:bg-surface-700/60 border border-red-500/40 text-red-300 text-sm font-medium transition-colors"
        >
          {t("retry")}
        </button>
        <p className="mt-2 text-[11px] text-red-400/80 text-center">
          {voice.error === "livekit_not_configured"
            ? t("errorNotConfigured")
            : t("errorTokenFailed")}
        </p>
      </div>
    );
  }

  // status === "connected"
  return (
    <div className="border-b border-surface-800/40">
      <div className="flex items-center gap-2 px-3 py-2 bg-surface-800/40">
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <div className="flex-1 text-[12px] text-surface-300">
          <p className="font-medium text-white">
            {t("connected")}
            <span className="ml-2 text-surface-400 font-normal">
              {t("participantsCount", { count: voice.participants.length })}
            </span>
          </p>
        </div>
        <button
          onClick={handleLeave}
          className="text-[11px] px-2 py-1 rounded-lg text-surface-400 hover:text-red-400 hover:bg-red-950/30 transition-colors"
        >
          {t("leaveVoice")}
        </button>
      </div>

      <p className="px-3 pt-2 pb-1 text-[11px] text-surface-500">
        {t("hintTapMicToTalk")}
      </p>

      <div className="bg-surface-900/40">
        {voice.participants.map((p) => (
          <VoiceParticipantRow
            key={p.identity}
            participant={p}
            selfIsHost={selfIsHost}
            onMute={handleHostMute}
            onToggleSelfMic={handleToggleMic}
            onProfileClick={onProfileClick}
            pending={pendingTarget === p.identity}
          />
        ))}
      </div>
    </div>
  );
}
