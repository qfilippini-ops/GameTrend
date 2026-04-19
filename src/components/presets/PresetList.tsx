"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import PresetCard from "@/components/presets/PresetCard";
import { GAMES_REGISTRY, getAdapter } from "@/games/registry";
import { PRESET_LIST_SEARCH_COLS } from "@/lib/supabase/columns";
import type { Preset } from "@/types/database";

const GAME_FILTERS = [
  { id: null, label: "Tous" },
  ...GAMES_REGISTRY.map((g) => ({ id: g.id, label: `${g.icon} ${g.name}` })),
];

type Sort = "popular" | "recent";

function matchesQuery(preset: Preset, q: string): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();

  if (preset.name.toLowerCase().includes(lower)) return true;
  if (preset.description?.toLowerCase().includes(lower)) return true;

  // Déléguer la recherche dans le config à l'adapter du jeu
  const adapter = getAdapter(preset.game_type ?? "ghostword");
  const strings = adapter.getSearchableStrings(preset.config);
  return strings.some((s) => s.toLowerCase().includes(lower));
}

export default function PresetList() {
  const { user } = useAuth();
  const [allPresets, setAllPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("popular");
  const [gameFilter, setGameFilter] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPresets() {
      setLoading(true);
      const supabase = createClient();

      let q = supabase
        .from("presets")
        .select(PRESET_LIST_SEARCH_COLS)
        .eq("is_public", true);

      if (gameFilter) q = q.eq("game_type", gameFilter);

      if (sort === "popular") {
        q = q.order("play_count", { ascending: false });
      } else {
        q = q.order("created_at", { ascending: false });
      }

      const { data } = await q.limit(100);
      setAllPresets((data ?? []) as Preset[]);
      setLoading(false);
    }

    fetchPresets();
  }, [sort, gameFilter]);

  const filtered = useMemo(
    () => allPresets.filter((p) => matchesQuery(p, query.trim())),
    [allPresets, query]
  );

  return (
    <div className="space-y-5">
      {/* Barre de recherche */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500 pointer-events-none">
          🔍
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nom, famille de mots, mot précis…"
          className="w-full bg-surface-800 border border-surface-600 focus:border-brand-500 text-white placeholder-surface-500 rounded-xl pl-10 pr-10 py-3 outline-none transition-colors text-sm"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-white transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      {/* Filtres — 2 rangées */}
      <div className="space-y-2">
        {/* Rangée 1 : tri Populaire / Récent */}
        <div className="flex gap-2">
          {(["popular", "recent"] as Sort[]).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
                sort === s
                  ? "bg-brand-600 text-white shadow-sm"
                  : "bg-surface-800/80 text-surface-400 hover:text-white border border-surface-700/40"
              }`}
            >
              {s === "popular" ? "🔥 Populaires" : "✨ Récents"}
            </button>
          ))}
        </div>

        {/* Rangée 2 : filtre par jeu — scroll horizontal, badges compacts */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
          {GAME_FILTERS.map((g) => {
            const isActive = gameFilter === g.id;
            return (
              <button
                key={String(g.id)}
                onClick={() => setGameFilter(g.id)}
                className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
                  isActive
                    ? "bg-ghost-700/30 text-ghost-200 border-ghost-600/50"
                    : "bg-surface-800/60 text-surface-500 border-surface-700/30 hover:text-surface-300 hover:border-surface-600/50"
                }`}
              >
                {g.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Résultat de recherche */}
      {query.trim() && (
        <p className="text-surface-500 text-xs">
          {filtered.length} résultat{filtered.length !== 1 ? "s" : ""} pour{" "}
          <span className="text-white font-medium">« {query.trim()} »</span>
        </p>
      )}

      {/* Grille */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl bg-surface-800/60 border border-surface-700/60 overflow-hidden animate-pulse"
            >
              <div className="h-32 bg-surface-700/60" />
              <div className="p-3 space-y-2">
                <div className="h-3 bg-surface-700 rounded w-3/4" />
                <div className="h-2 bg-surface-700/60 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((preset, i) => (
            <PresetCard
              key={preset.id}
              preset={preset}
              index={i}
              userId={user?.id ?? null}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">{query ? "🔍" : "📦"}</div>
          <p className="text-white font-bold text-lg mb-2">
            {query ? "Aucun résultat" : "Aucun preset trouvé"}
          </p>
          <p className="text-surface-400 text-sm mb-6">
            {query
              ? `Aucun preset ne correspond à « ${query} »`
              : "Sois le premier à créer un preset !"}
          </p>
          {!query && (
            <Link
              href="/presets/new"
              className="inline-block bg-brand-600 text-white font-bold px-6 py-3 rounded-2xl hover:bg-brand-500 transition-colors"
            >
              Créer un preset ✨
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
