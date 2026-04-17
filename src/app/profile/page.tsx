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
import LegalModal from "@/components/legal/LegalModal";
import type { LegalType } from "@/components/legal/LegalModal";

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
  const [legalModal, setLegalModal] = useState<LegalType | null>(null);

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

        {/* ── Section légale & compte ── */}
        {legalModal && <LegalModal type={legalModal} onClose={() => setLegalModal(null)} />}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-2xl border border-surface-800/60 bg-surface-900/30 overflow-hidden group/legal"
        >
          <details>
            <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none list-none hover:bg-surface-800/20 transition-colors">
              <p className="text-surface-500 text-xs uppercase tracking-widest font-medium">Informations & compte</p>
              <span className="text-surface-600 text-xs transition-transform details-open:rotate-180">▼</span>
            </summary>
            <div className="divide-y divide-surface-800/30 border-t border-surface-800/40">
              {([
                { type: "cgu" as LegalType, label: "Conditions générales d'utilisation", emoji: "📋" },
                { type: "privacy" as LegalType, label: "Politique de confidentialité", emoji: "🔒" },
                { type: "cgv" as LegalType, label: "Conditions de vente (abonnement)", emoji: "💳" },
                { type: "mentions" as LegalType, label: "Mentions légales", emoji: "ℹ️" },
              ]).map(({ type, label, emoji }) => (
                <button
                  key={type}
                  onClick={() => setLegalModal(type)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-800/30 transition-colors text-left"
                >
                  <span className="text-base shrink-0">{emoji}</span>
                  <span className="flex-1 text-surface-300 text-sm">{label}</span>
                  <span className="text-surface-600 text-xs">›</span>
                </button>
              ))}
              <a
                href="mailto:contact@gametrend.fr"
                className="flex items-center gap-3 px-4 py-3 hover:bg-surface-800/30 transition-colors"
              >
                <span className="text-base shrink-0">✉️</span>
                <span className="flex-1 text-surface-300 text-sm">Contacter le support</span>
                <span className="text-surface-600 text-xs">›</span>
              </a>
            </div>
          </details>
        </motion.div>

        {/* ── Données personnelles ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="rounded-2xl border border-surface-800/60 bg-surface-900/30 overflow-hidden"
        >
          <details>
            <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none list-none hover:bg-surface-800/20 transition-colors">
              <p className="text-surface-500 text-xs uppercase tracking-widest font-medium">Mes données (RGPD)</p>
              <span className="text-surface-600 text-xs">▼</span>
            </summary>
            <div className="divide-y divide-surface-800/30 border-t border-surface-800/40">
              <ExportDataButton />
              <DeleteAccountButton userId={user.id} onDeleted={signOut} />
            </div>
          </details>
        </motion.div>

      </div>
    </div>
  );
}

function ExportDataButton() {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    const supabase = createClient();
    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) { setLoading(false); return; }

    const [
      { data: profile },
      { data: presets },
      { data: dypResults },
    ] = await Promise.all([
      supabase.from("profiles").select("id, username, bio, avatar_url, created_at, cgu_accepted_at, cgu_version").eq("id", u.id).single(),
      supabase.from("presets").select("id, name, description, game_type, is_public, play_count, created_at, config").eq("author_id", u.id),
      supabase.from("dyp_results").select("id, preset_id, bracket_size, rankings, created_at").eq("player_id", u.id),
    ]);

    const exportData = {
      exported_at: new Date().toISOString(),
      rgpd_info: "Export de vos données personnelles conformément au RGPD art. 20 (droit à la portabilité).",
      account: {
        email: u.email,
        ...profile,
      },
      presets_created: presets ?? [],
      dyp_results: dypResults ?? [],
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gametrend-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setLoading(false);
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-800/30 transition-colors text-left disabled:opacity-50"
    >
      <span className="text-base shrink-0">📥</span>
      <span className="flex-1 text-surface-300 text-sm">{loading ? "Préparation…" : "Exporter mes données"}</span>
      <span className="text-surface-600 text-xs">JSON</span>
    </button>
  );
}

function DeleteAccountButton({ userId, onDeleted }: { userId: string; onDeleted: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    const supabase = createClient();
    // Supprimer les presets et leur contenu (cascade via RLS + storage)
    const { data: presets } = await supabase.from("presets").select("id, cover_url").eq("author_id", userId);
    if (presets) {
      const paths = presets.map((p) => p.cover_url).filter(Boolean).map((url) => {
        const parts = url.split("/covers/");
        return parts[1] ?? null;
      }).filter(Boolean) as string[];
      if (paths.length) await supabase.storage.from("covers").remove(paths);
      await supabase.from("presets").delete().eq("author_id", userId);
    }
    // Supprimer l'avatar
    await supabase.storage.from("avatars").remove([`${userId}/avatar.webp`]);
    // Supprimer le profil
    await supabase.from("profiles").delete().eq("id", userId);
    // Déconnecter
    await supabase.auth.signOut();
    onDeleted();
  }

  if (confirm) {
    return (
      <div className="px-4 py-4 space-y-2">
        <p className="text-red-400 text-sm font-medium">⚠️ Cette action est irréversible.</p>
        <p className="text-surface-500 text-xs">Tous tes presets, données et historique seront supprimés définitivement.</p>
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setConfirm(false)}
            className="flex-1 py-2.5 rounded-xl bg-surface-800 text-surface-300 text-sm font-medium"
          >
            Annuler
          </button>
          <button
            onClick={handleDelete}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-red-900/60 border border-red-700/40 text-red-300 text-sm font-bold disabled:opacity-50"
          >
            {loading ? "Suppression…" : "Confirmer"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirm(true)}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-950/20 transition-colors text-left"
    >
      <span className="text-base shrink-0">🗑️</span>
      <span className="flex-1 text-red-500/70 text-sm">Supprimer mon compte</span>
      <span className="text-surface-600 text-xs">›</span>
    </button>
  );
}
