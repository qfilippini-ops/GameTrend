"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import Header from "@/components/layout/Header";
import Avatar from "@/components/ui/Avatar";
import PresetCard from "@/components/presets/PresetCard";
import DeletePresetButton from "@/components/presets/DeletePresetButton";
import { useAuth } from "@/hooks/useAuth";
import EditProfileModal from "@/components/profile/EditProfileModal";
import type { Preset, Profile } from "@/types/database";

type Tab = "mes-presets" | "favoris";

export default function ProfilePage() {
  const router = useRouter();
  const { user, profile, loading, signOut, refreshProfile } = useAuth();
  const [localProfile, setLocalProfile] = useState<Partial<Profile>>({});
  const [editOpen, setEditOpen] = useState(false);
  const [myPresets, setMyPresets] = useState<Preset[]>([]);
  const [favoritePresets, setFavoritePresets] = useState<Preset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("mes-presets");

  const displayProfile = { ...profile, ...localProfile };

  useEffect(() => {
    if (!loading && (!user || user.is_anonymous)) {
      router.push("/auth/login?redirect=/profile");
    }
  }, [user, loading]);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();

    Promise.all([
      supabase
        .from("presets")
        .select("*")
        .eq("author_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("preset_likes")
        .select("preset_id")
        .eq("user_id", user.id),
    ]).then(async ([myRes, likesRes]) => {
      setMyPresets(myRes.data ?? []);
      const likedIds = (likesRes.data ?? []).map((l) => l.preset_id);
      if (likedIds.length > 0) {
        const { data: favData } = await supabase
          .from("presets")
          .select("*")
          .in("id", likedIds);
        setFavoritePresets(favData ?? []);
      }
      setPresetsLoading(false);
    });
  }, [user]);

  const stats = (profile?.stats as Record<string, number>) ?? {};

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <div className="text-4xl animate-pulse">👤</div>
      </div>
    );
  }

  if (!user || user.is_anonymous) return null;

  const currentPresets = activeTab === "mes-presets" ? myPresets : favoritePresets;

  const statItems = [
    { label: "Parties",  value: stats.games_played ?? 0, icon: "🎮" },
    { label: "Victoires", value: stats.wins ?? 0,          icon: "🏆" },
    { label: "Presets",  value: myPresets.length,          icon: "📦" },
    { label: "Favoris",  value: favoritePresets.length,    icon: "★"  },
  ];

  return (
    <div className="min-h-screen bg-surface-950 bg-grid">
      <Header
        title="Profil"
        actions={
          <button
            onClick={signOut}
            title="Déconnexion"
            className="w-9 h-9 flex items-center justify-center rounded-xl text-surface-500 hover:text-red-400 transition-colors hover:bg-red-950/30 border border-transparent hover:border-red-800/30"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        }
      />

      <div className="px-4 pt-4 pb-10 space-y-4">

        {/* ── Hero : bannière + avatar ─────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl overflow-hidden border border-surface-700/30 bg-surface-900/60"
        >
          {/* Bandeau */}
          <div className="relative h-24 bg-gradient-to-br from-brand-900 via-surface-800 to-ghost-950 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-brand-600/25 via-transparent to-ghost-600/20" />
            <div className="absolute -top-6 -left-6 w-32 h-32 bg-brand-500/15 rounded-full blur-2xl" />
            <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-ghost-500/15 rounded-full blur-2xl" />
          </div>

          {/* Avatar + infos */}
          <div className="px-5 pb-5">
            <div className="flex items-end justify-between -mt-8 mb-3">
              {/* Avatar avec ring */}
              <div className="ring-4 ring-surface-900 rounded-2xl">
                <Avatar
                  name={displayProfile?.username ?? user.email}
                  src={displayProfile?.avatar_url}
                  size="xl"
                />
              </div>

              {/* Bouton modifier */}
              <button
                onClick={() => setEditOpen(true)}
                className="mb-1 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border border-surface-700/50 text-surface-400 hover:text-white hover:border-brand-500/60 hover:bg-brand-950/30 transition-all font-medium"
              >
                ✏️ Modifier
              </button>
            </div>

            <div>
              <h1 className="text-xl font-display font-bold text-white leading-tight">
                {displayProfile?.username ?? "Joueur"}
              </h1>
              <p className="text-surface-600 text-xs mt-0.5 truncate">{user.email}</p>
              {displayProfile?.bio && (
                <p className="text-surface-400 text-sm mt-2.5 leading-relaxed line-clamp-3 border-t border-surface-800/60 pt-2.5">
                  {displayProfile.bio}
                </p>
              )}
            </div>
          </div>
        </motion.div>

        {editOpen && profile && (
          <EditProfileModal
            profile={{ ...profile, ...localProfile } as Profile}
            userId={user.id}
            onClose={() => setEditOpen(false)}
            onSaved={(updated) => {
              setLocalProfile((prev) => ({ ...prev, ...updated }));
              refreshProfile();
            }}
          />
        )}

        {/* ── Stats ────────────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="grid grid-cols-4 rounded-2xl overflow-hidden border border-surface-700/30 divide-x divide-surface-700/30"
        >
          {statItems.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.12 + i * 0.05 }}
              className="flex flex-col items-center justify-center py-3.5 px-1 bg-surface-900/50 hover:bg-surface-800/40 transition-colors"
            >
              <span className="text-lg leading-none mb-1">{stat.icon}</span>
              <span className="font-display font-bold text-white text-base leading-none">
                {stat.value}
              </span>
              <span className="text-surface-600 text-[10px] font-medium mt-0.5">
                {stat.label}
              </span>
            </motion.div>
          ))}
        </motion.div>

        {/* ── Tabs + presets ───────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16 }}
          className="space-y-4"
        >
          {/* Tabs */}
          <div className="flex bg-surface-900/60 border border-surface-700/30 rounded-2xl p-1 gap-1">
            <button
              onClick={() => setActiveTab("mes-presets")}
              className={`flex-1 py-2.5 rounded-xl text-sm font-display font-bold transition-all ${
                activeTab === "mes-presets"
                  ? "bg-gradient-brand text-white shadow-sm glow-brand"
                  : "text-surface-500 hover:text-white"
              }`}
            >
              📦 Mes presets
              {myPresets.length > 0 && (
                <span className="ml-1.5 text-xs opacity-60">({myPresets.length})</span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("favoris")}
              className={`flex-1 py-2.5 rounded-xl text-sm font-display font-bold transition-all ${
                activeTab === "favoris"
                  ? "bg-amber-600 text-white shadow-sm"
                  : "text-surface-500 hover:text-white"
              }`}
            >
              ★ Favoris
              {favoritePresets.length > 0 && (
                <span className="ml-1.5 text-xs opacity-60">({favoritePresets.length})</span>
              )}
            </button>
          </div>

          {/* Contenu */}
          {presetsLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl bg-surface-800/60 border border-surface-700/60 overflow-hidden animate-pulse"
                >
                  <div className="h-24 bg-surface-700/60" />
                  <div className="p-3 space-y-2">
                    <div className="h-3 bg-surface-700 rounded w-3/4" />
                    <div className="h-2 bg-surface-700/60 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : currentPresets.length === 0 ? (
            <div className="text-center py-12 rounded-2xl border border-dashed border-surface-700/30 bg-surface-900/20">
              <div className="text-4xl mb-3">
                {activeTab === "mes-presets" ? "📦" : "★"}
              </div>
              <p className="text-surface-500 text-sm mb-5">
                {activeTab === "mes-presets"
                  ? "Tu n'as pas encore créé de preset."
                  : "Tu n'as pas encore mis de preset en favori."}
              </p>
              <Link
                href={activeTab === "mes-presets" ? "/presets/new" : "/presets"}
                className="inline-block bg-gradient-brand text-white font-bold px-5 py-2.5 rounded-xl glow-brand hover:opacity-90 transition-opacity text-sm"
              >
                {activeTab === "mes-presets"
                  ? "Créer mon premier preset"
                  : "Explorer la bibliothèque"}
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {currentPresets.map((preset, i) => (
                <div key={preset.id}>
                  <PresetCard preset={preset} index={i} userId={user.id} />
                  {activeTab === "mes-presets" && (
                    <DeletePresetButton
                      presetId={preset.id}
                      variant="icon"
                      className="mt-1 w-full flex items-center justify-center gap-1 py-1 text-xs text-red-600/60 hover:text-red-500 rounded-lg transition-colors"
                      onDeleted={() =>
                        setMyPresets((prev) => prev.filter((p) => p.id !== preset.id))
                      }
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </motion.div>

      </div>
    </div>
  );
}
