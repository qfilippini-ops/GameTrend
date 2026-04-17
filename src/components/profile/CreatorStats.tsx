"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";

interface CreatorStatsProps {
  userId: string;
  followersCount: number;
}

interface TopPreset {
  id: string;
  name: string;
  play_count: number;
  cover_url: string | null;
  game_type: string;
}

export default function CreatorStats({ userId, followersCount }: CreatorStatsProps) {
  const [totalPlays, setTotalPlays] = useState<number | null>(null);
  const [presetsCount, setPresetsCount] = useState(0);
  const [topPreset, setTopPreset] = useState<TopPreset | null>(null);
  const [recentPlays, setRecentPlays] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      // Tous les presets publics du créateur
      const { data: presets } = await supabase
        .from("presets")
        .select("id, name, play_count, cover_url, game_type")
        .eq("author_id", userId)
        .eq("is_public", true);

      const list = (presets as TopPreset[] | null) ?? [];

      const total = list.reduce((acc, p) => acc + (p.play_count ?? 0), 0);
      setTotalPlays(total);
      setPresetsCount(list.length);

      const top = [...list].sort((a, b) => (b.play_count ?? 0) - (a.play_count ?? 0))[0] ?? null;
      setTopPreset(top);

      // Croissance : nb de parties enregistrées sur les 7 derniers jours via game_results
      if (list.length > 0) {
        const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
        const { count } = await supabase
          .from("game_results")
          .select("id", { count: "exact", head: true })
          .in("preset_id", list.map((p) => p.id))
          .gte("created_at", since);
        setRecentPlays(count ?? 0);
      }

      setLoading(false);
    }
    load();
  }, [userId]);

  if (loading) return null;
  if (presetsCount === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl border border-brand-700/25 bg-gradient-to-br from-brand-950/40 via-surface-900/60 to-ghost-950/30 p-4 space-y-3 overflow-hidden relative"
    >
      <div className="absolute -top-10 -right-10 w-32 h-32 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="flex items-center gap-2">
        <span className="text-lg">⭐</span>
        <p className="text-white font-display font-bold text-sm">Stats créateur</p>
      </div>

      {/* Métriques */}
      <div className="grid grid-cols-3 gap-2 relative">
        <Stat label="Parties" value={totalPlays ?? 0} accent="brand" />
        <Stat label="Abonnés" value={followersCount} accent="ghost" />
        <Stat label="7 jours" value={recentPlays} accent="brand" suffix={recentPlays > 0 ? "↗" : ""} />
      </div>

      {/* Top preset */}
      {topPreset && (topPreset.play_count ?? 0) > 0 && (
        <Link
          href={`/presets/${topPreset.id}`}
          className="flex items-center gap-3 rounded-2xl bg-surface-900/60 border border-surface-800/50 p-2.5 hover:bg-surface-800/50 transition-colors group"
        >
          <div className="w-12 h-12 rounded-xl overflow-hidden bg-surface-800 shrink-0 relative">
            {topPreset.cover_url ? (
              <Image src={topPreset.cover_url} alt={topPreset.name} fill className="object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xl">🎮</div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-amber-400 font-bold uppercase tracking-wider mb-0.5">🏆 Preset le + populaire</p>
            <p className="text-white text-sm font-semibold truncate group-hover:text-brand-300 transition-colors">{topPreset.name}</p>
            <p className="text-surface-500 text-xs">{topPreset.play_count} parties</p>
          </div>
        </Link>
      )}
    </motion.div>
  );
}

function Stat({ label, value, accent, suffix }: { label: string; value: number; accent: "brand" | "ghost"; suffix?: string }) {
  const color = accent === "brand" ? "#6b89ff" : "#e879f9";
  const shadow = accent === "brand" ? "rgba(68,96,255,0.5)" : "rgba(217,70,239,0.5)";
  return (
    <div className="rounded-2xl bg-surface-900/60 border border-surface-800/40 p-2.5 flex flex-col items-center">
      <span
        className="text-xl font-display font-bold leading-none"
        style={{ color, textShadow: `0 0 18px ${shadow}` }}
      >
        {value}{suffix && <span className="text-emerald-400 text-sm ml-1">{suffix}</span>}
      </span>
      <span className="text-[10px] text-surface-500 font-medium mt-1 uppercase tracking-wider">{label}</span>
    </div>
  );
}
