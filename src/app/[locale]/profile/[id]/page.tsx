import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { createPublicClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import Avatar from "@/components/ui/Avatar";
import StatsAccordion from "@/components/profile/StatsAccordion";
import { Link } from "@/i18n/navigation";
import type { Preset, SubscriptionStatus } from "@/types/database";
import { PRESET_LIST_COLS } from "@/lib/supabase/columns";
import CreatorBadge from "@/components/premium/CreatorBadge";
import { SITE_URL } from "@/lib/seo/sitemap";
import ProfileSocialActions from "./_components/ProfileSocialActions";
import ProfileLoginCTA from "./_components/ProfileLoginCTA";
import ProfileTabs from "./_components/ProfileTabs";

interface PublicProfile {
  id: string;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  stats: Record<string, number> | null;
  followers_count: number;
  following_count: number;
  subscription_status: SubscriptionStatus;
  profile_link_url: string | null;
  profile_banner_url: string | null;
  profile_accent_color: string | null;
  updated_at: string;
}

interface ProfileBundle {
  profile: PublicProfile;
  presets: Preset[];
  pinnedIds: string[];
}

/**
 * Charge le profil + presets publics + pinned. React.cache évite la double
 * exécution entre `generateMetadata` et le composant.
 *
 * Lecture publique (createPublicClient) : ne contient AUCUNE donnée sensible
 * (RLS public sur profiles + filtre is_public=true sur presets). Les compteurs
 * de followers/following sont déjà publics par design.
 */
const loadProfileBundle = cache(async (id: string): Promise<ProfileBundle | null> => {
  const supabase = createPublicClient();

  const { data: profileRow } = await supabase
    .from("profiles")
    .select(
      "id, username, avatar_url, bio, stats, followers_count, following_count, subscription_status, profile_link_url, profile_banner_url, profile_accent_color, updated_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (!profileRow) return null;

  const profile = profileRow as unknown as PublicProfile;
  const isPremiumAuthor = ["trialing", "active", "lifetime"].includes(
    profile.subscription_status
  );

  // Le banner et le lien externe sont des features Premium uniquement
  const sanitizedProfile: PublicProfile = {
    ...profile,
    profile_link_url: isPremiumAuthor ? profile.profile_link_url : null,
    profile_banner_url: isPremiumAuthor ? profile.profile_banner_url : null,
  };

  const [{ data: presetsRow }, { data: pinsRow }] = await Promise.all([
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

  return {
    profile: sanitizedProfile,
    presets: (presetsRow as Preset[]) ?? [],
    pinnedIds: (pinsRow ?? []).map((r) => r.preset_id),
  };
});

export async function generateMetadata({
  params,
}: {
  params: { locale: string; id: string };
}): Promise<Metadata> {
  const bundle = await loadProfileBundle(params.id);
  const t = await getTranslations({ locale: params.locale, namespace: "profile.seo" });

  if (!bundle) {
    return {
      title: t("notFoundTitle"),
      robots: { index: false, follow: false },
    };
  }

  const { profile, presets } = bundle;

  // noindex pour les profils "fantômes" : pas de username OU 0 preset public.
  // Évite d'inonder Google de pages de faible valeur (Soft 404 risk).
  const isIndexable = Boolean(profile.username) && presets.length > 0;

  if (!isIndexable) {
    return {
      title: profile.username ?? t("anonymousTitle"),
      robots: { index: false, follow: false },
    };
  }

  const title = t("publicTitle", { username: profile.username ?? "" });
  const description =
    profile.bio?.trim() ||
    t("publicFallbackDescription", {
      username: profile.username ?? "",
      count: presets.length,
    });
  const canonicalPath = `/${params.locale}/profile/${profile.id}`;
  // Cache-buster basé sur updated_at (cf. presets/[id]/page.tsx).
  const ogVersion = profile.updated_at
    ? new Date(profile.updated_at).getTime()
    : Date.now();
  const ogImageUrl = `/api/og/profile/${profile.id}?v=${ogVersion}`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
      languages: {
        fr: `/fr/profile/${profile.id}`,
        en: `/en/profile/${profile.id}`,
        "x-default": `/fr/profile/${profile.id}`,
      },
    },
    openGraph: {
      title,
      description,
      type: "profile",
      url: `${SITE_URL}${canonicalPath}`,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: profile.username ?? "" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function PublicProfilePage({
  params,
}: {
  params: { locale: string; id: string };
}) {
  const bundle = await loadProfileBundle(params.id);
  if (!bundle) notFound();

  const { profile, presets, pinnedIds } = bundle;

  const t = await getTranslations({ locale: params.locale, namespace: "profile.public" });
  const tProfile = await getTranslations({ locale: params.locale, namespace: "profile" });

  // ── JSON-LD Person : signal majeur pour les "knowledge graph" Google ──
  const canonicalUrl = `${SITE_URL}/${params.locale}/profile/${profile.id}`;
  const personLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": canonicalUrl,
    name: profile.username ?? undefined,
    description: profile.bio ?? undefined,
    url: canonicalUrl,
    image: profile.avatar_url ?? `${SITE_URL}/api/og/profile/${profile.id}`,
    // sameAs : lien externe public (uniquement pour les profils Premium qui
    // ont leur lien validé). On ne pollue pas le graphe avec des liens vides.
    sameAs: profile.profile_link_url ? [profile.profile_link_url] : undefined,
  };

  const accentStyle = profile.profile_accent_color
    ? ({ ["--profile-accent" as string]: profile.profile_accent_color } as React.CSSProperties)
    : undefined;

  return (
    <div className="min-h-screen bg-surface-950 bg-grid">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personLd) }}
      />
      <Header backHref="/" title="" />

      <article className="px-4 pt-3 pb-8 space-y-4 max-w-lg mx-auto">

        {/* Hero */}
        <section
          className="relative rounded-3xl overflow-hidden border border-surface-700/30 bg-surface-900/60"
          style={accentStyle}
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

              {/* Compteurs followers / following — SSR pour le SEO et la perf */}
              <div className="flex items-center gap-4 mt-2 text-xs">
                <Link href={`/profile/${profile.id}/followers`} className="flex items-baseline gap-1.5 hover:text-white transition-colors">
                  <span className="text-white font-bold text-sm">{profile.followers_count}</span>
                  <span className="text-surface-400">{tProfile("followers")}</span>
                </Link>
                <Link href={`/profile/${profile.id}/following`} className="flex items-baseline gap-1.5 hover:text-white transition-colors">
                  <span className="text-white font-bold text-sm">{profile.following_count}</span>
                  <span className="text-surface-400">{tProfile("following")}</span>
                </Link>
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

              <ProfileSocialActions targetUserId={profile.id} />
            </div>
          </div>
        </section>

        {/* Stats : accordéon fermé par défaut, juste au-dessus du toggle */}
        <StatsAccordion
          userId={profile.id}
          followersCount={profile.followers_count}
        />

        {/* Onglets : Activité (par défaut) / Presets */}
        <ProfileTabs
          userId={profile.id}
          presets={presets}
          pinnedIds={pinnedIds}
        />

        <ProfileLoginCTA />
      </article>
    </div>
  );
}
