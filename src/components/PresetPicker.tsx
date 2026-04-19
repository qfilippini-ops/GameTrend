"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { PRESET_LIST_SEARCH_COLS } from "@/lib/supabase/columns";
import type { Preset } from "@/types/database";

interface PresetPickerProps {
  /** Filtrer par jeu — défaut : "ghostword" */
  gameType?: string;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  /** Appelé avec les objets Preset complets à chaque changement de sélection */
  onPresetsChange?: (presets: Preset[]) => void;
  userId?: string | null;
  label?: string;
  /** 1 = sélection unique (radio), indéfini = multi-sélection */
  maxSelections?: number;
}

export default function PresetPicker({
  gameType = "ghostword",
  selectedIds,
  onChange,
  onPresetsChange,
  userId,
  label = "Presets favoris",
  maxSelections,
}: PresetPickerProps) {
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState<Preset[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Preset[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Charger les favoris
  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    supabase
      .from("preset_likes")
      .select("preset_id")
      .eq("user_id", userId)
      .then(async ({ data }) => {
        const ids = (data ?? []).map((l: { preset_id: string }) => l.preset_id);
        setFavoriteIds(new Set(ids));
        if (ids.length === 0) { setFavorites([]); return; }
        const { data: presets } = await supabase
          .from("presets")
          .select(PRESET_LIST_SEARCH_COLS)
          .in("id", ids)
          .eq("game_type", gameType);
        setFavorites((presets ?? []) as Preset[]);
      });
  }, [userId]);

  // Recherche avec debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = searchQuery.trim();
    if (!q) { setSearchResults([]); setSearching(false); return; }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("presets")
        .select(PRESET_LIST_SEARCH_COLS)
        .eq("game_type", gameType)
        .ilike("name", `%${q}%`)
        .order("play_count", { ascending: false })
        .limit(24);

      // Filtre client-side supplémentaire sur familles et mots
      const qLow = q.toLowerCase();
      const all: Preset[] = (data ?? []) as Preset[];
      const extra = all.filter((p) => {
        const cfg = p.config as { families?: Array<{ name: string; words?: Array<{ name: string }> }> } | null;
        if (!cfg?.families) return false;
        return cfg.families.some(
          (f) =>
            f.name?.toLowerCase().includes(qLow) ||
            f.words?.some((w) => w.name?.toLowerCase().includes(qLow))
        );
      });
      // Union sans doublon
      const merged = [...all, ...extra.filter((e) => !all.some((a) => a.id === e.id))];
      setSearchResults(merged);
      setSearching(false);
    }, 300);
  }, [searchQuery]);

  async function toggleFavorite(e: React.MouseEvent, presetId: string) {
    e.stopPropagation();
    if (!userId) return;
    const supabase = createClient();
    if (favoriteIds.has(presetId)) {
      await supabase.from("preset_likes").delete().eq("user_id", userId).eq("preset_id", presetId);
      setFavoriteIds((prev) => { const n = new Set(prev); n.delete(presetId); return n; });
      setFavorites((prev) => prev.filter((p) => p.id !== presetId));
    } else {
      await supabase.from("preset_likes").insert({ user_id: userId, preset_id: presetId });
      setFavoriteIds((prev) => new Set([...prev, presetId]));
      // Ajouter aux favoris si présent dans les résultats de recherche
      const found = searchResults.find((p) => p.id === presetId);
      if (found) setFavorites((prev) => [...prev, found]);
    }
  }

  function toggle(preset: Preset) {
    let newIds: string[];
    if (maxSelections === 1) {
      // Sélection unique : remplace ou désélectionne
      newIds = selectedIds[0] === preset.id ? [] : [preset.id];
    } else {
      newIds = selectedIds.includes(preset.id)
        ? selectedIds.filter((x) => x !== preset.id)
        : [...selectedIds, preset.id];
    }
    onChange(newIds);
    if (onPresetsChange) {
      const allKnown = [...favorites, ...searchResults];
      const selected = newIds
        .map((id) => allKnown.find((p) => p.id === id))
        .filter(Boolean) as Preset[];
      onPresetsChange(selected);
    }
  }

  const isSearching = searchQuery.trim().length > 0;
  const displayList = isSearching ? searchResults : favorites;

  return (
    <div className="space-y-3">

      {/* ── Barre de recherche ── */}
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-600 text-sm pointer-events-none">🔍</div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Chercher un preset par nom, famille ou mot…"
          className="w-full bg-surface-800/60 border border-surface-700/40 focus:border-brand-500/70 text-white placeholder-surface-600 rounded-xl pl-9 pr-8 py-2.5 text-sm outline-none transition-all"
        />
        {searchQuery && (
          <button type="button" onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-600 hover:text-white text-sm">
            ✕
          </button>
        )}
      </div>

      {/* ── Section favoris (toujours visible si pas de recherche) ── */}
      {!isSearching && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-bold text-white text-base flex items-center gap-1.5">
              <span className="text-amber-400">★</span> {label}
            </h2>
            <div className="flex items-center gap-3">
              {selectedIds.length > 0 && (
                <button type="button" onClick={() => onChange([])}
                  className="text-surface-600 hover:text-surface-400 text-xs transition-colors">
                  Tout désélectionner
                </button>
              )}
              <Link href="/presets" className="text-brand-400 text-xs hover:text-brand-300 font-medium">
                Voir tout
              </Link>
            </div>
          </div>

          {selectedIds.length > 0 && maxSelections !== 1 && (
            <p className="text-xs text-brand-400/80">
              {selectedIds.length} preset{selectedIds.length > 1 ? "s" : ""} sélectionné{selectedIds.length > 1 ? "s" : ""} · l&apos;un sera tiré au sort
            </p>
          )}

          {favorites.length === 0 ? (
            <div className="py-2 space-y-2">
              <p className="text-surface-600 text-xs">
                {userId
                  ? "Aucun favori — utilise la recherche ci-dessus"
                  : "Connecte-toi pour voir tes favoris"}
              </p>
              {userId && (
                <Link
                  href={`/presets/new?game=${gameType}`}
                  className="inline-flex items-center gap-1.5 text-brand-400 text-xs font-medium hover:text-brand-300 transition-colors"
                >
                  ✨ Créer un preset {gameType === "ghostword" ? "GhostWord" : gameType === "dyp" ? "DYP" : gameType}
                </Link>
              )}
            </div>
          ) : (
            <PresetCardList
              presets={favorites}
              selectedIds={selectedIds}
              favoriteIds={favoriteIds}
              onToggleSelect={toggle}
              onToggleFavorite={userId ? toggleFavorite : undefined}
              showFavBadge
            />
          )}
        </div>
      )}

      {/* ── Résultats de recherche ── */}
      {isSearching && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-surface-400 text-xs font-medium">
              {searching ? "Recherche…" : `${searchResults.length} résultat${searchResults.length !== 1 ? "s" : ""}`}
            </p>
            {selectedIds.length > 0 && (
              <button type="button" onClick={() => onChange([])}
                className="text-surface-600 hover:text-surface-400 text-xs transition-colors">
                Tout désélectionner
              </button>
            )}
          </div>

          {selectedIds.length > 0 && maxSelections !== 1 && (
            <p className="text-xs text-brand-400/80">
              {selectedIds.length} preset{selectedIds.length > 1 ? "s" : ""} sélectionné{selectedIds.length > 1 ? "s" : ""} · l&apos;un sera tiré au sort
            </p>
          )}

          {searching ? (
            <div className="flex justify-center py-4">
              <p className="text-surface-600 text-xs animate-pulse">Recherche en cours…</p>
            </div>
          ) : searchResults.length === 0 ? (
            <p className="text-surface-600 text-xs py-2">Aucun preset ne correspond</p>
          ) : (
            <PresetCardList
              presets={searchResults}
              selectedIds={selectedIds}
              favoriteIds={favoriteIds}
              onToggleSelect={toggle}
              onToggleFavorite={userId ? toggleFavorite : undefined}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Sous-composant : grille de cartes ──────────────────────────
interface PresetCardListProps {
  presets: Preset[];
  selectedIds: string[];
  favoriteIds: Set<string>;
  onToggleSelect: (preset: Preset) => void;
  onToggleFavorite?: (e: React.MouseEvent, id: string) => void;
  showFavBadge?: boolean;
}

function PresetCardList({
  presets,
  selectedIds,
  favoriteIds,
  onToggleSelect,
  onToggleFavorite,
  showFavBadge,
}: PresetCardListProps) {
  return (
    <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-4 px-4 snap-x snap-mandatory">
      <AnimatePresence>
        {presets.map((preset) => {
          const isSelected = selectedIds.includes(preset.id);
          const isFav = favoriteIds.has(preset.id);
          return (
            <motion.div
              key={preset.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative shrink-0 snap-start"
            >
              <button
                type="button"
                onClick={() => onToggleSelect(preset)}
                className={`w-32 rounded-2xl border-2 transition-all text-left overflow-hidden ${
                  isSelected
                    ? "border-brand-500 shadow-neon-sm-brand"
                    : "border-surface-700/50 hover:border-surface-500/60"
                }`}
              >
                <div className="relative w-full bg-gradient-to-br from-brand-950/60 to-ghost-950/60" style={{ aspectRatio: "16/9" }}>
                  {preset.cover_url ? (
                    <Image src={preset.cover_url} alt={preset.name} fill className="object-cover" unoptimized />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-2xl opacity-20">👻</div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-surface-950/70 to-transparent" />
                  {isSelected && (
                    <div className="absolute inset-0 bg-brand-500/20 flex items-center justify-center">
                      <div className="w-6 h-6 rounded-full bg-brand-500 flex items-center justify-center text-white font-bold text-xs glow-brand">✓</div>
                    </div>
                  )}
                  {showFavBadge && isFav && (
                    <div className="absolute top-1 right-1 text-amber-400 text-xs drop-shadow">★</div>
                  )}
                </div>
                <div className="px-2 py-1.5 bg-surface-900/80">
                  <p className="text-xs font-display font-bold text-white leading-none mb-0.5 truncate">{preset.name}</p>
                  <p className="text-xs text-surface-600">{preset.play_count ?? 0} parties</p>
                </div>
              </button>

              {/* Bouton favori — visible sur les résultats de recherche */}
              {onToggleFavorite && (
                <button
                  type="button"
                  onClick={(e) => onToggleFavorite(e, preset.id)}
                  title={isFav ? "Retirer des favoris" : "Ajouter aux favoris"}
                  className={`absolute top-1 left-1 w-6 h-6 rounded-lg flex items-center justify-center text-xs transition-all ${
                    isFav
                      ? "bg-amber-900/80 text-amber-400 border border-amber-600/40"
                      : "bg-surface-900/80 text-surface-500 border border-surface-700/40 hover:text-amber-400 hover:border-amber-600/40"
                  }`}
                >
                  {isFav ? "★" : "☆"}
                </button>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
