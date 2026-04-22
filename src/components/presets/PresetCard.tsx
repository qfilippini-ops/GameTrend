"use client";

import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { useTranslations } from "next-intl";
import FavoriteButton from "@/components/presets/FavoriteButton";
import GameCompatBadge from "@/components/presets/GameCompatBadge";
import { getCompatibleGames } from "@/games/compat";
import type { Preset } from "@/types/database";

interface PresetCardProps {
  preset: Preset & {
    profiles?: { username: string | null; avatar_url: string | null } | null;
  };
  index?: number;
  userId?: string | null;
  /** Mode compact : cover + nom seulement, pour les listes horizontales */
  compact?: boolean;
}

// Animation d'apparition gérée en CSS pure (vs framer-motion auparavant) :
// PresetCard est rendu en boucle (5-30 instances visibles), framer-motion
// ajoutait ~30 KiB au bundle critique de la landing pour un effet décoratif.
// On utilise inline style + animation CSS Tailwind pour le même rendu visuel.
const STAGGER_MS = 40;

export default function PresetCard({ preset, index = 0, userId, compact = false }: PresetCardProps) {
  const t = useTranslations("presets.card");
  // Premier jeu compatible = jeu natif du preset (ordre garanti par getCompatibleGames)
  // Sert uniquement pour le placeholder no-cover (icône grisée d'arrière-plan).
  const primaryGame = getCompatibleGames(preset.game_type)[0];
  const placeholderIcon = primaryGame?.icon ?? "🎮";

  if (compact) {
    return (
      <div
        className="motion-safe:animate-preset-card-in opacity-0"
        style={{
          animationDelay: `${index * STAGGER_MS}ms`,
          animationFillMode: "forwards",
        }}
      >
        <Link href={`/presets/${preset.id}`}>
          <div className="group rounded-2xl border border-surface-700/40 bg-surface-900/60 hover:border-brand-500/40 transition-all overflow-hidden cursor-pointer">
            {/* Cover cinémascope */}
            <div className="relative w-full bg-gradient-to-br from-surface-800 to-surface-900" style={{ aspectRatio: "16/9" }}>
              {preset.cover_url ? (
                <Image
                  src={preset.cover_url}
                  alt={preset.name}
                  fill
                  className="object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                  unoptimized
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-3xl opacity-15">{placeholderIcon}</span>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-surface-950/80 to-transparent" />
              {/* Badge compatibilité multi-jeux (très petit en mode compact) */}
              <div className="absolute bottom-1 left-1">
                <GameCompatBadge presetGameType={preset.game_type} size="xs" />
              </div>
            </div>
            <div className="px-2.5 py-2">
              <p className="font-display font-bold text-white text-xs leading-tight truncate">
                {preset.name}
              </p>
              <p className="text-surface-500 text-xs mt-0.5">
                {t("playCount", { count: preset.play_count })}
              </p>
            </div>
          </div>
        </Link>
      </div>
    );
  }

  return (
    <div
      className="relative motion-safe:animate-preset-card-in opacity-0"
      style={{
        animationDelay: `${index * STAGGER_MS}ms`,
        animationFillMode: "forwards",
      }}
    >
      <Link href={`/presets/${preset.id}`}>
        <div className="group rounded-2xl border border-surface-700/40 bg-surface-900/60 hover:border-brand-500/40 hover:shadow-neon-sm-brand transition-all overflow-hidden cursor-pointer">
          {/* Cover — aspect ratio cinémascope */}
          <div
            className="relative w-full bg-gradient-to-br from-surface-800 to-surface-900"
            style={{ aspectRatio: "16/9" }}
          >
            {preset.cover_url ? (
              <Image
                src={preset.cover_url}
                alt={preset.name}
                fill
                className="object-cover opacity-75 group-hover:opacity-95 transition-opacity"
                unoptimized
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-5xl opacity-10">{placeholderIcon}</span>
              </div>
            )}
            {/* Gradient overlay bottom */}
            <div className="absolute inset-0 bg-gradient-to-t from-surface-950/90 via-transparent to-transparent" />

            {/* Badge compatibilité (1 ou plusieurs jeux compatibles) */}
            <div className="absolute top-2 left-2">
              <GameCompatBadge presetGameType={preset.game_type} size="sm" />
            </div>

            {/* Favori */}
            <FavoriteButton
              presetId={preset.id}
              userId={userId}
              variant="icon"
              className="absolute top-2 right-2"
            />
          </div>

          {/* Contenu */}
          <div className="p-3">
            <h3 className="font-display font-bold text-white text-sm leading-tight mb-1 truncate">
              {preset.name}
            </h3>
            {/* Hauteur fixe pour homogénéiser les cartes avec ou sans description */}
            <p className="text-surface-500 text-xs line-clamp-1 mb-2 min-h-[1rem]">
              {preset.description ?? ""}
            </p>
            <div className="flex items-center justify-between text-xs text-surface-600">
              <span className="flex items-center gap-1">
                <span className="text-surface-500">▶</span> {preset.play_count}
              </span>
              <span className="flex items-center gap-1 text-amber-500/70">
                ★ {preset.like_count}
              </span>
            </div>
          </div>
        </div>
      </Link>
    </div>
  );
}
