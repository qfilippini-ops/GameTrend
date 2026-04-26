"use client";

import { useEffect, useState } from "react";
import { useRouter, Link } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import Header from "@/components/layout/Header";
import Avatar from "@/components/ui/Avatar";
import PresetCard from "@/components/presets/PresetCard";
import DeletePresetButton from "@/components/presets/DeletePresetButton";
import { useAuth } from "@/hooks/useAuth";
import EditProfileModal from "@/components/profile/EditProfileModal";
import StatsAccordion from "@/components/profile/StatsAccordion";
import dynamic from "next/dynamic";
import type { Preset, Profile } from "@/types/database";
import { PRESET_LIST_COLS } from "@/lib/supabase/columns";
import LegalModal from "@/components/legal/LegalModal";
import type { LegalType } from "@/components/legal/LegalModal";
import LanguageSwitcher from "@/components/layout/LanguageSwitcher";
import AffiliateDashboard from "@/components/affiliate/AffiliateDashboard";
import SubscriptionSection from "@/components/premium/SubscriptionSection";
import PinnedPresetsManager from "@/components/premium/PinnedPresetsManager";
import CreatorBadge from "@/components/premium/CreatorBadge";
import { useSubscription } from "@/hooks/useSubscription";
import { useConsent } from "@/hooks/useConsent";

type Tab = "mes-presets" | "favoris";
type ProfileView = "activity" | "presets";

const UserActivityFeed = dynamic(
  () => import("@/components/feed/UserActivityFeed"),
  { ssr: false }
);

export default function ProfilePage() {
  const t = useTranslations("profile");
  const tPremium = useTranslations("premium.profile");
  const tPublic = useTranslations("profile.public");
  const router = useRouter();
  const { user, profile, loading, signOut, refreshProfile } = useAuth();
  const { isPremium } = useSubscription();
  const [localProfile, setLocalProfile] = useState<Partial<Profile>>({});
  const [editOpen, setEditOpen] = useState(false);
  const [myPresets, setMyPresets] = useState<Preset[]>([]);
  const [favoritePresets, setFavoritePresets] = useState<Preset[]>([]);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("mes-presets");
  const [view, setView] = useState<ProfileView>("activity");
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
        .select(PRESET_LIST_COLS)
        .eq("author_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("preset_likes")
        .select("preset_id")
        .eq("user_id", user.id),
      supabase
        .from("pinned_presets")
        .select("preset_id, position")
        .eq("user_id", user.id)
        .order("position", { ascending: true }),
    ]).then(async ([myRes, likesRes, pinsRes]) => {
      setMyPresets((myRes.data ?? []) as Preset[]);
      setPinnedIds(((pinsRes.data ?? []) as Array<{ preset_id: string }>).map((r) => r.preset_id));
      const likedIds = (likesRes.data ?? []).map((l) => l.preset_id);
      if (likedIds.length > 0) {
        const { data: favData } = await supabase
          .from("presets")
          .select(PRESET_LIST_COLS)
          .in("id", likedIds);
        setFavoritePresets((favData ?? []) as Preset[]);
      }
      setPresetsLoading(false);
    });
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <div className="text-4xl animate-pulse">👤</div>
      </div>
    );
  }

  if (!user || user.is_anonymous) return null;

  const currentPresets = activeTab === "mes-presets" ? myPresets : favoritePresets;

  return (
    <div className="min-h-screen bg-surface-950 bg-grid">
      <Header
        title={t("title")}
        actions={
          <button
            onClick={signOut}
            title={t("logoutTitle")}
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
          style={
            isPremium && displayProfile?.profile_accent_color
              ? ({ ["--profile-accent" as any]: displayProfile.profile_accent_color } as React.CSSProperties)
              : undefined
          }
        >
          {/* Bandeau */}
          {isPremium && displayProfile?.profile_banner_url ? (
            <div className="relative h-32 w-full overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={displayProfile.profile_banner_url}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-surface-900/90 to-surface-900/10" />
            </div>
          ) : (
            <div className="relative h-24 bg-gradient-to-br from-brand-900 via-surface-800 to-ghost-950 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-brand-600/25 via-transparent to-ghost-600/20" />
              <div className="absolute -top-6 -left-6 w-32 h-32 bg-brand-500/15 rounded-full blur-2xl" />
              <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-ghost-500/15 rounded-full blur-2xl" />
            </div>
          )}

          {/* Avatar + infos */}
          <div className="px-5 pb-5">
            <div className={`flex items-end justify-between mb-3 ${isPremium && displayProfile?.profile_banner_url ? "-mt-10" : "-mt-8"}`}>
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
                {t("edit")}
              </button>
            </div>

            <div>
              <h1 className="text-xl font-display font-bold text-white leading-tight flex items-center gap-2">
                {displayProfile?.username ?? t("anonymous")}
                <CreatorBadge status={displayProfile?.subscription_status} variant="full" />
              </h1>
              <p className="text-surface-600 text-xs mt-0.5 truncate">{user.email}</p>

              {/* Compteurs sociaux */}
              <div className="flex items-center gap-4 mt-2 text-xs">
                <Link href={`/profile/${user.id}/followers`} className="flex items-baseline gap-1.5 hover:text-white transition-colors">
                  <span className="text-white font-bold text-sm">{(displayProfile as { followers_count?: number })?.followers_count ?? 0}</span>
                  <span className="text-surface-400">{t("followers")}</span>
                </Link>
                <Link href={`/profile/${user.id}/following`} className="flex items-baseline gap-1.5 hover:text-white transition-colors">
                  <span className="text-white font-bold text-sm">{(displayProfile as { following_count?: number })?.following_count ?? 0}</span>
                  <span className="text-surface-400">{t("following")}</span>
                </Link>
              </div>

              {displayProfile?.bio && (
                <p className="text-surface-400 text-sm mt-2.5 leading-relaxed line-clamp-3 border-t border-surface-800/60 pt-2.5">
                  {displayProfile.bio}
                </p>
              )}

              {/* Lien externe Premium */}
              {isPremium && displayProfile?.profile_link_url && (
                <a
                  href={displayProfile.profile_link_url}
                  target="_blank"
                  rel="nofollow ugc noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-xs text-brand-300 hover:text-brand-200 underline underline-offset-2 break-all"
                >
                  <span>🔗</span>
                  <span className="truncate max-w-[240px]">
                    {displayProfile.profile_link_url.replace(/^https?:\/\//, "")}
                  </span>
                </a>
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

        {/* ── Toggle Activité | Presets ──────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-surface-900/60 border border-surface-800/50">
          <button
            type="button"
            onClick={() => setView("activity")}
            className={`py-2.5 rounded-xl text-sm font-bold transition-all ${
              view === "activity"
                ? "bg-brand-600 text-white shadow"
                : "text-surface-400 hover:text-surface-200"
            }`}
          >
            {tPublic("tabActivity")}
          </button>
          <button
            type="button"
            onClick={() => setView("presets")}
            className={`py-2.5 rounded-xl text-sm font-bold transition-all ${
              view === "presets"
                ? "bg-brand-600 text-white shadow"
                : "text-surface-400 hover:text-surface-200"
            }`}
          >
            {tPublic("tabPresets", { count: myPresets.length })}
          </button>
        </div>

        {view === "activity" ? (
          <UserActivityFeed userId={user.id} />
        ) : null}

        {/* ── Pinned presets (Premium) ─────────────────────────────────────── */}
        {view === "presets" && isPremium && pinnedIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14 }}
          >
            <p className="text-surface-400 text-xs uppercase tracking-widest mb-3 px-1 flex items-center gap-1.5">
              <span>📌</span>
              {tPublic("pinnedPresets")}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {pinnedIds
                .map((pid) => myPresets.find((p) => p.id === pid))
                .filter(Boolean)
                .map((preset, i) => (
                  <PresetCard
                    key={preset!.id}
                    preset={preset!}
                    index={i}
                    userId={user.id}
                  />
                ))}
            </div>
          </motion.div>
        )}

        {/* ── Tabs + presets (uniquement en mode "presets") ───────────────── */}
        {view === "presets" && (
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
              {t("tabs.myPresets")}
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
              {t("tabs.favorites")}
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
          ) : null}

          {!presetsLoading && activeTab === "mes-presets" && !isPremium && myPresets.length >= 5 && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 flex items-center justify-between">
              <p className="text-amber-300 text-xs">
                {tPremium("freeQuotaReached", { count: myPresets.length })}
              </p>
              <Link
                href="/premium"
                className="px-3 py-1.5 rounded-lg bg-gradient-brand text-white text-xs font-bold glow-brand"
              >
                {tPremium("upgradeShort")}
              </Link>
            </div>
          )}

          {presetsLoading ? null : currentPresets.length === 0 ? (
            <div className="text-center py-12 rounded-2xl border border-dashed border-surface-700/30 bg-surface-900/20">
              <div className="text-4xl mb-3">
                {activeTab === "mes-presets" ? "📦" : "★"}
              </div>
              <p className="text-surface-500 text-sm mb-5">
                {activeTab === "mes-presets" ? t("empty.myPresets") : t("empty.favorites")}
              </p>
              <Link
                href={activeTab === "mes-presets" ? "/presets/new" : "/presets"}
                className="inline-block bg-gradient-brand text-white font-bold px-5 py-2.5 rounded-xl glow-brand hover:opacity-90 transition-opacity text-sm"
              >
                {activeTab === "mes-presets" ? t("empty.createCta") : t("empty.exploreCta")}
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
        )}

        {/* ── Stats (accordéon fermé par défaut) ──────────────────────────── */}
        <StatsAccordion
          userId={user.id}
          followersCount={(displayProfile as { followers_count?: number })?.followers_count ?? 0}
        />

        {/* ── Mon abonnement ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.17 }}
          className="rounded-2xl border border-surface-800/60 bg-surface-900/30 overflow-hidden"
        >
          <details open={!isPremium}>
            <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none list-none hover:bg-surface-800/20 transition-colors">
              <p className="text-surface-500 text-xs uppercase tracking-widest font-medium">{tPremium("section")}</p>
              <span className="text-surface-600 text-xs">▼</span>
            </summary>
            <div className="px-4 py-4 space-y-4 border-t border-surface-800/40">
              <SubscriptionSection />
              {isPremium && (
                <div className="border-t border-surface-800/40 pt-4">
                  <PinnedPresetsManager />
                </div>
              )}
            </div>
          </details>
        </motion.div>

        {/* ── Préférences (langue, etc.) ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          className="rounded-2xl border border-surface-800/60 bg-surface-900/30 overflow-hidden"
        >
          <details>
            <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none list-none hover:bg-surface-800/20 transition-colors">
              <p className="text-surface-500 text-xs uppercase tracking-widest font-medium">{t("sectionsPreferences")}</p>
              <span className="text-surface-600 text-xs">▼</span>
            </summary>
            <div className="px-4 py-4 space-y-2 border-t border-surface-800/40">
              <label className="block text-surface-400 text-xs font-medium">{t("languageLabel")}</label>
              <LanguageSwitcher />
              <p className="text-surface-600 text-[11px]">{t("languageHint")}</p>
            </div>
          </details>
        </motion.div>

        {/* ── Affiliation ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.19 }}
          className="rounded-2xl border border-surface-800/60 bg-surface-900/30 overflow-hidden"
        >
          <details>
            <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none list-none hover:bg-surface-800/20 transition-colors">
              <p className="text-surface-500 text-xs uppercase tracking-widest font-medium">{t("sectionsAffiliate")}</p>
              <span className="text-surface-600 text-xs">▼</span>
            </summary>
            <div className="px-4 py-4 border-t border-surface-800/40">
              <AffiliateDashboard />
            </div>
          </details>
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
              <p className="text-surface-500 text-xs uppercase tracking-widest font-medium">{t("sectionsLegal")}</p>
              <span className="text-surface-600 text-xs transition-transform details-open:rotate-180">▼</span>
            </summary>
            <div className="divide-y divide-surface-800/30 border-t border-surface-800/40">
              {([
                { type: "cgu" as LegalType, label: t("legalLinks.cgu"), emoji: "📋" },
                { type: "privacy" as LegalType, label: t("legalLinks.privacy"), emoji: "🔒" },
                { type: "cgv" as LegalType, label: t("legalLinks.cgv"), emoji: "💳" },
                { type: "mentions" as LegalType, label: t("legalLinks.mentions"), emoji: "ℹ️" },
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
                <span className="flex-1 text-surface-300 text-sm">{t("legalLinks.support")}</span>
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
              <p className="text-surface-500 text-xs uppercase tracking-widest font-medium">{t("sectionsRgpd")}</p>
              <span className="text-surface-600 text-xs">▼</span>
            </summary>
            <div className="divide-y divide-surface-800/30 border-t border-surface-800/40">
              <CookieSettingsButton />
              <ExportDataButton />
              <DeleteAccountButton userId={user.id} onDeleted={signOut} />
            </div>
          </details>
        </motion.div>

      </div>
    </div>
  );
}

function CookieSettingsButton() {
  const t = useTranslations("profile.rgpd");
  const { openSettings } = useConsent();

  return (
    <button
      onClick={openSettings}
      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-surface-800/20 transition-colors text-left"
    >
      <span className="text-lg">🍪</span>
      <span className="flex-1 text-surface-300 text-sm">{t("manageCookies")}</span>
      <span className="text-surface-600 text-xs">→</span>
    </button>
  );
}

function ExportDataButton() {
  const t = useTranslations("profile.rgpd");
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
      supabase.from("profiles").select("id, username, bio, avatar_url, created_at, cgu_accepted_at, cgu_version, followers_count, following_count").eq("id", u.id).single(),
      supabase.from("presets").select("id, name, description, game_type, is_public, play_count, created_at, config").eq("author_id", u.id),
      supabase.from("dyp_results").select("id, preset_id, bracket_size, rankings, created_at").eq("player_id", u.id),
    ]);

    const exportData = {
      exported_at: new Date().toISOString(),
      rgpd_info: t("rgpdNote"),
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
    a.download = `gametrend-data-${new Date().toISOString().slice(0, 10)}.json`;
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
      <span className="flex-1 text-surface-300 text-sm">{loading ? t("exporting") : t("exportData")}</span>
      <span className="text-surface-600 text-xs">JSON</span>
    </button>
  );
}

function DeleteAccountButton({ userId, onDeleted }: { userId: string; onDeleted: () => void }) {
  const t = useTranslations("profile.rgpd");
  const tCommon = useTranslations("common");
  const { isPremium, isLifetime } = useSubscription();
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Suppress unused param warning : userId est conservé pour compat de l'API du composant.
  void userId;

  async function handleDelete() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (!res.ok) {
        setError(t("deleteError"));
        setLoading(false);
        return;
      }
      // La session est invalidée côté serveur (auth user supprimé), on signOut local pour nettoyer le storage.
      const supabase = createClient();
      await supabase.auth.signOut();
      onDeleted();
    } catch {
      setError(t("deleteError"));
      setLoading(false);
    }
  }

  if (confirm) {
    return (
      <div className="px-4 py-4 space-y-2">
        <p className="text-red-400 text-sm font-medium">{t("deleteWarn")}</p>
        <p className="text-surface-500 text-xs">{t("deleteHint")}</p>
        {isLifetime ? (
          <p className="text-amber-300 text-xs bg-amber-500/10 border border-amber-500/30 rounded-lg p-2">
            {t("deleteLifetimeWarn")}
          </p>
        ) : isPremium ? (
          <p className="text-amber-300 text-xs bg-amber-500/10 border border-amber-500/30 rounded-lg p-2">
            {t("deletePremiumWarn")}
          </p>
        ) : null}
        {error && (
          <p className="text-red-400 text-xs bg-red-950/30 border border-red-800/30 rounded-lg p-2">
            {error}
          </p>
        )}
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => { setConfirm(false); setError(null); }}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-surface-800 text-surface-300 text-sm font-medium disabled:opacity-50"
          >
            {tCommon("cancel")}
          </button>
          <button
            onClick={handleDelete}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-red-900/60 border border-red-700/40 text-red-300 text-sm font-bold disabled:opacity-50"
          >
            {loading ? t("deleting") : t("deleteConfirm")}
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
      <span className="flex-1 text-red-500/70 text-sm">{t("deleteAccount")}</span>
      <span className="text-surface-600 text-xs">›</span>
    </button>
  );
}
