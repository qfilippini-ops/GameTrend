"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import Header from "@/components/layout/Header";
import PresetPicker from "@/components/PresetPicker";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { DYP_META } from "@/games/dyp/config";
import { DEFAULT_CONFIG, createGame, getValidBracketSizes } from "@/games/dyp/engine";
import type { DYPConfig } from "@/types/games";
import type { Preset } from "@/types/database";

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
        .select("*")
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
          <div className="px-4 py-3 border-b border-surface-800/50">
            <p className="text-white font-display font-bold text-sm">Preset</p>
          </div>
          <div className="p-4 space-y-3">
            <PresetPicker
              gameType="dyp"
              selectedIds={selectedPresetId ? [selectedPresetId] : []}
              onChange={(ids) => setSelectedPresetId(ids[0] ?? "")}
              onPresetsChange={(presets) => setSelectedPreset(presets[0] ?? null)}
              userId={user?.id}
              label="Mes presets DYP"
              maxSelections={1}
            />
            {!selectedPresetId && (
              <div className="flex items-center justify-between pt-1">
                <p className="text-surface-700 text-xs">
                  Cartes par défaut ({DEFAULT_CONFIG.cards.length})
                </p>
                <Link
                  href="/presets/new?game=dyp"
                  className="text-amber-400/80 text-xs font-medium hover:text-amber-300 transition-colors"
                >
                  + Créer un preset
                </Link>
              </div>
            )}
            {selectedPreset && (
              <div className="flex items-center justify-between pt-1">
                <p className="text-surface-600 text-xs">
                  {cardCount} carte{cardCount > 1 ? "s" : ""} dans ce preset
                </p>
                <Link
                  href={`/presets/${selectedPresetId}`}
                  className="text-surface-600 text-xs hover:text-surface-400 transition-colors"
                >
                  Voir →
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* ── Taille du tournoi ── */}
        <div className="rounded-2xl border border-surface-700/40 bg-surface-900/50 overflow-hidden">
          <div className="px-4 py-3 border-b border-surface-800/50 flex items-center justify-between">
            <p className="text-white font-display font-bold text-sm">Taille du tournoi</p>
            {bracketSize > 1 && (
              <span className="text-amber-400/70 text-xs font-mono">
                {Math.round(totalRounds)} round{totalRounds > 1 ? "s" : ""}
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
              {bracketSize} cartes tirées au sort
              {cardCount > bracketSize ? ` parmi ${cardCount} disponibles` : ""}
              {bracketSize > 1 ? ` · ${Math.round(totalRounds)} round${totalRounds > 1 ? "s" : ""}` : ""}
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
          {launching ? "Préparation…" : "⚡ Lancer le tournoi"}
        </motion.button>

      </div>
    </div>
  );
}
