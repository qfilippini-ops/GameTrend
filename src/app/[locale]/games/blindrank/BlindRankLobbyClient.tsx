"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import Header from "@/components/layout/Header";
import PresetPicker from "@/components/PresetPicker";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { Link } from "@/i18n/navigation";
import { BLINDRANK_META } from "@/games/blindrank/config";
import {
  DEFAULT_CONFIG,
  createGame,
  clampRackSize,
  MIN_RACK_SIZE,
  MAX_RACK_SIZE,
  QUICK_RACK_SIZES,
} from "@/games/blindrank/engine";
import type { BlindRankConfig } from "@/types/games";
import type { Preset } from "@/types/database";
import { PRESET_FULL_COLS } from "@/lib/supabase/columns";

const STORAGE_KEY = "blindrank:lobby";
const GAME_KEY = "blindrank:current_game";

interface SavedLobby {
  presetId: string;
  rackSize: number;
}

function loadLobby(): SavedLobby {
  if (typeof window === "undefined") return { presetId: "", rackSize: 10 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { presetId: "", rackSize: 10 };
  } catch {
    return { presetId: "", rackSize: 10 };
  }
}

export default function BlindRankLobbyPage() {
  return (
    <Suspense fallback={null}>
      <BlindRankLobbyPageContent />
    </Suspense>
  );
}

function BlindRankLobbyPageContent() {
  const t = useTranslations("games.blindrank.lobby");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null);
  const [rackSize, setRackSize] = useState(10);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    setMounted(true);
    const urlPresetId = searchParams.get("presetId");
    const saved = loadLobby();
    const presetId = urlPresetId ?? saved.presetId;
    setSelectedPresetId(presetId);
    setRackSize(saved.rackSize);

    // Charger immédiatement le preset si fourni via URL pour caler le rackSize
    if (urlPresetId) {
      const supabase = createClient();
      supabase
        .from("presets")
        .select(PRESET_FULL_COLS)
        .eq("id", urlPresetId)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setSelectedPreset(data as Preset);
        });
    }
  }, [searchParams]);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ presetId: selectedPresetId, rackSize })
    );
  }, [mounted, selectedPresetId, rackSize]);

  const presetConfig: BlindRankConfig | null = selectedPreset?.config
    ? (selectedPreset.config as unknown as BlindRankConfig)
    : null;

  const cardCount = presetConfig
    ? presetConfig.cards.length
    : DEFAULT_CONFIG.cards.length;
  // Borne haute du slider : on ne dépasse jamais le nombre de cartes du preset
  const maxRack = Math.min(MAX_RACK_SIZE, cardCount);

  // Recaler rackSize si la borne max change suite au changement de preset
  useEffect(() => {
    const safe = clampRackSize(rackSize, cardCount);
    if (safe !== rackSize) setRackSize(safe);
  }, [selectedPresetId, cardCount, rackSize]);

  // Quick-select : on garde uniquement les tailles ≤ maxRack
  const quickSizes = QUICK_RACK_SIZES.filter((s) => s <= maxRack);

  async function handleLaunch() {
    setLaunching(true);
    let config: BlindRankConfig = DEFAULT_CONFIG;
    let presetId: string | undefined;

    if (selectedPresetId) {
      const supabase = createClient();
      const { data } = await supabase
        .from("presets")
        .select("config")
        .eq("id", selectedPresetId)
        .maybeSingle();
      if (data?.config) {
        config = data.config as unknown as BlindRankConfig;
        presetId = selectedPresetId;
      }
    }

    const gameState = createGame(config, rackSize, presetId);
    localStorage.setItem(GAME_KEY, JSON.stringify(gameState));
    router.push("/games/blindrank/play");
  }

  if (!mounted) return null;

  return (
    <div className="bg-surface-950 bg-grid min-h-screen">
      <Header title={BLINDRANK_META.name} backHref="/" />

      <div className="px-4 py-5 space-y-4 max-w-lg mx-auto">

        {/* ── Hero ── */}
        <div
          className="relative rounded-3xl overflow-hidden border border-cyan-700/20 bg-gradient-to-br from-cyan-950/70 via-surface-900 to-brand-950/60 p-5 motion-safe:animate-slide-up"
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(circle at 50% 0%, rgba(6,182,212,0.12) 0%, transparent 65%)",
            }}
          />
          <div className="relative z-10 flex items-start gap-4">
            <div className="text-5xl shrink-0 animate-float">{BLINDRANK_META.icon}</div>
            <div className="min-w-0">
              <h1 className="font-display font-black text-white text-2xl leading-tight mb-1">
                {BLINDRANK_META.name}
              </h1>
              <p className="text-surface-400 text-sm leading-relaxed">
                {BLINDRANK_META.description}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {BLINDRANK_META.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300/70 border border-cyan-700/20"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Preset ── */}
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
              selectedIds={selectedPresetId ? [selectedPresetId] : []}
              onChange={(ids) => setSelectedPresetId(ids[0] ?? "")}
              onPresetsChange={(presets) => setSelectedPreset(presets[0] ?? null)}
              userId={user?.id}
              label={t("myPresets")}
              maxSelections={1}
            />
            {!selectedPresetId && (
              <div className="flex items-center justify-between pt-1">
                <p className="text-surface-700 text-xs">
                  {t("defaultCards", { count: DEFAULT_CONFIG.cards.length })}
                </p>
                <Link
                  href="/presets/new?game=blindrank"
                  className="text-cyan-400/80 text-xs font-medium hover:text-cyan-300 transition-colors"
                >
                  {t("createPreset")}
                </Link>
              </div>
            )}
            {selectedPreset && (
              <div className="flex items-center justify-between pt-1">
                <p className="text-surface-600 text-xs">
                  {t("cardsInPreset", { count: cardCount })}
                </p>
                <Link
                  href={`/presets/${selectedPresetId}`}
                  className="text-surface-600 text-xs hover:text-surface-400 transition-colors"
                >
                  {t("view")}
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* ── Nombre de cartes (rackSize) ── */}
        <div className="rounded-2xl border border-surface-700/40 bg-surface-900/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-800/50 flex items-center justify-between">
            <p className="text-white font-display font-bold text-sm">{t("rackSize")}</p>
            <span className="text-cyan-400 text-2xl font-display font-black tabular-nums leading-none">
              {rackSize}
            </span>
          </div>

          <div className="p-4 space-y-4">
            {/* Slider */}
            <div className="space-y-1.5">
              <input
                type="range"
                min={MIN_RACK_SIZE}
                max={maxRack}
                step={1}
                value={rackSize}
                onChange={(e) => setRackSize(Number(e.target.value))}
                className="w-full accent-cyan-500"
                aria-label={t("rackSize")}
              />
              <div className="flex items-center justify-between text-[10px] text-surface-700 font-mono">
                <span>{MIN_RACK_SIZE}</span>
                <span>{maxRack}</span>
              </div>
            </div>

            {/* Quick-select */}
            {quickSizes.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {quickSizes.map((size) => {
                  const isSelected = rackSize === size;
                  return (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setRackSize(size)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        isSelected
                          ? "bg-cyan-500 text-white"
                          : "bg-surface-800/80 text-surface-400 hover:bg-surface-700/80 hover:text-white"
                      }`}
                      style={
                        isSelected
                          ? { boxShadow: "0 0 12px rgba(6,182,212,0.35)" }
                          : undefined
                      }
                    >
                      {size}
                    </button>
                  );
                })}
              </div>
            )}

            <p className="text-surface-600 text-xs">
              {t("rackHint", { count: rackSize })}
            </p>
          </div>
        </div>

        {/* ── Lancer ── */}
        <button
          type="button"
          onClick={handleLaunch}
          disabled={launching || cardCount < MIN_RACK_SIZE}
          className="w-full py-5 rounded-2xl font-display font-bold text-xl text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
          style={{
            background: "linear-gradient(135deg, #06b6d4, #0891b2)",
            boxShadow:
              launching || cardCount < MIN_RACK_SIZE
                ? "none"
                : "0 0 28px rgba(6,182,212,0.35)",
          }}
        >
          {launching ? t("preparing") : t("startGame")}
        </button>

      </div>
    </div>
  );
}
