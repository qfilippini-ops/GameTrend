"use client";

/**
 * Composant de paramétrage d'une partie DYP online.
 *
 * Réutilisé par :
 *   - le lobby de création (`/games/dyp/online`) — paramètres initiaux
 *   - la salle d'attente (`/games/dyp/online/[code]`) — édition par l'hôte
 *
 * Affiche :
 *   - Picker de preset (compatible DYP)
 *   - Taille de bracket (puissances de 2 valides selon le preset)
 *   - Sélecteur tour time (30s → 5min, palier 30s)
 *   - Toggle tieBreak (random / first)
 *
 * État géré par le parent (props), pour que le même composant serve à la
 * création (state local) et à l'édition (debounce + push update vers le serveur).
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import PresetPicker from "@/components/PresetPicker";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_CONFIG, getValidBracketSizes } from "@/games/dyp/engine";
import type { DYPConfig } from "@/types/games";
import type { Preset } from "@/types/database";
import { PRESET_FULL_COLS } from "@/lib/supabase/columns";
import {
  DYP_TOUR_MIN_SECONDS,
  DYP_TOUR_MAX_SECONDS,
  DYP_BRACKET_SIZES,
  type DypTieBreak,
} from "@/games/dyp/online-config";

export interface DypRoomSettingsValue {
  presetId: string;
  bracketSize: number;
  tourTimeSeconds: number;
  tieBreak: DypTieBreak;
}

interface DypRoomSettingsProps {
  value: DypRoomSettingsValue;
  onChange: (next: DypRoomSettingsValue) => void;
  /**
   * Style "compact" pour la salle d'attente (sans la grosse carte d'en-tête,
   * juste les inputs). `false` par défaut (affichage lobby).
   */
  compact?: boolean;
}

const TOUR_TIME_OPTIONS: number[] = [];
for (let s = DYP_TOUR_MIN_SECONDS; s <= DYP_TOUR_MAX_SECONDS; s += 30) {
  TOUR_TIME_OPTIONS.push(s);
}

function formatTourTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}min` : `${m}m${s}s`;
}

/** Choisit la plus grande taille valide ≤ desired. */
function clampBracketSize(desired: number, validSizes: number[]): number {
  if (validSizes.length === 0) return 0;
  const candidates = validSizes.filter((s) => s <= desired);
  return candidates.length > 0 ? candidates[candidates.length - 1] : validSizes[0];
}

export default function DypRoomSettings({
  value,
  onChange,
  compact = false,
}: DypRoomSettingsProps) {
  const t = useTranslations("games.dyp.online.settings");
  const { user } = useAuth();
  const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null);

  useEffect(() => {
    if (!value.presetId) {
      setSelectedPreset(null);
      return;
    }
    if (selectedPreset?.id === value.presetId) return;
    const supabase = createClient();
    supabase
      .from("presets")
      .select(PRESET_FULL_COLS)
      .eq("id", value.presetId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setSelectedPreset(data as Preset);
      });
  }, [value.presetId, selectedPreset?.id]);

  const presetConfig: DYPConfig | null = selectedPreset?.config
    ? (selectedPreset.config as unknown as DYPConfig)
    : null;
  const cardCount = presetConfig
    ? presetConfig.cards.length
    : DEFAULT_CONFIG.cards.length;
  const validBracketSizes = getValidBracketSizes(cardCount);

  // Recaler bracketSize si la borne max change
  useEffect(() => {
    const safe = clampBracketSize(value.bracketSize, validBracketSizes);
    if (safe !== value.bracketSize) {
      onChange({ ...value, bracketSize: safe });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardCount]);

  const update = (patch: Partial<DypRoomSettingsValue>) =>
    onChange({ ...value, ...patch });

  return (
    <div className={compact ? "space-y-4" : "space-y-4"}>
      {/* Preset */}
      <div className="rounded-2xl border border-surface-700/40 bg-surface-900/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-800/50 flex items-center justify-between">
          <p className="text-white font-display font-bold text-sm">{t("preset")}</p>
          <span className="text-amber-400/70 text-[10px] font-semibold tracking-wide">
            ✦ {t("compatBadge")}
          </span>
        </div>
        <div className="p-4 space-y-3">
          <PresetPicker
            gameType="dyp"
            selectedIds={value.presetId ? [value.presetId] : []}
            onChange={(ids) => update({ presetId: ids[0] ?? "" })}
            onPresetsChange={(presets) => setSelectedPreset(presets[0] ?? null)}
            userId={user?.id}
            label={t("myPresets")}
            maxSelections={1}
          />
          {!value.presetId && (
            <p className="text-surface-700 text-xs">
              {t("defaultCards", { count: DEFAULT_CONFIG.cards.length })}
            </p>
          )}
          {selectedPreset && (
            <p className="text-surface-600 text-xs">
              {t("cardsInPreset", { count: cardCount })}
            </p>
          )}
        </div>
      </div>

      {/* Taille du bracket */}
      <div className="rounded-2xl border border-surface-700/40 bg-surface-900/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-800/50 flex items-center justify-between">
          <div>
            <p className="text-white font-display font-bold text-sm">{t("bracketSize")}</p>
            <p className="text-surface-500 text-xs mt-0.5">{t("bracketSizeHint")}</p>
          </div>
          <span className="text-amber-400 text-2xl font-display font-black tabular-nums leading-none">
            {value.bracketSize}
          </span>
        </div>
        <div className="p-4">
          <div className="flex flex-wrap gap-1.5">
            {DYP_BRACKET_SIZES.map((size) => {
              const enabled = validBracketSizes.includes(size);
              const isSelected = value.bracketSize === size;
              return (
                <button
                  key={size}
                  type="button"
                  disabled={!enabled}
                  onClick={() => enabled && update({ bracketSize: size })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    isSelected
                      ? "bg-amber-500 text-white"
                      : enabled
                        ? "bg-surface-800/80 text-surface-400 hover:bg-surface-700/80 hover:text-white"
                        : "bg-surface-900/40 text-surface-700 opacity-40 cursor-not-allowed"
                  }`}
                >
                  {size}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Temps du tour */}
      <div className="rounded-2xl border border-surface-700/40 bg-surface-900/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-800/50 flex items-center justify-between">
          <div>
            <p className="text-white font-display font-bold text-sm">{t("tourTime")}</p>
            <p className="text-surface-500 text-xs mt-0.5">{t("tourTimeHint")}</p>
          </div>
          <span className="text-amber-400 text-xl font-display font-black tabular-nums leading-none">
            {formatTourTime(value.tourTimeSeconds)}
          </span>
        </div>
        <div className="p-4">
          <div className="flex flex-wrap gap-1.5">
            {TOUR_TIME_OPTIONS.map((s) => {
              const isSelected = value.tourTimeSeconds === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => update({ tourTimeSeconds: s })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    isSelected
                      ? "bg-amber-500 text-white"
                      : "bg-surface-800/80 text-surface-400 hover:bg-surface-700/80 hover:text-white"
                  }`}
                >
                  {formatTourTime(s)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tie-break (égalité) */}
      <div className="rounded-2xl border border-surface-700/40 bg-surface-900/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-800/50">
          <p className="text-white font-display font-bold text-sm">{t("tieBreak")}</p>
          <p className="text-surface-500 text-xs mt-0.5">{t("tieBreakHint")}</p>
        </div>
        <div className="p-3">
          <div className="flex bg-surface-800/60 rounded-xl p-1 gap-1">
            <button
              type="button"
              onClick={() => update({ tieBreak: "random" })}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                value.tieBreak === "random"
                  ? "bg-amber-600 text-white"
                  : "text-surface-500 hover:text-white"
              }`}
            >
              {t("tieBreakRandom")}
            </button>
            <button
              type="button"
              onClick={() => update({ tieBreak: "first" })}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                value.tieBreak === "first"
                  ? "bg-amber-600 text-white"
                  : "text-surface-500 hover:text-white"
              }`}
            >
              {t("tieBreakFirst")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
