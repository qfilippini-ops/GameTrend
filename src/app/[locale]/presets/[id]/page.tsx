import { cache } from "react";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/Header";
import { formatRelative, generateShareUrl } from "@/lib/utils";
import { getTranslations } from "next-intl/server";
import type { GhostWordConfig, WordFamily, DYPConfig, DYPCard } from "@/types/games";
import ShareButton from "./ShareButton";
import FavoriteButton from "@/components/presets/FavoriteButton";
import DeletePresetButton from "@/components/presets/DeletePresetButton";
import ReportButton from "@/components/presets/ReportButton";
import PresetComments from "@/components/presets/PresetComments";
import PresetViewTracker from "@/components/presets/PresetViewTracker";
import CreatorBadge from "@/components/premium/CreatorBadge";
import PresetAnalyticsButton from "@/components/premium/PresetAnalyticsButton";
import AdSlot from "@/components/ads/AdSlot";
import type { SubscriptionStatus } from "@/types/database";
import { SITE_URL } from "@/lib/seo/sitemap";

/**
 * Wrapper React.cache : la même requête Supabase appelée dans
 * `generateMetadata` ET dans le composant ne fait qu'UN aller-retour réseau.
 * Cache scopé à la requête HTTP courante.
 */
const getPresetForPage = cache(async (id: string) => {
  const supabase = createClient();
  const { data } = await supabase
    .from("presets")
    .select("*, profiles!author_id(username, avatar_url, subscription_status)")
    .eq("id", id)
    .single();
  return data;
});

export async function generateMetadata({
  params,
}: {
  params: { locale: string; id: string };
}): Promise<Metadata> {
  const preset = await getPresetForPage(params.id);
  const t = await getTranslations({ locale: params.locale, namespace: "presets.seo" });

  // Preset introuvable : renvoie une méta minimale + noindex.
  if (!preset) {
    return {
      title: t("notFoundTitle"),
      robots: { index: false, follow: false },
    };
  }

  // Preset privé : indexable interdit (sécurité défensive en plus de RLS).
  if (!preset.is_public) {
    return {
      title: preset.name,
      robots: { index: false, follow: false },
    };
  }

  const author = preset.profiles as { username: string | null } | null;
  const authorName = author?.username ?? t("anonymousAuthor");
  const gameLabel = GAME_META[preset.game_type]?.name ?? preset.game_type;

  const title = t("detailTitle", { name: preset.name, game: gameLabel, author: authorName });
  const description =
    preset.description?.trim() ||
    t("detailFallbackDescription", { name: preset.name, game: gameLabel, author: authorName });

  const canonicalPath = `/${params.locale}/presets/${preset.id}`;
  // Cache-buster basé sur updated_at : chaque modif du preset (nom, cover,
  // description) génère une nouvelle URL OG, donc le CDN Vercel ressort une
  // image fraîche immédiatement au lieu d'attendre l'expiration du s-maxage.
  const ogVersion = preset.updated_at
    ? new Date(preset.updated_at).getTime()
    : Date.now();
  const ogImageUrl = `/api/og/preset/${preset.id}?v=${ogVersion}`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
      languages: {
        fr: `/fr/presets/${preset.id}`,
        en: `/en/presets/${preset.id}`,
        "x-default": `/fr/presets/${preset.id}`,
      },
    },
    openGraph: {
      title,
      description,
      type: "article",
      url: `${SITE_URL}${canonicalPath}`,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: preset.name }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

const GAME_META: Record<string, { icon: string; name: string; color: string; gameHref: (id: string) => string }> = {
  ghostword: { icon: "👻", name: "GhostWord", color: "from-ghost-900/80 to-brand-900/60", gameHref: (id) => `/games/ghostword?presetId=${id}` },
  dyp:       { icon: "⚡", name: "DYP",       color: "from-amber-900/80 to-brand-900/60", gameHref: (id) => `/games/dyp?presetId=${id}` },
};

const ROLE_STYLE: Record<string, { bg: string; border: string; emoji: string }> = {
  initie: { bg: "bg-brand-900/40",  border: "border-brand-700/40",  emoji: "🧠" },
  ombre:  { bg: "bg-ghost-900/40",  border: "border-ghost-700/40",  emoji: "👻" },
  vide:   { bg: "bg-surface-800/60", border: "border-surface-700/40", emoji: "💨" },
};

type RankingEntry = { card_id: string; card_name: string; image_url: string | null; position: number };
type CardStat = { name: string; imageUrl: string | null; wins: number; appearances: number };

function SectionHeader({ emoji, title, badge }: { emoji: string; title: string; badge?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-base">{emoji}</span>
      <h2 className="text-xs font-bold text-white uppercase tracking-widest">{title}</h2>
      <div className="flex-1 h-px bg-surface-800/80" />
      {badge && <span className="text-xs text-surface-600 font-mono">{badge}</span>}
    </div>
  );
}

export default async function PresetDetailPage({ params }: { params: { locale: string; id: string } }) {
  const t = await getTranslations("presets.detail");
  const tCommon = await getTranslations("common");
  const tSeo = await getTranslations({ locale: params.locale, namespace: "presets.seo" });
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const preset = await getPresetForPage(params.id);

  if (!preset) notFound();

  const shareUrl = generateShareUrl(preset.id);
  const isOwner = user?.id === preset.author_id;
  const gameMeta = GAME_META[preset.game_type] ?? { icon: "🎮", name: preset.game_type, color: "from-surface-800 to-surface-900", gameHref: () => "/" };

  // ── GhostWord ──────────────────────────────────────────────────
  const isGhostWord = preset.game_type === "ghostword";
  const ghostConfig = isGhostWord ? (preset.config as unknown as GhostWordConfig) : null;
  const totalWords = ghostConfig?.families?.reduce((acc: number, f: WordFamily) => acc + f.words.length, 0) ?? 0;

  // ── DYP ────────────────────────────────────────────────────────
  const isDYP = preset.game_type === "dyp";
  const dypConfig = isDYP ? (preset.config as unknown as DYPConfig) : null;

  let topCards: CardStat[] = [];
  let totalDYPGames = 0;

  if (isDYP) {
    const { data: dypResults } = await supabase
      .from("dyp_results")
      .select("rankings")
      .eq("preset_id", preset.id);

    totalDYPGames = dypResults?.length ?? 0;

    const cardStats: Record<string, CardStat> = {};
    for (const r of dypResults ?? []) {
      for (const entry of (r.rankings as RankingEntry[]) ?? []) {
        if (!cardStats[entry.card_id]) {
          cardStats[entry.card_id] = { name: entry.card_name, imageUrl: entry.image_url, wins: 0, appearances: 0 };
        }
        cardStats[entry.card_id].appearances++;
        if (entry.position === 1) cardStats[entry.card_id].wins++;
      }
    }
    topCards = Object.values(cardStats)
      .sort((a, b) => b.wins - a.wins || b.appearances - a.appearances)
      .slice(0, 10);
  }

  const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };
  const author = preset.profiles as {
    username: string | null;
    avatar_url: string | null;
    subscription_status: SubscriptionStatus | null;
  } | null;

  // ── JSON-LD : CreativeWork (preset = œuvre communautaire) + Breadcrumb ──
  const canonicalUrl = `${SITE_URL}/${params.locale}/presets/${preset.id}`;
  const creativeWorkLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "@id": canonicalUrl,
    name: preset.name,
    description: preset.description ?? undefined,
    url: canonicalUrl,
    image: preset.cover_url ?? `${SITE_URL}/api/og/preset/${preset.id}`,
    inLanguage: params.locale,
    datePublished: preset.created_at,
    dateModified: preset.updated_at,
    author: author?.username
      ? {
          "@type": "Person",
          name: author.username,
          url: `${SITE_URL}/${params.locale}/profile/${preset.author_id}`,
        }
      : undefined,
    interactionStatistic: [
      {
        "@type": "InteractionCounter",
        interactionType: "https://schema.org/PlayAction",
        userInteractionCount: preset.play_count,
      },
      {
        "@type": "InteractionCounter",
        interactionType: "https://schema.org/LikeAction",
        userInteractionCount: preset.like_count,
      },
    ],
    isPartOf: {
      "@type": "WebSite",
      name: "GameTrend",
      url: SITE_URL,
    },
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: tSeo("breadcrumbHome"), item: `${SITE_URL}/${params.locale}` },
      { "@type": "ListItem", position: 2, name: tSeo("breadcrumbPresets"), item: `${SITE_URL}/${params.locale}/presets` },
      { "@type": "ListItem", position: 3, name: preset.name, item: canonicalUrl },
    ],
  };

  return (
    <div>
      <script
        type="application/ld+json"
        // dangerouslySetInnerHTML est la méthode officielle Next/React pour
        // injecter du JSON-LD : on doit produire la string sérialisée.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(creativeWorkLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />
      <PresetViewTracker presetId={preset.id} />
      <Header
        title=""
        backHref="/presets"
        actions={
          <div className="flex items-center gap-1.5">
            {isOwner && (
              <Link
                href={`/presets/${preset.id}/edit`}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-surface-700/80 hover:bg-surface-600/80 text-white text-sm transition-colors border border-surface-600/50"
                title={t("edit")}
              >
                ✏️
              </Link>
            )}
            <ShareButton url={shareUrl} name={preset.name} iconOnly />
          </div>
        }
      />

      {/* ── Hero ── */}
      <div className={`relative w-full bg-gradient-to-br ${gameMeta.color}`} style={{ height: "220px" }}>
        {preset.cover_url ? (
          <Image src={preset.cover_url} alt={preset.name} fill className="object-cover" unoptimized />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-9xl opacity-[0.07]">{gameMeta.icon}</span>
          </div>
        )}
        {/* gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-surface-950 via-surface-950/40 to-transparent" />
        {/* game badge */}
        <div className="absolute top-3 left-4">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-950/70 backdrop-blur-sm border border-surface-700/40 text-xs font-semibold text-white">
            {gameMeta.icon} {gameMeta.name}
          </span>
        </div>
        {/* Title overlaid */}
        <div className="absolute bottom-4 left-4 right-4">
          <h1 className="text-2xl font-display font-black text-white leading-tight drop-shadow">
            {preset.name}
          </h1>
        </div>
      </div>

      <div className="px-4 space-y-6 pb-12 -mt-1">

        {/* ── Author + stats ── */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            {author?.avatar_url ? (
              <div className="relative w-7 h-7 rounded-full overflow-hidden shrink-0 ring-2 ring-surface-700">
                <Image src={author.avatar_url} alt={author.username ?? ""} fill className="object-cover" unoptimized />
              </div>
            ) : (
              <div className="w-7 h-7 rounded-full bg-brand-700/60 flex items-center justify-center text-xs font-bold text-white ring-2 ring-surface-700 shrink-0">
                {author?.username?.charAt(0)?.toUpperCase() ?? "?"}
              </div>
            )}
            <span className="text-surface-400 text-sm">{author?.username ?? tCommon("anonymous")}</span>
            <CreatorBadge status={author?.subscription_status} />
            <span className="text-surface-700 text-xs">·</span>
            <span className="text-surface-600 text-xs">{formatRelative(preset.created_at)}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-surface-500">
            <span>🎮 {preset.play_count}</span>
            <span>★ {preset.like_count}</span>
          </div>
        </div>

        {/* ── Description ── */}
        {preset.description && (
          <p className="text-surface-300 text-sm leading-relaxed -mt-2">
            {preset.description}
          </p>
        )}

        {/* ── Stats chips ── */}
        <div className="flex flex-wrap gap-2 -mt-2">
          {isGhostWord && ghostConfig?.families && (
            <>
              <div className="px-3 py-1.5 rounded-full bg-surface-800/60 border border-surface-700/40 text-xs text-surface-400">
                📝 {t("familiesCount", { count: ghostConfig.families.length })}
              </div>
              <div className="px-3 py-1.5 rounded-full bg-surface-800/60 border border-surface-700/40 text-xs text-surface-400">
                🔤 {t("wordsCount", { count: totalWords })}
              </div>
            </>
          )}
          {isDYP && dypConfig?.cards && (
            <div className="px-3 py-1.5 rounded-full bg-surface-800/60 border border-surface-700/40 text-xs text-surface-400">
              🃏 {t("cardsCount", { count: dypConfig.cards.length })}
            </div>
          )}
          {preset.is_public ? (
            <div className="px-3 py-1.5 rounded-full bg-emerald-950/50 border border-emerald-800/40 text-xs text-emerald-400">
              {t("public")}
            </div>
          ) : (
            <div className="px-3 py-1.5 rounded-full bg-amber-950/40 border border-amber-800/40 text-xs text-amber-400">
              {t("private")}
            </div>
          )}
        </div>

        {/* ── CTA principal ── */}
        <Link
          href={gameMeta.gameHref(preset.id)}
          className="flex items-center justify-center gap-2 w-full bg-gradient-brand text-white font-display font-bold text-base py-4 rounded-2xl hover:opacity-92 transition-opacity shadow-lg shadow-brand-900/30"
        >
          {t("playWith")} {gameMeta.icon}
        </Link>

        {/* ── Actions secondaires ── */}
        <div className="grid grid-cols-2 gap-2.5 -mt-3">
          <FavoriteButton presetId={preset.id} userId={user?.id ?? null} variant="full" />
          <ShareButton url={shareUrl} name={preset.name} fullWidth />
        </div>

        {/* ── Signalement ── */}
        {!isOwner && (
          <div className="flex justify-end -mt-1">
            <ReportButton presetId={preset.id} presetName={preset.name} userId={user?.id ?? null} />
          </div>
        )}

        {/* ── Familles GhostWord ── */}
        {isGhostWord && ghostConfig?.families && ghostConfig.families.length > 0 && (
          <div>
            <SectionHeader
              emoji="📝"
              title={t("families")}
              badge={t("familiesCount", { count: ghostConfig.families.length })}
            />
            <div className="space-y-2">
              {ghostConfig.families.map((family: WordFamily) => (
                <details key={family.id} className="rounded-2xl border border-surface-700/40 bg-surface-900/50 overflow-hidden group">
                  <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none list-none hover:bg-surface-800/30 transition-colors">
                    <span className="flex-1 text-sm font-semibold text-white">
                      {family.name || <span className="text-surface-500 italic">{t("unnamed")}</span>}
                    </span>
                    <span className="text-surface-600 text-xs font-mono">{t("wordsCount", { count: family.words.length })}</span>
                    <span className="text-surface-600 text-xs transition-transform group-open:rotate-180">▼</span>
                  </summary>
                  <div className="border-t border-surface-800/60 px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {family.words.map((word) => (
                        <div
                          key={word.id}
                          className="flex items-center gap-1.5 bg-surface-800/80 border border-surface-700/30 rounded-xl px-2.5 py-1.5"
                        >
                          {word.imageUrl && (
                            <div className="relative w-5 h-5 rounded-md overflow-hidden shrink-0">
                              <Image src={word.imageUrl} alt={word.name} fill className="object-cover" unoptimized />
                            </div>
                          )}
                          <span className="text-white text-xs font-medium">{word.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </div>
        )}

        {/* ── Rôles GhostWord ── */}
        {isGhostWord && ghostConfig?.roles && (
          <div>
            <SectionHeader emoji="🎭" title={t("rolesTitle")} />
            <div className="grid grid-cols-3 gap-2.5">
              {(["initie", "ombre", "vide"] as const).map((role) => {
                const style = ROLE_STYLE[role];
                return (
                  <div
                    key={role}
                    className={`flex flex-col items-center gap-2 p-4 rounded-2xl ${style.bg} border ${style.border}`}
                  >
                    <span className="text-2xl">{style.emoji}</span>
                    <div className="text-center">
                      <p className="text-[10px] text-surface-500 uppercase tracking-wide">{t(`rolesLabels.${role}`)}</p>
                      <p className="text-white font-bold text-sm mt-0.5 leading-tight">
                        {ghostConfig.roles[role].name}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Cartes DYP (accordéon) ── */}
        {isDYP && dypConfig?.cards && (
          <div>
            <SectionHeader
              emoji="🃏"
              title={t("cards")}
              badge={t("cardsCount", { count: dypConfig.cards.length })}
            />
            <details className="rounded-2xl border border-surface-700/40 bg-surface-900/50 overflow-hidden group">
              <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none list-none hover:bg-surface-800/30 transition-colors">
                <span className="text-sm font-semibold text-white">{t("viewAllCards")}</span>
                <span className="text-surface-600 text-xs transition-transform group-open:rotate-180">▼</span>
              </summary>
              <div className="border-t border-surface-800/60 p-4">
                {/* Cards with images → grid */}
                {dypConfig.cards.some((c: DYPCard) => c.imageUrl) ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {dypConfig.cards.map((card: DYPCard) => (
                      <div key={card.id} className="flex flex-col items-center gap-1.5">
                        <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-surface-800 border border-surface-700/40">
                          {card.imageUrl ? (
                            <Image src={card.imageUrl} alt={card.name} fill className="object-cover" unoptimized />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-surface-700 text-2xl">🃏</div>
                          )}
                        </div>
                        <span className="text-white text-xs font-medium text-center leading-tight line-clamp-2">{card.name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Cards without images → pills */
                  <div className="flex flex-wrap gap-2">
                    {dypConfig.cards.map((card: DYPCard) => (
                      <span
                        key={card.id}
                        className="px-3 py-1.5 rounded-xl bg-surface-800/80 border border-surface-700/30 text-white text-xs font-medium"
                      >
                        {card.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </details>
          </div>
        )}

        {/* ── Palmarès DYP (accordéon) ── */}
        {isDYP && (
          <div>
            <SectionHeader
              emoji="🏆"
              title={t("rankings")}
              badge={totalDYPGames > 0 ? t("rankingsBadge", { count: totalDYPGames }) : undefined}
            />
            <details className="rounded-2xl border border-surface-700/40 bg-surface-900/50 overflow-hidden group">
              <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none list-none hover:bg-surface-800/30 transition-colors">
                <span className="text-sm font-semibold text-white">
                  {topCards.length > 0 ? `🥇 ${topCards[0]?.name}` : t("noData")}
                </span>
                <span className="text-surface-600 text-xs transition-transform group-open:rotate-180">▼</span>
              </summary>
              <div className="border-t border-surface-800/60">
                {topCards.length === 0 ? (
                  <div className="px-5 py-8 text-center">
                    <p className="text-3xl mb-2 opacity-30">🏆</p>
                    <p className="text-surface-500 text-sm">{t("noGames")}</p>
                    <p className="text-surface-600 text-xs mt-1">{t("playToSeeRanking")}</p>
                  </div>
                ) : (
                  <>
                    {/* Podium top 3 */}
                    {topCards.slice(0, 3).length > 0 && (
                      <div className="grid grid-cols-3 gap-0 border-b border-surface-800/40">
                        {[topCards[1], topCards[0], topCards[2]].map((card, podiumIdx) => {
                          if (!card) return <div key={podiumIdx} />;
                          const rank = podiumIdx === 0 ? 2 : podiumIdx === 1 ? 1 : 3;
                          const isFirst = rank === 1;
                          const winPct = card.appearances > 0 ? Math.round((card.wins / card.appearances) * 100) : 0;
                          return (
                            <div
                              key={card.name}
                              className={`flex flex-col items-center gap-2 px-2 py-4 ${isFirst ? "bg-amber-950/20 border-x border-amber-900/20" : ""}`}
                            >
                              <span className="text-xl">{MEDALS[rank]}</span>
                              {card.imageUrl ? (
                                <div className={`relative rounded-xl overflow-hidden border ${isFirst ? "border-amber-700/40 w-14 h-14" : "border-surface-700/40 w-11 h-11"}`}>
                                  <Image src={card.imageUrl} alt={card.name} fill className="object-cover" unoptimized />
                                </div>
                              ) : (
                                <div className={`rounded-xl bg-surface-800 flex items-center justify-center ${isFirst ? "w-14 h-14 text-2xl" : "w-11 h-11 text-xl"}`}>
                                  ⚡
                                </div>
                              )}
                              <div className="text-center">
                                <p className={`font-bold leading-tight line-clamp-2 ${isFirst ? "text-amber-300 text-sm" : "text-white text-xs"}`}>
                                  {card.name}
                                </p>
                                <p className={`font-bold mt-0.5 ${isFirst ? "text-amber-400 text-sm" : "text-surface-500 text-xs"}`}>
                                  {winPct}%
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {/* Reste du classement */}
                    {topCards.length > 3 && (
                      <div className="divide-y divide-surface-800/30">
                        {topCards.slice(3).map((card, i) => {
                          const rank = i + 4;
                          const winPct = card.appearances > 0 ? Math.round((card.wins / card.appearances) * 100) : 0;
                          return (
                            <div key={card.name} className="flex items-center gap-3 px-4 py-2.5">
                              <span className="text-surface-600 text-xs font-mono w-5 text-center shrink-0">#{rank}</span>
                              {card.imageUrl ? (
                                <div className="relative w-8 h-8 rounded-lg overflow-hidden shrink-0">
                                  <Image src={card.imageUrl} alt={card.name} fill className="object-cover" unoptimized />
                                </div>
                              ) : (
                                <div className="w-8 h-8 rounded-lg bg-surface-800 shrink-0 flex items-center justify-center text-sm">⚡</div>
                              )}
                              <p className="flex-1 text-white text-sm font-medium truncate">{card.name}</p>
                              <span className="text-surface-500 text-xs font-bold shrink-0">{winPct}%</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            </details>
          </div>
        )}

        {/* ── Commentaires ── */}
        <div className="pt-2 border-t border-surface-800/60">
          <PresetComments presetId={preset.id} />
        </div>

        {/* ── Ad bas de page (non-premium uniquement, après le contenu) ── */}
        <AdSlot placement="preset-detail" />

        {/* ── Actions owner ── */}
        {isOwner && (
          <div className="space-y-2.5 pt-2 border-t border-surface-800/60">
            <p className="text-xs text-surface-600 uppercase tracking-wide">{t("management")}</p>
            <Link
              href={`/presets/${preset.id}/edit`}
              className="flex items-center justify-center gap-2 w-full bg-surface-800/60 hover:bg-surface-700/60 text-white font-semibold py-3 rounded-2xl border border-surface-700/40 transition-colors text-sm"
            >
              {t("editThisPreset")}
            </Link>
            <PresetAnalyticsButton presetId={preset.id} />
            <DeletePresetButton presetId={preset.id} redirectTo="/profile" />
          </div>
        )}
      </div>
    </div>
  );
}
