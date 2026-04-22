"use client";

import { useTranslations } from "next-intl";
import { getCompatibleGames } from "@/games/compat";

interface GameCompatBadgeProps {
  /** Le `game_type` natif du preset (tel que stocké en DB) */
  presetGameType: string;
  /** Taille du badge — `xs` pour les cards compactes, `sm` pour les cards normales */
  size?: "xs" | "sm";
  /** Si true, affiche aussi le nom du jeu (utilisé sur les pages détail) */
  showLabel?: boolean;
  className?: string;
}

/**
 * Badge affichant les jeux capables de jouer un preset.
 *
 * - 1 seul jeu compatible → simple icône du jeu (comportement legacy)
 * - 2+ jeux compatibles  → icônes empilées + petit liseré subtil pour
 *   signaler la polyvalence du preset (« compatible multi-jeux »).
 *
 * Les jeux compatibles sont déduits via `getCompatibleGames` qui interroge
 * tous les adapters via leur `acceptedPresetTypes`. Aucun mapping en dur.
 */
export default function GameCompatBadge({
  presetGameType,
  size = "sm",
  showLabel = false,
  className = "",
}: GameCompatBadgeProps) {
  const t = useTranslations("presets.compat");
  const games = getCompatibleGames(presetGameType);

  // Fallback si jeu inconnu (preset orphelin, type retiré du registre, etc.)
  if (games.length === 0) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded-full bg-surface-950/70 backdrop-blur-sm border border-surface-700/40 text-surface-300 ${
          size === "xs" ? "text-[10px] w-5 h-5" : "text-xs w-6 h-6"
        } ${className}`}
        title={presetGameType}
      >
        🎮
      </span>
    );
  }

  const isMulti = games.length > 1;
  const sizeStyles =
    size === "xs"
      ? { icon: "text-[10px]", padding: "px-1.5 py-0.5", gap: "gap-0.5", height: "h-5", label: "text-[9px]" }
      : { icon: "text-xs", padding: "px-2 py-0.5", gap: "gap-1", height: "h-6", label: "text-[10px]" };

  // Couleur de bordure : neutre pour mono, doré subtil pour multi
  const borderColor = isMulti
    ? "border-amber-500/40"
    : "border-surface-700/40";
  const bgColor = isMulti
    ? "bg-surface-950/80"
    : "bg-surface-950/70";

  return (
    <span
      className={`inline-flex items-center ${sizeStyles.gap} rounded-full ${bgColor} backdrop-blur-sm border ${borderColor} ${sizeStyles.padding} ${sizeStyles.height} ${className}`}
      title={
        isMulti
          ? t("multiTooltip", { games: games.map((g) => g.name).join(" · ") })
          : games[0].name
      }
      aria-label={
        isMulti
          ? t("multiAriaLabel", { games: games.map((g) => g.name).join(", ") })
          : games[0].name
      }
    >
      {games.map((game, idx) => (
        <span key={game.id} className={`${sizeStyles.icon} leading-none`}>
          {game.icon}
          {idx < games.length - 1 && (
            <span className="text-amber-500/60 mx-0.5 text-[8px]" aria-hidden>
              ·
            </span>
          )}
        </span>
      ))}
      {showLabel && (
        <span className={`${sizeStyles.label} font-semibold text-surface-200 ml-0.5 whitespace-nowrap`}>
          {isMulti ? t("multiLabel") : games[0].name}
        </span>
      )}
    </span>
  );
}
