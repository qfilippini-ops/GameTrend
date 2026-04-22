"use client";

/**
 * Composant de paramétrage d'une partie Blind Rank online.
 *
 * Réutilisé par :
 *   - le lobby de création (`/games/blindrank/online`) — paramètres initiaux
 *   - la salle d'attente (`/games/blindrank/online/[code]`) — édition par l'hôte
 *
 * Affiche :
 *   - Picker de preset (avec bornes rackSize calées au preset)
 *   - Slider rackSize (2 → min(128, cardCount))
 *   - Sélecteur tour time (30s → 5min, palier 30s)
 *   - Toggle tieBreak (low / high)
 *
 * État géré par le parent (props), pour que le même composant serve à la
 * création (state local) et à l'édition (debounce + push update vers le serveur).
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import PresetPicker from "@/components/PresetPicker";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_CONFIG,
  clampRackSize,
  MIN_RACK_SIZE,
  MAX_RACK_SIZE,
  QUICK_RACK_SIZES,
} from "@/games/blindrank/engine";
import type { BlindRankConfig } from "@/types/games";
import type { Preset } from "@/types/database";
import { PRESET_FULL_COLS } from "@/lib/supabase/columns";
import {
  BLINDRANK_TOUR_MIN_SECONDS,
  BLINDRANK_TOUR_MAX_SECONDS,
  type BlindRankTieBreak,
} from "@/app/actions/blindrank-rooms";

export interface BlindRankRoomSettingsValue {
  presetId: string;
  rackSize: number;
  tourTimeSeconds: number;
  tieBreak: BlindRankTieBreak;
}

interface BlindRankRoomSettingsProps {
  value: BlindRankRoomSettingsValue;
  onChange: (next: BlindRankRoomSettingsValue) => void;
  /**
   * Style "compact" pour la salle d'attente (sans la grosse carte d'en-tête,
   * juste les inputs). `false` par défaut (affichage lobby).
   */
  compact?: boolean;
}

const TOUR_TIME_OPTIONS: number[] = [];
for (let s = BLINDRANK_TOUR_MIN_SECONDS; s <= BLINDRANK_TOUR_MAX_SECONDS; s += 30) {
  TOUR_TIME_OPTIONS.push(s);
}

function formatTourTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}min` : `${m}m${s}s`;
}

export default function BlindRankRoomSettings({
  value,
  onChange,
  compact = false,
}: BlindRankRoomSettingsProps) {
  const t = useTranslations("games.blindrank.online.settings");
  const { user } = useAuth();
  const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null);

  // Charger le preset si presetId fourni à l'init (cas édition / refresh)
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

  const presetConfig: BlindRankConfig | null = selectedPreset?.config
    ? (selectedPreset.config as unknown as BlindRankConfig)
    : null;
  const cardCount = presetConfig
    ? presetConfig.cards.length
    : DEFAULT_CONFIG.cards.length;
  const maxRack = Math.min(MAX_RACK_SIZE, cardCount);
  const quickSizes = QUICK_RACK_SIZES.filter((s) => s <= maxRack);

  // Recaler rackSize si la borne max change
  useEffect(() => {
    const safe = clampRackSize(value.rackSize, cardCount);
    if (safe !== value.rackSize) {
      onChange({ ...value, rackSize: safe });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardCount]);

  const update = (patch: Partial<BlindRankRoomSettingsValue>) =>
    onChange({ ...value, ...patch });

  return (
    <div className={compact ? "space-y-4" : "space-y-4"}>
      {/* Preset */}
      <div className="rounded-2xl border border-surface-700/40 bg-surface-900/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-800/50 flex items-center justify-between">
          <p className="text-white font-display font-bold text-sm">{t("preset")}</p>
          <span className="text-cyan-400/70 text-[10px] font-semibold tracking-wide">
            ✦ {t("compatBadge")}
          </span>
        </div>
        <div className="p-4 space-y-3">
          <PresetPicker
            gameType="blindrank"
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

      {/* Nombre de cartes */}
      <div className="rounded-2xl border border-surface-700/40 bg-surface-900/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-800/50 flex items-center justify-between">
          <p className="text-white font-display font-bold text-sm">{t("rackSize")}</p>
          <span className="text-cyan-400 text-2xl font-display font-black tabular-nums leading-none">
            {value.rackSize}
          </span>
        </div>
        <div className="p-4 space-y-4">
          <div className="space-y-1.5">
            <input
              type="range"
              min={MIN_RACK_SIZE}
              max={maxRack}
              step={1}
              value={value.rackSize}
              onChange={(e) => update({ rackSize: Number(e.target.value) })}
              className="w-full accent-cyan-500"
              aria-label={t("rackSize")}
            />
            <div className="flex items-center justify-between text-[10px] text-surface-700 font-mono">
              <span>{MIN_RACK_SIZE}</span>
              <span>{maxRack}</span>
            </div>
          </div>
          {quickSizes.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {quickSizes.map((size) => {
                const isSelected = value.rackSize === size;
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() => update({ rackSize: size })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      isSelected
                        ? "bg-cyan-500 text-white"
                        : "bg-surface-800/80 text-surface-400 hover:bg-surface-700/80 hover:text-white"
                    }`}
                  >
                    {size}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Temps du tour */}
      <div className="rounded-2xl border border-surface-700/40 bg-surface-900/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-800/50 flex items-center justify-between">
          <div>
            <p className="text-white font-display font-bold text-sm">{t("tourTime")}</p>
            <p className="text-surface-500 text-xs mt-0.5">{t("tourTimeHint")}</p>
          </div>
          <span className="text-cyan-400 text-xl font-display font-black tabular-nums leading-none">
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
                      ? "bg-cyan-500 text-white"
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
              onClick={() => update({ tieBreak: "low" })}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                value.tieBreak === "low"
                  ? "bg-cyan-600 text-white"
                  : "text-surface-500 hover:text-white"
              }`}
            >
              {t("tieBreakLow")}
            </button>
            <button
              type="button"
              onClick={() => update({ tieBreak: "high" })}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                value.tieBreak === "high"
                  ? "bg-cyan-600 text-white"
                  : "text-surface-500 hover:text-white"
              }`}
            >
              {t("tieBreakHigh")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
