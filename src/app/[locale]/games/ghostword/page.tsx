"use client";

import { useState, useEffect } from "react";
import { useRouter, Link } from "@/i18n/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import Header from "@/components/layout/Header";
import PresetPicker from "@/components/PresetPicker";
import { vibrate } from "@/lib/utils";
import { GHOSTWORD_META } from "@/games/ghostword/config";
import { useAuth } from "@/hooks/useAuth";

const LS_KEY = "ghostword:lobby";

interface LobbyState {
  playerNames: string[];
  selectedPresetIds: string[];
  ombrePercent: number;
  discussionTurns: number;
}

function loadLobbyState(): LobbyState | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LobbyState;
  } catch {
    return null;
  }
}

function saveLobbyState(state: LobbyState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    // localStorage peut être bloqué dans certains contextes
  }
}

export default function GhostWordLobby() {
  const t = useTranslations("games.ghostword");
  const router = useRouter();
  const { user } = useAuth();

  const [playerNames, setPlayerNames] = useState<string[]>(["", "", ""]);
  const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>([]);
  const [ombrePercent, setOmbrePercent] = useState(90);
  const [discussionTurns, setDiscussionTurns] = useState(2);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    const saved = loadLobbyState();
    if (saved) {
      if (saved.playerNames?.length >= 3) setPlayerNames(saved.playerNames);
      if (saved.selectedPresetIds) setSelectedPresetIds(saved.selectedPresetIds);
      if (typeof saved.ombrePercent === "number") setOmbrePercent(saved.ombrePercent);
      if (typeof saved.discussionTurns === "number") setDiscussionTurns(saved.discussionTurns);
      setRestored(true);
    }
  }, []);


  function addPlayer() {
    if (playerNames.length >= 12) return;
    vibrate(30);
    setPlayerNames((names) => [...names, ""]);
  }

  function removePlayer(index: number) {
    if (playerNames.length <= 3) return;
    vibrate(30);
    setPlayerNames((names) => names.filter((_, i) => i !== index));
  }

  function updateName(index: number, value: string) {
    setPlayerNames((names) => names.map((n, i) => (i === index ? value : n)));
  }

  function startGame() {
    const validNames = playerNames.map((n) => n.trim()).filter(Boolean);
    if (validNames.length < 3) return;
    vibrate([50, 30, 100]);
    saveLobbyState({ playerNames, selectedPresetIds, ombrePercent, discussionTurns });
    const params = new URLSearchParams({ players: JSON.stringify(validNames) });
    if (selectedPresetIds.length > 0) params.set("presetIds", selectedPresetIds.join(","));
    params.set("ombrePercent", String(ombrePercent));
    params.set("discussionTurns", String(discussionTurns));
    router.push(`/games/ghostword/play?${params.toString()}`);
  }

  const validCount = playerNames.filter((n) => n.trim()).length;
  const canStart = validCount >= 3;
  const videPercent = 100 - ombrePercent;
  const hasCustomParams = ombrePercent !== 90 || discussionTurns !== 2;

  return (
    <div className="min-h-screen bg-surface-950 bg-grid">
      <Header title={t("title")} backHref="/" />

      <div className="px-4 pt-4 pb-8 space-y-4">

        {/* Bandeau restauration */}
        <AnimatePresence>
          {restored && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-950/50 border border-brand-700/30 text-brand-300 text-xs"
            >
              <span>↩</span>
              <span className="flex-1 font-medium">{t("restored")}</span>
              <button
                onClick={() => {
                  setPlayerNames(["", "", ""]);
                  setSelectedPresetIds([]);
                  setOmbrePercent(90);
                  setDiscussionTurns(2);
                  setRestored(false);
                  localStorage.removeItem(LS_KEY);
                }}
                className="text-brand-400 hover:text-white underline"
              >
                {t("reset")}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Game info card — bento hero */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative rounded-3xl overflow-hidden border border-brand-700/25 bg-gradient-to-br from-brand-950/90 via-surface-900 to-ghost-950/90 p-5"
        >
          <div className="absolute -top-8 -right-8 w-40 h-40 bg-brand-600/12 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-8 -left-8 w-40 h-40 bg-ghost-600/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative flex items-center gap-4">
            <div className="text-5xl animate-float">{GHOSTWORD_META.icon}</div>
            <div>
              <h1 className="font-display font-bold text-white text-2xl mb-0.5">
                {GHOSTWORD_META.name}
              </h1>
              <p className="text-surface-400 text-xs mb-2 leading-relaxed">
                {GHOSTWORD_META.description}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-brand-500/15 text-brand-300 border border-brand-500/20 font-medium">
                  👥 {t("playersRange", { min: GHOSTWORD_META.minPlayers, max: GHOSTWORD_META.maxPlayers })}
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-ghost-500/15 text-ghost-300 border border-ghost-500/20 font-medium">
                  ⏱ {GHOSTWORD_META.estimatedDuration}
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Joueurs */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-2xl border border-surface-700/40 bg-surface-900/50 p-4 space-y-3"
        >
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-display font-bold text-white text-base">
              {t("players")}
            </h2>
            <span className="text-xs font-mono text-surface-500">
              {validCount} / 12
            </span>
          </div>

          <AnimatePresence>
            {playerNames.map((name, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16, height: 0 }}
                transition={{ delay: i * 0.02 }}
                className="flex items-center gap-2"
              >
                <div className="w-8 h-8 rounded-xl bg-surface-800 border border-surface-700/60 flex items-center justify-center text-surface-500 font-display font-bold text-xs shrink-0">
                  {i + 1}
                </div>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => updateName(i, e.target.value)}
                  placeholder={t("playerNamePlaceholder", { n: i + 1 })}
                  maxLength={20}
                  className="flex-1 bg-surface-800/60 border border-surface-700/40 focus:border-brand-500/70 focus:shadow-neon-sm-brand text-white placeholder-surface-600 rounded-xl px-3 py-2.5 text-sm outline-none transition-all"
                />
                {playerNames.length > 3 && (
                  <button
                    onClick={() => removePlayer(i)}
                    className="w-8 h-8 flex items-center justify-center rounded-xl text-surface-600 hover:text-red-400 hover:bg-red-950/30 transition-colors shrink-0 text-xs"
                  >
                    ✕
                  </button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {playerNames.length < 12 && (
            <button
              onClick={addPlayer}
              className="w-full py-2.5 rounded-xl border border-dashed border-surface-700/50 hover:border-brand-500/50 text-surface-500 hover:text-brand-400 text-sm font-medium transition-all"
            >
              {t("addPlayer")}
            </button>
          )}
        </motion.div>

        {/* Presets */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl border border-surface-700/40 bg-surface-900/50 p-4"
        >
          <PresetPicker
            selectedIds={selectedPresetIds}
            onChange={setSelectedPresetIds}
            userId={user?.id}
            label={t("favoritePresets")}
          />
        </motion.div>

        {/* Paramètres avancés */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="rounded-2xl border border-surface-700/40 bg-surface-900/50 overflow-hidden"
        >
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-800/30 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-colors ${showAdvanced ? "bg-brand-600/20 text-brand-300" : "bg-surface-800 text-surface-400"}`}>
                ⚙
              </div>
              <span className="text-white font-semibold text-sm">{t("advancedSettings")}</span>
              {hasCustomParams && (
                <span className="w-1.5 h-1.5 rounded-full bg-brand-400 inline-block shadow-neon-sm-brand" />
              )}
            </div>
            <span className={`text-surface-500 text-sm transition-transform duration-200 ${showAdvanced ? "rotate-180" : ""}`}>
              ▼
            </span>
          </button>

          <AnimatePresence>
            {showAdvanced && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-4 space-y-4 border-t border-surface-700/30">
                  {/* Rôle spécial */}
                  <div className="pt-4 space-y-3">
                    <p className="text-white font-semibold text-sm">{t("specialRole")}</p>

                    {/* Barre visuelle Ombre / Vide */}
                    <div className="flex rounded-xl overflow-hidden h-9 text-xs font-bold border border-surface-700/40">
                      <div
                        className="bg-ghost-800/80 flex items-center justify-center text-ghost-200 transition-all"
                        style={{ width: `${ombrePercent}%` }}
                      >
                        {ombrePercent >= 20 && `👻 ${ombrePercent}%`}
                      </div>
                      <div
                        className="bg-surface-800 flex items-center justify-center text-surface-400 transition-all"
                        style={{ width: `${videPercent}%` }}
                      >
                        {videPercent >= 15 && `💨 ${videPercent}%`}
                      </div>
                    </div>

                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={ombrePercent}
                      onChange={(e) => setOmbrePercent(Number(e.target.value))}
                      className="w-full accent-brand-500"
                    />

                    <div className="flex justify-between text-xs text-surface-600">
                      <span>{t("vide100")}</span>
                      <span className={ombrePercent !== 90 ? "text-brand-400 font-medium" : "text-surface-600"}>
                        {ombrePercent === 90 ? t("default") : t("custom")}
                      </span>
                      <span>{t("ombre100")}</span>
                    </div>
                  </div>

                  {/* Tours de discussion */}
                  <div className="space-y-3">
                    <div>
                      <p className="text-white font-semibold text-sm">{t("discussionTurns")}</p>
                      <p className="text-surface-500 text-xs mt-0.5">{t("discussionTurnsHint")}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        onClick={() => setDiscussionTurns((v) => Math.max(1, v - 1))}
                        disabled={discussionTurns <= 1}
                        className="w-10 h-10 rounded-xl bg-surface-800 border border-surface-700/40 hover:bg-surface-700 text-white font-bold text-lg flex items-center justify-center transition-colors disabled:opacity-30"
                      >
                        −
                      </button>
                      <div className="flex-1 text-center">
                        <span className="text-3xl font-display font-bold text-white">{discussionTurns}</span>
                        <p className="text-surface-500 text-xs mt-0.5">
                          {t("turnsBeforeVote", { n: discussionTurns })}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDiscussionTurns((v) => Math.min(6, v + 1))}
                        disabled={discussionTurns >= 6}
                        className="w-10 h-10 rounded-xl bg-surface-800 border border-surface-700/40 hover:bg-surface-700 text-white font-bold text-lg flex items-center justify-center transition-colors disabled:opacity-30"
                      >
                        +
                      </button>
                    </div>
                    {discussionTurns !== 2 && (
                      <button
                        type="button"
                        onClick={() => setDiscussionTurns(2)}
                        className="text-xs text-surface-600 hover:text-brand-400 transition-colors"
                      >
                        {t("resetDefault", { n: 2 })}
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* CTA Lancer — Pass-and-Play + En ligne */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-3"
        >
          {/* Pass-and-Play */}
          <motion.button
            onClick={startGame}
            disabled={!canStart}
            whileTap={{ scale: canStart ? 0.97 : 1 }}
            className={`w-full py-5 rounded-2xl font-display font-bold text-xl transition-all ${
              canStart
                ? "bg-gradient-brand text-white glow-brand hover:opacity-92"
                : "bg-surface-800 text-surface-600 cursor-not-allowed border border-surface-700/40"
            }`}
          >
            {canStart
              ? t("launch", { count: validCount })
              : t("needPlayers")}
          </motion.button>

          {/* Mode en ligne */}
          <Link
            href={`/games/ghostword/online?presetIds=${selectedPresetIds.join(",")}&ombrePercent=${ombrePercent}&discussionTurns=${discussionTurns}`}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl border border-surface-700/50 bg-surface-900/40 hover:border-brand-500/40 hover:bg-brand-950/30 text-surface-300 hover:text-white font-display font-bold transition-all text-base"
          >
            {t("createOnline")}
          </Link>
        </motion.div>

      </div>
    </div>
  );
}
