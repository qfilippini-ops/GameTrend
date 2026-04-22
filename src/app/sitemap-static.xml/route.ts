import { renderUrlSet, type SitemapEntry, xmlResponse } from "@/lib/seo/sitemap";
import { GAMES_REGISTRY } from "@/games/registry";

/**
 * Sitemap des routes statiques (landing, listings, légal).
 * Renouvelé toutes les heures côté CDN (les routes statiques bougent peu).
 */
export const dynamic = "force-static";
export const revalidate = 3600;

export function GET() {
  const now = new Date();

  const entries: SitemapEntry[] = [
    // Landing : la page la plus importante du site
    { path: "/", changefreq: "daily", priority: 1.0, lastmod: now },
    // Listing public des presets
    { path: "/presets", changefreq: "daily", priority: 0.9, lastmod: now },
    // Page d'offre Premium (hub de monétisation)
    { path: "/premium", changefreq: "weekly", priority: 0.7, lastmod: now },
    // Pages légales (séparées en sous-routes /legal/*)
    { path: "/legal/cgu", changefreq: "yearly", priority: 0.2, lastmod: now },
    { path: "/legal/cgv", changefreq: "yearly", priority: 0.2, lastmod: now },
    { path: "/legal/mentions", changefreq: "yearly", priority: 0.2, lastmod: now },
    { path: "/legal/privacy", changefreq: "yearly", priority: 0.2, lastmod: now },
    // Pages jeux : générées depuis le registry pour rester DRY
    ...GAMES_REGISTRY.map<SitemapEntry>((game) => ({
      path: `/games/${game.id}`,
      changefreq: "weekly",
      priority: 0.8,
      lastmod: now,
    })),
  ];

  return xmlResponse(renderUrlSet(entries));
}
