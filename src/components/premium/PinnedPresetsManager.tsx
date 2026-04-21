"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import PresetCard from "@/components/presets/PresetCard";
import { PRESET_LIST_COLS } from "@/lib/supabase/columns";
import type { Preset } from "@/types/database";

const MAX_PINS = 5;

/**
 * Manager des presets épinglés (premium).
 *
 * UI : grille des presets de l'auteur, on clique sur "Épingler" pour ajouter,
 * "Retirer" pour enlever. Réordering simple via flèches haut/bas (pas de
 * drag&drop pour rester léger sur mobile).
 *
 * Affiché dans la section "Mon abonnement" pour les premium.
 */
export default function PinnedPresetsManager() {
  const t = useTranslations("premium.pinned");
  const { user } = useAuth();
  const supabase = createClient();
  const [allPresets, setAllPresets] = useState<Preset[]>([]);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([
      supabase
        .from("presets")
        .select(PRESET_LIST_COLS)
        .eq("author_id", user.id)
        .is("archived_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("pinned_presets")
        .select("preset_id, position")
        .eq("user_id", user.id)
        .order("position", { ascending: true }),
    ]).then(([presetsRes, pinsRes]) => {
      if (cancelled) return;
      setAllPresets((presetsRes.data ?? []) as Preset[]);
      setPinnedIds((pinsRes.data ?? []).map((r: any) => r.preset_id as string));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  function togglePin(id: string) {
    setError(null);
    setSuccess(false);
    if (pinnedIds.includes(id)) {
      setPinnedIds((prev) => prev.filter((p) => p !== id));
    } else if (pinnedIds.length < MAX_PINS) {
      setPinnedIds((prev) => [...prev, id]);
    } else {
      setError(t("errors.maxReached", { max: MAX_PINS }));
    }
  }

  function move(id: string, direction: -1 | 1) {
    setPinnedIds((prev) => {
      const idx = prev.indexOf(id);
      if (idx === -1) return prev;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSuccess(false);
    const { error: rpcErr } = await supabase.rpc("set_pinned_presets", {
      preset_ids: pinnedIds,
    });
    if (rpcErr) {
      const msg = rpcErr.message;
      if (msg.includes("not_premium")) setError(t("errors.notPremium"));
      else if (msg.includes("too_many")) setError(t("errors.maxReached", { max: MAX_PINS }));
      else if (msg.includes("not_owner")) setError(t("errors.notOwner"));
      else setError(t("errors.generic"));
    } else {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    }
    setSaving(false);
  }

  if (loading) {
    return <div className="h-20 rounded-xl bg-surface-800/40 animate-pulse" />;
  }

  if (allPresets.length === 0) {
    return (
      <div className="rounded-xl bg-surface-800/40 border border-surface-700/40 p-4 text-center">
        <p className="text-surface-400 text-sm">{t("empty")}</p>
      </div>
    );
  }

  const pinnedSet = new Set(pinnedIds);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-surface-500 text-xs uppercase tracking-widest font-medium">
          {t("title")}
        </h3>
        <span className="text-surface-400 text-xs">
          {pinnedIds.length}/{MAX_PINS}
        </span>
      </div>

      {/* Liste des pins ordonnée */}
      {pinnedIds.length > 0 && (
        <div className="rounded-xl bg-surface-800/40 border border-surface-700/40 p-2 space-y-1">
          {pinnedIds.map((id, idx) => {
            const preset = allPresets.find((p) => p.id === id);
            if (!preset) return null;
            return (
              <div
                key={id}
                className="flex items-center gap-2 p-2 rounded-lg bg-surface-900/60"
              >
                <span className="text-brand-300 font-mono text-sm w-5 text-center">
                  {idx + 1}
                </span>
                <span className="flex-1 truncate text-white text-sm">{preset.name}</span>
                <button
                  onClick={() => move(id, -1)}
                  disabled={idx === 0}
                  className="w-7 h-7 rounded text-surface-400 hover:text-white disabled:opacity-30 transition-colors"
                  title={t("moveUp")}
                >
                  ↑
                </button>
                <button
                  onClick={() => move(id, 1)}
                  disabled={idx === pinnedIds.length - 1}
                  className="w-7 h-7 rounded text-surface-400 hover:text-white disabled:opacity-30 transition-colors"
                  title={t("moveDown")}
                >
                  ↓
                </button>
                <button
                  onClick={() => togglePin(id)}
                  className="w-7 h-7 rounded text-surface-400 hover:text-red-400 transition-colors"
                  title={t("unpin")}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Sélecteur dans le reste des presets */}
      <div className="grid grid-cols-2 gap-2">
        {allPresets
          .filter((p) => !pinnedSet.has(p.id))
          .slice(0, 12)
          .map((preset) => (
            <button
              key={preset.id}
              onClick={() => togglePin(preset.id)}
              className="text-left rounded-xl border border-surface-700/40 bg-surface-900/40 p-2 hover:border-brand-500/40 transition-colors"
            >
              <p className="text-white text-xs font-medium truncate">{preset.name}</p>
              <p className="text-surface-500 text-[10px] mt-0.5">{t("addCta")}</p>
            </button>
          ))}
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="w-full py-2.5 rounded-xl bg-gradient-brand text-white text-sm font-bold glow-brand disabled:opacity-50"
      >
        {saving ? "…" : t("save")}
      </button>

      {error && <p className="text-red-400 text-xs text-center">{error}</p>}
      {success && <p className="text-brand-300 text-xs text-center">{t("saved")}</p>}
    </div>
  );
}
