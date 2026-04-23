"use client";

/**
 * Composant de paramétrage d'une partie Outbid online (1v1).
 *
 * Réutilisé par :
 *   - le lobby de création (`/games/outbid/online`) — paramètres initiaux
 *   - la salle d'attente (`/games/outbid/online/[code]`) — édition par l'hôte
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import PresetPicker from "@/components/PresetPicker";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import type { DYPConfig } from "@/types/games";
import type { Preset } from "@/types/database";
import { PRESET_FULL_COLS } from "@/lib/supabase/columns";
import {
  OUTBID_TOUR_MIN_SECONDS,
  OUTBID_TOUR_MAX_SECONDS,
  OUTBID_TEAM_MIN,
  OUTBID_TEAM_MAX,
  OUTBID_OPENING_BIDDERS,
  type OutbidOpeningBidder,
} from "@/games/outbid/online-config";

export interface OutbidRoomSettingsValue {
  presetId: string;
  teamSize: number;
  tourTimeSeconds: number;
  openingBidder: OutbidOpeningBidder;
}

interface OutbidRoomSettingsProps {
  value: OutbidRoomSettingsValue;
  onChange: (next: OutbidRoomSettingsValue) => void;
  compact?: boolean;
}

const TOUR_TIME_OPTIONS: number[] = [];
for (let s = OUTBID_TOUR_MIN_SECONDS; s <= OUTBID_TOUR_MAX_SECONDS; s += 30) {
  TOUR_TIME_OPTIONS.push(s);
}

const TEAM_SIZE_OPTIONS: number[] = [];
for (let n = OUTBID_TEAM_MIN; n <= OUTBID_TEAM_MAX; n++) {
  TEAM_SIZE_OPTIONS.push(n);
}

function formatTourTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}min` : `${m}m${s}s`;
}

export default function OutbidRoomSettings({
  value,
  onChange,
  compact: _compact = false,
}: OutbidRoomSettingsProps) {
  const t = useTranslations("games.outbid.online.settings");
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
  const cardCount = presetConfig ? presetConfig.cards.length : 0;
  const cardsNeeded = value.teamSize * 2;
  const presetTooSmall =
    !!selectedPreset && cardCount > 0 && cardCount < cardsNeeded;

  const update = (patch: Partial<OutbidRoomSettingsValue>) =>
    onChange({ ...value, ...patch });

  return (
    <div className="space-y-4">
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
            gameType="outbid"
            selectedIds={value.presetId ? [value.presetId] : []}
            onChange={(ids) => update({ presetId: ids[0] ?? "" })}
            onPresetsChange={(presets) => setSelectedPreset(presets[0] ?? null)}
            userId={user?.id}
            label={t("myPresets")}
            maxSelections={1}
          />
          {!value.presetId && (
            <p className="text-amber-500/80 text-xs">{t("presetRequired")}</p>
          )}
          {selectedPreset && (
            <p className="text-surface-600 text-xs">
              {t("cardsInPreset", { count: cardCount })}
            </p>
          )}
          {presetTooSmall && (
            <p className="text-red-400 text-xs">
              {t("presetTooSmall", { needed: cardsNeeded })}
            </p>
          )}
        </div>
      </div>

      {/* Taille d'équipe */}
      <div className="rounded-2xl border border-surface-700/40 bg-surface-900/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-800/50 flex items-center justify-between">
          <div>
            <p className="text-white font-display font-bold text-sm">{t("teamSize")}</p>
            <p className="text-surface-500 text-xs mt-0.5">{t("teamSizeHint")}</p>
          </div>
          <span className="text-amber-400 text-2xl font-display font-black tabular-nums leading-none">
            {value.teamSize}
          </span>
        </div>
        <div className="p-4">
          <div className="flex flex-wrap gap-1.5">
            {TEAM_SIZE_OPTIONS.map((n) => {
              const isSelected = value.teamSize === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => update({ teamSize: n })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    isSelected
                      ? "bg-amber-500 text-white"
                      : "bg-surface-800/80 text-surface-400 hover:bg-surface-700/80 hover:text-white"
                  }`}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Temps par décision */}
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

      {/* Premier enchérisseur */}
      <div className="rounded-2xl border border-surface-700/40 bg-surface-900/50 overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-800/50">
          <p className="text-white font-display font-bold text-sm">{t("openingBidder")}</p>
          <p className="text-surface-500 text-xs mt-0.5">{t("openingBidderHint")}</p>
        </div>
        <div className="p-3">
          <div className="grid grid-cols-2 gap-1.5">
            {OUTBID_OPENING_BIDDERS.map((mode) => {
              const isSelected = value.openingBidder === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => update({ openingBidder: mode })}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition-all text-left ${
                    isSelected
                      ? "bg-amber-600 text-white"
                      : "bg-surface-800/60 text-surface-400 hover:bg-surface-700/60 hover:text-white"
                  }`}
                >
                  <div className="font-bold">{t(`opening.${mode}.label`)}</div>
                  <div
                    className={`text-[10px] mt-0.5 ${
                      isSelected ? "text-white/80" : "text-surface-600"
                    }`}
                  >
                    {t(`opening.${mode}.hint`)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
