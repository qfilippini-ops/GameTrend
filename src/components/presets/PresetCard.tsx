"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import FavoriteButton from "@/components/presets/FavoriteButton";
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

export default function PresetCard({ preset, index = 0, userId, compact = false }: PresetCardProps) {
  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.04 }}
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
                  <span className="text-3xl opacity-15">
                    {preset.game_type === "ghostword" ? "👻" : "🎮"}
                  </span>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-surface-950/80 to-transparent" />
            </div>
            <div className="px-2.5 py-2">
              <p className="font-display font-bold text-white text-xs leading-tight truncate">
                {preset.name}
              </p>
              <p className="text-surface-500 text-xs mt-0.5">
                {preset.play_count} parties
              </p>
            </div>
          </div>
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="relative"
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
                <span className="text-5xl opacity-10">
                  {preset.game_type === "ghostword" ? "👻" : "🎮"}
                </span>
              </div>
            )}
            {/* Gradient overlay bottom */}
            <div className="absolute inset-0 bg-gradient-to-t from-surface-950/90 via-transparent to-transparent" />

            {/* Game type badge */}
            <div className="absolute top-2 left-2">
              <span className="text-xs px-2 py-0.5 rounded-full bg-surface-950/70 backdrop-blur-sm text-surface-300 border border-surface-700/40 font-medium">
                {preset.game_type === "ghostword" ? "👻" : "🎮"}
              </span>
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
    </motion.div>
  );
}
