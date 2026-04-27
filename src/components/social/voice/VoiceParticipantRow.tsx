"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import Avatar from "@/components/ui/Avatar";
import type { VoiceParticipantMeta } from "@/hooks/useGroupVoice";

interface VoiceParticipantRowProps {
  participant: VoiceParticipantMeta;
  selfIsHost: boolean;
  onMute?: (targetUserId: string, canPublish: boolean) => void;
  onProfileClick?: () => void;
  pending?: boolean;
}

/**
 * Ligne de participant vocal. Affiche l'avatar avec un anneau lumineux
 * proportionnel à `audioLevel` quand il parle, son micro/mute, et — pour
 * l'host uniquement et sur les autres membres — un bouton mute/unmute.
 */
export default function VoiceParticipantRow({
  participant: p,
  selfIsHost,
  onMute,
  onProfileClick,
  pending = false,
}: VoiceParticipantRowProps) {
  const t = useTranslations("groups.voice");

  // Anneau "qui parle" : épaisseur proportionnelle à audioLevel (0 → 1).
  // On caps autour de 0.6 pour éviter qu'il devienne trop épais.
  const ringIntensity = p.isSpeaking ? Math.min(p.audioLevel * 2, 1) : 0;
  const ringOpacity = 0.4 + ringIntensity * 0.6;
  const ringStyle = p.isSpeaking
    ? {
        boxShadow: `0 0 0 2px rgba(34,197,94,${ringOpacity}), 0 0 14px rgba(34,197,94,${ringOpacity * 0.7})`,
      }
    : undefined;

  const micIcon = p.mutedByHost
    ? "🔇"
    : p.isMicEnabled
      ? "🎤"
      : "🎙️";
  const micColor = p.mutedByHost
    ? "text-red-400"
    : p.isMicEnabled
      ? "text-emerald-400"
      : "text-surface-500";

  const showMuteButton = selfIsHost && !p.isLocal;

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <Link
        href={`/profile/${p.identity}`}
        onClick={onProfileClick}
        className="shrink-0 transition-transform hover:scale-105"
        style={ringStyle}
      >
        <Avatar
          src={p.avatarUrl}
          name={p.name}
          size="sm"
          className="rounded-xl"
        />
      </Link>
      <div className="flex-1 min-w-0">
        <Link
          href={`/profile/${p.identity}`}
          onClick={onProfileClick}
          className="block hover:underline"
        >
          <p className="text-white text-[13px] font-medium truncate">
            {p.name}
            {p.isHost && (
              <span className="ml-1.5 text-[10px] text-amber-300 font-bold">
                {t("hostBadge")}
              </span>
            )}
            {p.isLocal && (
              <span className="ml-1.5 text-[10px] text-surface-400">
                {t("selfBadge")}
              </span>
            )}
          </p>
        </Link>
        {p.mutedByHost && (
          <p className="text-[10px] text-red-400/80 truncate">
            {t("mutedByHost")}
          </p>
        )}
      </div>

      <span
        className={`text-base ${micColor}`}
        title={
          p.mutedByHost
            ? t("mutedByHost")
            : p.isMicEnabled
              ? t("micOn")
              : t("micOff")
        }
        aria-label={
          p.mutedByHost
            ? t("mutedByHost")
            : p.isMicEnabled
              ? t("micOn")
              : t("micOff")
        }
      >
        {micIcon}
      </span>

      {showMuteButton && (
        <button
          onClick={() => onMute?.(p.identity, p.mutedByHost)}
          disabled={pending}
          className={`text-[11px] px-2 py-1 rounded-lg transition-colors disabled:opacity-50 ${
            p.mutedByHost
              ? "text-emerald-400 hover:bg-emerald-950/30"
              : "text-surface-400 hover:text-red-400 hover:bg-red-950/30"
          }`}
          title={p.mutedByHost ? t("hostUnmuteAction") : t("hostMuteAction")}
        >
          {p.mutedByHost ? t("hostUnmuteAction") : t("hostMuteAction")}
        </button>
      )}
    </div>
  );
}
