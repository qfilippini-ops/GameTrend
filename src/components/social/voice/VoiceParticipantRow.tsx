"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import Avatar from "@/components/ui/Avatar";
import type { VoiceParticipantMeta } from "@/hooks/useGroupVoice";

interface VoiceParticipantRowProps {
  participant: VoiceParticipantMeta;
  selfIsHost: boolean;
  /** Mute global (host only). Coupe pour tout le monde via API serveur. */
  onHostMute?: (targetUserId: string, currentlyMuted: boolean) => void;
  /** Mute local (chacun). Coupe le son chez l'utilisateur courant uniquement. */
  onToggleLocalMute?: (targetUserId: string, currentlyMuted: boolean) => void;
  /** Toggle micro de l'utilisateur courant (sur sa propre ligne uniquement). */
  onToggleSelfMic?: () => void;
  onProfileClick?: () => void;
  /** Action host en cours (désactive le bouton mute global). */
  pending?: boolean;
}

/**
 * Ligne de participant vocal.
 *
 * Sa propre ligne :
 *   - Avatar + nom + badge "Toi"
 *   - Gros bouton micro 🎤 / 🎙️ / 🔇 (toggle son micro)
 *
 * Ligne d'un autre participant :
 *   - Avatar + nom + badges (host, etc.)
 *   - Icône statut micro (visuel)
 *   - Bouton 🔊 / 🔇 → mute local (= ne plus l'entendre soi-même)
 *   - Si on est host : bouton "Couper" / "Réactiver" → mute global
 */
export default function VoiceParticipantRow({
  participant: p,
  selfIsHost,
  onHostMute,
  onToggleLocalMute,
  onToggleSelfMic,
  onProfileClick,
  pending = false,
}: VoiceParticipantRowProps) {
  const t = useTranslations("groups.voice");

  // Anneau « qui parle » : épaisseur proportionnelle à audioLevel.
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
        {p.mutedByHost && !p.isLocal && (
          <p className="text-[10px] text-red-400/80 truncate">
            {t("mutedByHostStatus")}
          </p>
        )}
        {p.isLocallyMuted && (
          <p className="text-[10px] text-surface-500 truncate">
            {t("locallyMutedStatus")}
          </p>
        )}
      </div>

      {p.isLocal ? (
        <button
          type="button"
          onClick={onToggleSelfMic}
          disabled={p.mutedByHost}
          aria-label={
            p.mutedByHost
              ? t("mutedByHost")
              : p.isMicEnabled
                ? t("tapToMute")
                : t("tapToUnmute")
          }
          title={
            p.mutedByHost
              ? t("mutedByHost")
              : p.isMicEnabled
                ? t("tapToMute")
                : t("tapToUnmute")
          }
          className={`w-10 h-10 flex items-center justify-center rounded-xl text-lg transition-all ${
            p.mutedByHost
              ? "bg-red-950/40 border border-red-500/40 text-red-300 cursor-not-allowed"
              : p.isMicEnabled
                ? "bg-emerald-600/80 border border-emerald-400/60 text-white hover:bg-emerald-500"
                : "bg-surface-800 border border-surface-700/40 text-surface-300 hover:text-white hover:border-brand-500/50"
          }`}
        >
          {micIcon}
        </button>
      ) : (
        <>
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

          <button
            type="button"
            onClick={() =>
              onToggleLocalMute?.(p.identity, p.isLocallyMuted)
            }
            aria-label={
              p.isLocallyMuted ? t("unmuteForMe") : t("muteForMe")
            }
            title={p.isLocallyMuted ? t("unmuteForMe") : t("muteForMe")}
            className={`w-9 h-9 flex items-center justify-center rounded-xl text-base transition-colors ${
              p.isLocallyMuted
                ? "bg-surface-700/60 border border-surface-600/60 text-surface-300 hover:text-white"
                : "bg-surface-800 border border-surface-700/40 text-surface-300 hover:text-brand-300 hover:border-brand-500/50"
            }`}
          >
            {p.isLocallyMuted ? "🔇" : "🔊"}
          </button>

          {selfIsHost && (
            <button
              type="button"
              onClick={() => onHostMute?.(p.identity, p.mutedByHost)}
              disabled={pending}
              className={`text-[11px] px-2 py-1 rounded-lg transition-colors disabled:opacity-50 ${
                p.mutedByHost
                  ? "text-emerald-400 hover:bg-emerald-950/30"
                  : "text-surface-400 hover:text-red-400 hover:bg-red-950/30"
              }`}
              title={
                p.mutedByHost ? t("hostUnmuteAction") : t("hostMuteAction")
              }
            >
              {p.mutedByHost ? t("hostUnmuteAction") : t("hostMuteAction")}
            </button>
          )}
        </>
      )}
    </div>
  );
}
