"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/layout/Header";
import Avatar from "@/components/ui/Avatar";
import FriendButton from "@/components/social/FriendButton";
import FollowButton from "@/components/social/FollowButton";
import CreatorStats from "@/components/profile/CreatorStats";
import PresetCard from "@/components/presets/PresetCard";
import { Link } from "@/i18n/navigation";
import type { Preset, SubscriptionStatus } from "@/types/database";
import { PRESET_LIST_COLS } from "@/lib/supabase/columns";
import CreatorBadge from "@/components/premium/CreatorBadge";

interface PublicProfile {
  id: string;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  stats: Record<string, number>;
  followers_count: number;
  following_count: number;
  subscription_status: SubscriptionStatus;
  profile_link_url: string | null;
  profile_banner_url: string | null;
  profile_accent_color: string | null;
}

export default function PublicProfilePage() {
  const t = useTranslations("profile.public");
  const tProfile = useTranslations("profile");
  const tStats = useTranslations("profile.stats");
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
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
        .select(
          "id, username, avatar_url, bio, stats, followers_count, following_count, subscription_status, profile_link_url, profile_banner_url, profile_accent_color"
        )
        .eq("id", id)
        .maybeSingle();

      if (!p) { setNotFound(true); setLoading(false); return; }
      const isPremiumAuthor = ["trialing", "active", "lifetime"].includes(
        (p as PublicProfile).subscription_status
      );
      setProfile({
        ...(p as PublicProfile),
        // Lien profil et bannière exclusivement visibles si l'auteur est premium
        profile_link_url: isPremiumAuthor ? (p as PublicProfile).profile_link_url : null,
        profile_banner_url: isPremiumAuthor ? (p as PublicProfile).profile_banner_url : null,
      });

      // Presets publics + pins
      const [{ data: ps }, { data: pins }] = await Promise.all([
        supabase
          .from("presets")
          .select(PRESET_LIST_COLS)
          .eq("author_id", id)
          .eq("is_public", true)
          .is("archived_at", null)
          .order("created_at", { ascending: false })
          .limit(12),
        supabase
          .from("pinned_presets")
          .select("preset_id, position")
          .eq("user_id", id)
          .order("position", { ascending: true }),
      ]);
      setPresets((ps as Preset[]) ?? []);
      setPinnedIds((pins ?? []).map((r: any) => r.preset_id as string));

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
        <p className="text-white font-display font-bold text-xl">{t("notFoundTitle")}</p>
        <p className="text-surface-500 text-sm text-center">{t("notFoundDesc")}</p>
        <button onClick={() => router.back()} className="px-5 py-2.5 rounded-xl bg-surface-800 text-white text-sm hover:bg-surface-700 transition-colors">
          {t("back")}
        </button>
      </div>
    );
  }

  const stats = profile.stats ?? {};
  const statItems = [
    { label: tStats("games"), value: stats.games_played ?? 0, color: "brand" },
    { label: tStats("wins"), value: stats.wins ?? 0, color: "ghost" },
    { label: tStats("presets"), value: presets.length, color: "brand" },
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
          className="relative rounded-3xl overflow-hidden border border-surface-700/30 bg-surface-900/60"
          style={
            profile.profile_accent_color
              ? ({ ["--profile-accent" as any]: profile.profile_accent_color } as React.CSSProperties)
              : undefined
          }
        >
          {profile.profile_banner_url ? (
            <div className="relative h-32 w-full overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={profile.profile_banner_url}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-surface-900/90 to-surface-900/10" />
            </div>
          ) : (
            <div className="absolute -top-8 -right-8 w-40 h-40 bg-brand-600/8 rounded-full blur-3xl pointer-events-none" />
          )}
          <div className={`relative flex items-start gap-4 p-5 ${profile.profile_banner_url ? "-mt-10" : ""}`}>
            <Avatar
              src={profile.avatar_url}
              name={profile.username}
              size="xl"
              className="rounded-2xl shrink-0 ring-4 ring-surface-900"
            />
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-display font-bold text-white truncate leading-tight flex items-center gap-2">
                <span className="truncate">{profile.username ?? t("anonymous")}</span>
                <CreatorBadge status={profile.subscription_status} />
              </h1>

              {/* Compteurs followers / following */}
              <div className="flex items-center gap-4 mt-2 text-xs">
                <Link href={`/profile/${profile.id}/followers`} className="flex items-baseline gap-1.5 hover:text-white transition-colors">
                  <span className="text-white font-bold text-sm">{profile.followers_count}</span>
                  <span className="text-surface-400">{tProfile("followers")}</span>
                </Link>
                <Link href={`/profile/${profile.id}/following`} className="flex items-baseline gap-1.5 hover:text-white transition-colors">
                  <span className="text-white font-bold text-sm">{profile.following_count}</span>
                  <span className="text-surface-400">{tProfile("following")}</span>
                </Link>
                {mutualCount !== null && mutualCount > 0 && (
                  <span className="text-surface-500">· {t("mutualFriends", { n: mutualCount })}</span>
                )}
              </div>

              {profile.bio && (
                <p className="text-surface-400 text-sm mt-2 leading-snug">{profile.bio}</p>
              )}

              {profile.profile_link_url && (
                <a
                  href={profile.profile_link_url}
                  target="_blank"
                  rel="nofollow ugc noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-xs text-brand-300 hover:text-brand-200 underline underline-offset-2 break-all"
                >
                  <span>🔗</span>
                  <span className="truncate max-w-[240px]">
                    {profile.profile_link_url.replace(/^https?:\/\//, "")}
                  </span>
                </a>
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

        {/* Pinned presets (premium) */}
        {pinnedIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <p className="text-surface-400 text-xs uppercase tracking-widest mb-3 px-1 flex items-center gap-1.5">
              <span>📌</span>
              {t("pinnedPresets")}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {pinnedIds
                .map((pid) => presets.find((p) => p.id === pid))
                .filter(Boolean)
                .map((preset, i) => (
                  <PresetCard
                    key={preset!.id}
                    preset={preset!}
                    index={i}
                    userId={user?.id}
                  />
                ))}
            </div>
          </motion.div>
        )}

        {/* Presets publics */}
        {presets.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
          >
            <p className="text-surface-400 text-xs uppercase tracking-widest mb-3 px-1">
              {t("publicPresets")}
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
            <a href="/auth/login" className="text-brand-400 underline">{t("loginPrefix")}</a>
            {t("loginSuffix")}
          </p>
        )}
      </div>
    </div>
  );
}
