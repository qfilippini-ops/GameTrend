/**
 * Helpers de génération de sitemaps XML conformes au protocole sitemaps.org
 * + extension xhtml pour les balises `<xhtml:link rel="alternate" hreflang>`
 * (recommandée par Google pour les sites multilingues).
 *
 * Pourquoi écrire le XML à la main et pas utiliser `MetadataRoute.Sitemap`
 * de Next.js ? Parce que l'API Next ne sait pas générer un sitemap-index
 * (un sitemap qui pointe vers d'autres sitemaps), ni les balises xhtml:link
 * pour les hreflang. Pour un site multilingue avec >50k URLs potentielles
 * (presets), on a besoin du découpage en plusieurs sitemaps.
 */

export const SITE_URL = "https://www.gametrend.fr";
export const LOCALES = ["fr", "en"] as const;
export const DEFAULT_LOCALE = "fr";
export type Locale = (typeof LOCALES)[number];

/** Échappe les caractères spéciaux XML pour éviter de casser le parsing */
export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export type ChangeFreq =
  | "always"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "never";

export interface SitemapEntry {
  /**
   * Path absolu sans la locale ni le domaine. Exemples :
   *   "/"               → /fr et /en (variantes hreflang)
   *   "/presets/abc"    → /fr/presets/abc et /en/presets/abc
   *   "/affiliation"    → /fr/affiliation et /en/affiliation
   *
   * On ne gère QUE les URLs préfixées par locale (toutes nos pages publiques
   * le sont, c'est la convention `next-intl`).
   */
  path: string;
  lastmod?: Date | string;
  changefreq?: ChangeFreq;
  priority?: number;
  /**
   * Si false, on n'émet qu'UNE seule entrée (en defaultLocale) sans hreflang.
   * Utile pour les pages qui n'ont pas de version localisée (rare).
   */
  withHreflang?: boolean;
}

/**
 * Sérialise une date en ISO 8601 (YYYY-MM-DD), format recommandé pour `<lastmod>`
 */
function formatLastmod(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return new Date().toISOString().split("T")[0];
  return date.toISOString().split("T")[0];
}

/**
 * Construit un bloc `<url>` avec ses variantes hreflang.
 *
 * IMPORTANT : Google demande que CHAQUE variante linguistique réémette TOUS
 * les `<xhtml:link>` (y compris vers elle-même). On émet donc une `<url>`
 * par locale, chacune avec le set complet de hreflang.
 */
function buildUrl(entry: SitemapEntry): string {
  const lastmod = entry.lastmod ? formatLastmod(entry.lastmod) : undefined;
  const withHreflang = entry.withHreflang !== false;

  if (!withHreflang) {
    const loc = `${SITE_URL}/${DEFAULT_LOCALE}${entry.path === "/" ? "" : entry.path}`;
    return [
      "  <url>",
      `    <loc>${xmlEscape(loc)}</loc>`,
      lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
      entry.changefreq ? `    <changefreq>${entry.changefreq}</changefreq>` : null,
      entry.priority !== undefined ? `    <priority>${entry.priority.toFixed(1)}</priority>` : null,
      "  </url>",
    ]
      .filter(Boolean)
      .join("\n");
  }

  const localizedUrl = (locale: Locale) =>
    `${SITE_URL}/${locale}${entry.path === "/" ? "" : entry.path}`;

  // Ensemble des liens alternates (identique pour toutes les variantes locales)
  const alternates = LOCALES.map(
    (locale) =>
      `    <xhtml:link rel="alternate" hreflang="${locale}" href="${xmlEscape(
        localizedUrl(locale)
      )}"/>`
  )
    .concat(
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(
        localizedUrl(DEFAULT_LOCALE)
      )}"/>`
    )
    .join("\n");

  return LOCALES.map((locale) => {
    const lines = [
      "  <url>",
      `    <loc>${xmlEscape(localizedUrl(locale))}</loc>`,
      lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
      entry.changefreq ? `    <changefreq>${entry.changefreq}</changefreq>` : null,
      entry.priority !== undefined ? `    <priority>${entry.priority.toFixed(1)}</priority>` : null,
      alternates,
      "  </url>",
    ];
    return lines.filter(Boolean).join("\n");
  }).join("\n");
}

/** Sérialise un set d'entrées en sitemap.xml complet */
export function renderUrlSet(entries: SitemapEntry[]): string {
  const body = entries.map(buildUrl).join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    body,
    "</urlset>",
  ].join("\n");
}

/** Sérialise un sitemap-index pointant vers d'autres sitemaps */
export function renderSitemapIndex(sitemaps: { loc: string; lastmod?: Date | string }[]): string {
  const body = sitemaps
    .map((s) => {
      const lines = [
        "  <sitemap>",
        `    <loc>${xmlEscape(s.loc)}</loc>`,
        s.lastmod ? `    <lastmod>${formatLastmod(s.lastmod)}</lastmod>` : null,
        "  </sitemap>",
      ];
      return lines.filter(Boolean).join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    body,
    "</sitemapindex>",
  ].join("\n");
}

/**
 * Helper de réponse HTTP : sitemap = `application/xml`, cache HTTP 1h
 * (CDN Vercel) + s-maxage long pour soulager Supabase. Les sitemaps n'ont
 * pas besoin d'être ultra-frais : Google les recrawle ~1×/jour de toute façon.
 */
export function xmlResponse(xml: string, options?: { cacheSeconds?: number }): Response {
  const cache = options?.cacheSeconds ?? 3600;
  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": `public, s-maxage=${cache}, stale-while-revalidate=${cache * 2}`,
    },
  });
}
