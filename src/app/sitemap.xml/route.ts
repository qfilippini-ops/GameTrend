import { renderSitemapIndex, SITE_URL, xmlResponse } from "@/lib/seo/sitemap";

/**
 * Sitemap-index : pointe vers les 3 sous-sitemaps.
 *
 * Le découpage évite de dépasser la limite Google de 50k URLs / sitemap et
 * permet à Search Console d'afficher les stats par sous-sitemap (presets vs
 * profils vs statiques).
 */
export const dynamic = "force-static";
export const revalidate = 3600;

export function GET() {
  const now = new Date();
  const xml = renderSitemapIndex([
    { loc: `${SITE_URL}/sitemap-static.xml`, lastmod: now },
    { loc: `${SITE_URL}/sitemap-presets.xml`, lastmod: now },
    { loc: `${SITE_URL}/sitemap-profiles.xml`, lastmod: now },
  ]);
  return xmlResponse(xml);
}
