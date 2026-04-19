"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/layout/Header";
import Avatar from "@/components/ui/Avatar";
import FriendButton from "@/components/social/FriendButton";
import FollowButton from "@/components/social/FollowButton";
import CreatorStats from "@/components/profile/CreatorStats";
import PresetCard from "@/components/presets/PresetCard";
import Link from "next/link";
import type { Preset } from "@/types/database";
import { PRESET_LIST_COLS } from "@/lib/supabase/columns";

interface PublicProfile {
  id: string;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  stats: Record<string, number>;
  followers_count: number;
  following_count: number;
}

export default function PublicProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [mutualCount, setMutualCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const supabase = createClient();
  const isOwnProfile = user && user.id === id;

  useEffect(() => {
    if (!id) return;

    // Rediriger vers le profil propre si même utilisateur
    if (isOwnProfile) { router.replace("/profile"); return; }

    async function load() {
      const { data: p } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, bio, stats, followers_count, following_count")
        .eq("id", id)
        .maybeSingle();

      if (!p) { setNotFound(true); setLoading(false); return; }
      setProfile(p as PublicProfile);

      // Presets publics
      const { data: ps } = await supabase
        .from("presets")
        .select(PRESET_LIST_COLS)
        .eq("author_id", id)
        .eq("is_public", true)
        .order("created_at", { ascending: false })
        .limit(6);
      setPresets((ps as Preset[]) ?? []);

      // Amis en commun (uniquement si connecté non-anonyme)
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser && !currentUser.is_anonymous) {
        const { data: mc } = await supabase.rpc("get_mutual_friends_count", { target_id: id });
        setMutualCount(mc ?? 0);
      }

      setLoading(false);
    }

    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <div className="text-4xl animate-pulse">👤</div>
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="min-h-screen bg-surface-950 flex flex-col items-center justify-center gap-4 px-5">
        <div className="text-6xl">🫥</div>
        <p className="text-white font-display font-bold text-xl">Profil introuvable</p>
        <p className="text-surface-500 text-sm text-center">Ce joueur n&apos;existe pas ou a supprimé son compte.</p>
        <button onClick={() => router.back()} className="px-5 py-2.5 rounded-xl bg-surface-800 text-white text-sm hover:bg-surface-700 transition-colors">
          Retour
        </button>
      </div>
    );
  }

  const stats = profile.stats ?? {};
  const statItems = [
    { label: "Parties", value: stats.games_played ?? 0, color: "brand" },
    { label: "Victoires", value: stats.wins ?? 0, color: "ghost" },
    { label: "Presets", value: presets.length, color: "brand" },
  ];

  const isLoggedIn = user && !user.is_anonymous;

  return (
    <div className="min-h-screen bg-surface-950 bg-grid">
      <Header backHref="/" title="" />

      <div className="px-4 pt-3 pb-8 space-y-4 max-w-lg mx-auto">

        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative rounded-3xl overflow-hidden border border-surface-700/30 bg-surface-900/60 p-5"
        >
          <div className="absolute -top-8 -right-8 w-40 h-40 bg-brand-600/8 rounded-full blur-3xl pointer-events-none" />
          <div className="relative flex items-start gap-4">
            <Avatar
              src={profile.avatar_url}
              name={profile.username}
              size="xl"
              className="rounded-2xl shrink-0"
            />
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-display font-bold text-white truncate leading-tight">
                {profile.username ?? "Joueur Anonyme"}
              </h1>

              {/* Compteurs followers / following */}
              <div className="flex items-center gap-4 mt-2 text-xs">
                <Link href={`/profile/${profile.id}/followers`} className="flex items-baseline gap-1.5 hover:text-white transition-colors">
                  <span className="text-white font-bold text-sm">{profile.followers_count}</span>
                  <span className="text-surface-400">abonnés</span>
                </Link>
                <Link href={`/profile/${profile.id}/following`} className="flex items-baseline gap-1.5 hover:text-white transition-colors">
                  <span className="text-white font-bold text-sm">{profile.following_count}</span>
                  <span className="text-surface-400">abonnements</span>
                </Link>
                {mutualCount !== null && mutualCount > 0 && (
                  <span className="text-surface-500">·  {mutualCount} ami{mutualCount > 1 ? "s" : ""} en commun</span>
                )}
              </div>

              {profile.bio && (
                <p className="text-surface-400 text-sm mt-2 leading-snug">{profile.bio}</p>
              )}

              {/* Boutons sociaux */}
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <FollowButton
                  targetUserId={profile.id}
                  onChange={(isFollowing) => {
                    setProfile((p) => p ? { ...p, followers_count: p.followers_count + (isFollowing ? 1 : -1) } : p);
                  }}
                />
                {isLoggedIn && <FriendButton targetUserId={profile.id} />}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}
          className="grid grid-cols-3 gap-2"
        >
          {statItems.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.08 + i * 0.04 }}
              className={`relative rounded-2xl border p-4 flex flex-col items-center gap-1 overflow-hidden ${
                s.color === "brand"
                  ? "border-brand-700/25 bg-brand-950/30"
                  : "border-ghost-700/25 bg-ghost-950/30"
              }`}
            >
              <span
                className="text-2xl font-display font-bold leading-none"
                style={{
                  textShadow: s.color === "brand"
                    ? "0 0 20px rgba(68,96,255,0.5)"
                    : "0 0 20px rgba(217,70,239,0.5)",
                  color: s.color === "brand" ? "#6b89ff" : "#e879f9",
                }}
              >
                {s.value}
              </span>
              <span className="text-xs text-surface-400 font-medium">{s.label}</span>
            </motion.div>
          ))}
        </motion.div>

        {/* Stats créateur (uniquement si presets publics) */}
        <CreatorStats userId={profile.id} followersCount={profile.followers_count} />

        {/* Presets publics */}
        {presets.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
          >
            <p className="text-surface-400 text-xs uppercase tracking-widest mb-3 px-1">
              Presets publics
            </p>
            <div className="grid grid-cols-2 gap-3">
              {presets.map((preset, i) => (
                <PresetCard
                  key={preset.id}
                  preset={preset}
                  index={i}
                  userId={user?.id}
                />
              ))}
            </div>
          </motion.div>
        )}

        {!isLoggedIn && (
          <p className="text-surface-600 text-xs text-center pt-2">
            <a href="/auth/login" className="text-brand-400 underline">Connecte-toi</a>
            {" "}pour ajouter ce joueur en ami.
          </p>
        )}
      </div>
    </div>
  );
}
