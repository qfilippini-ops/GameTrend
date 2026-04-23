"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import Header from "@/components/layout/Header";
import PresetPicker from "@/components/PresetPicker";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { Link } from "@/i18n/navigation";
import { DYP_META } from "@/games/dyp/config";
import { DEFAULT_CONFIG, createGame, getValidBracketSizes } from "@/games/dyp/engine";
import type { DYPConfig } from "@/types/games";
import type { Preset } from "@/types/database";
import { PRESET_FULL_COLS } from "@/lib/supabase/columns";

const STORAGE_KEY = "dyp:lobby";
const GAME_KEY = "dyp:current_game";

function loadLobby(): { presetId: string; bracketSize: number } {
  if (typeof window === "undefined") return { presetId: "", bracketSize: 8 };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { presetId: "", bracketSize: 8 };
  } catch {
    return { presetId: "", bracketSize: 8 };
  }
}

export default function DYPLobbyPage() {
  return (
    <Suspense fallback={null}>
      <DYPLobbyPageContent />
    </Suspense>
  );
}

function DYPLobbyPageContent() {
  const t = useTranslations("games.dyp.lobby");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null);
  const [bracketSize, setBracketSize] = useState(8);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    setMounted(true);
    const urlPresetId = searchParams.get("presetId");
    const saved = loadLobby();
    const presetId = urlPresetId ?? saved.presetId;
    setSelectedPresetId(presetId);
    setBracketSize(saved.bracketSize);

    // Bug fix : charger le preset immédiatement si presetId vient de l'URL
    // afin que validSizes soit calculé avec le bon nombre de cartes dès le montage
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ presetId: selectedPresetId, bracketSize }));
  }, [mounted, selectedPresetId, bracketSize]);

  const presetConfig: DYPConfig | null = selectedPreset?.config
    ? (selectedPreset.config as unknown as DYPConfig)
    : null;

  const cardCount = presetConfig ? presetConfig.cards.length : DEFAULT_CONFIG.cards.length;
  const validSizes = getValidBracketSizes(cardCount);

  // Recaler bracketSize si le preset change et rend la taille actuelle invalide
  useEffect(() => {
    if (!validSizes.includes(bracketSize)) {
      setBracketSize(validSizes[validSizes.length - 1] ?? 2);
    }
  }, [selectedPresetId, validSizes, bracketSize]);

  async function handleLaunch() {
    setLaunching(true);
    let config = DEFAULT_CONFIG;
    let presetId: string | undefined;

    if (selectedPresetId) {
      const supabase = createClient();
      const { data } = await supabase
        .from("presets")
        .select("config")
        .eq("id", selectedPresetId)
        .maybeSingle();
      if (data?.config) {
        config = data.config as unknown as DYPConfig;
        presetId = selectedPresetId;
      }
    }

    const gameState = createGame(config, bracketSize, presetId);
    localStorage.setItem(GAME_KEY, JSON.stringify(gameState));
    router.push("/games/dyp/play");
  }

  if (!mounted) return null;

  const totalRounds = bracketSize > 1 ? Math.log2(bracketSize) : 0;

  return (
    <div className="bg-surface-950 bg-grid min-h-screen">
      <Header title={DYP_META.name} backHref="/" />

      <div className="px-4 py-5 space-y-4 max-w-lg mx-auto">

        {/* ── Hero ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative rounded-3xl overflow-hidden border border-amber-700/20 bg-gradient-to-br from-amber-950/70 via-surface-900 to-brand-950/60 p-5"
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: "radial-gradient(circle at 50% 0%, rgba(245,158,11,0.12) 0%, transparent 65%)" }}
          />
          <div className="relative z-10 flex items-start gap-4">
            <div className="text-5xl shrink-0 animate-float">{DYP_META.icon}</div>
            <div className="min-w-0">
              <h1 className="font-display font-black text-white text-2xl leading-tight mb-1">{DYP_META.name}</h1>
              <p className="text-surface-400 text-sm leading-relaxed">{DYP_META.description}</p>
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {DYP_META.tags.map((t) => (
                  <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300/70 border border-amber-700/20">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── Preset ── */}
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
                  href="/presets/new?game=dyp"
                  className="text-amber-400/80 text-xs font-medium hover:text-amber-300 transition-colors"
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

        {/* ── Taille du tournoi ── */}
        <div className="rounded-2xl border border-surface-700/40 bg-surface-900/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-800/50 flex items-center justify-between">
            <p className="text-white font-display font-bold text-sm">{t("tournamentSize")}</p>
            {bracketSize > 1 && (
              <span className="text-amber-400/70 text-xs font-mono">
                {t("rounds", { count: Math.round(totalRounds) })}
              </span>
            )}
          </div>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-4 gap-2">
              {[2, 4, 8, 16, 32, 64, 128].map((size) => {
                const available = validSizes.includes(size);
                const isSelected = bracketSize === size;
                return (
                  <button
                    key={size}
                    type="button"
                    disabled={!available}
                    onClick={() => setBracketSize(size)}
                    className={`py-3 rounded-xl text-sm font-bold transition-all ${
                      isSelected
                        ? "bg-amber-500 text-white"
                        : available
                        ? "bg-surface-800/80 text-surface-300 hover:bg-surface-700/80 hover:text-white"
                        : "bg-surface-900/30 text-surface-800 cursor-not-allowed"
                    }`}
                    style={isSelected ? { boxShadow: "0 0 16px rgba(245,158,11,0.35)" } : undefined}
                  >
                    {size}
                  </button>
                );
              })}
            </div>

            <p className="text-surface-600 text-xs">
              {t("drawnCards", { size: bracketSize })}
              {cardCount > bracketSize ? t("amongAvailable", { count: cardCount }) : ""}
              {bracketSize > 1 ? t("andRounds", { count: Math.round(totalRounds) }) : ""}
            </p>
          </div>
        </div>

        {/* ── Lancer ── */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleLaunch}
          disabled={launching || validSizes.length === 0}
          className="w-full py-5 rounded-2xl font-display font-bold text-xl text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: "linear-gradient(135deg, #f59e0b, #d97706)",
            boxShadow: launching || validSizes.length === 0 ? "none" : "0 0 28px rgba(245,158,11,0.35)",
          }}
        >
          {launching ? t("preparing") : t("startTournament")}
        </motion.button>

        {/* ── Jouer en ligne ── */}
        <Link
          href="/games/dyp/online"
          className="block w-full py-4 rounded-2xl font-display font-bold text-base text-center border border-amber-700/40 bg-amber-950/30 text-amber-200 hover:bg-amber-900/40 hover:border-amber-600/50 transition-all"
        >
          {t("playOnline")}
        </Link>

      </div>
    </div>
  );
}
