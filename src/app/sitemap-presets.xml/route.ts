import { renderUrlSet, type SitemapEntry, xmlResponse } from "@/lib/seo/sitemap";
import { createPublicClient } from "@/lib/supabase/server";

/**
 * Sitemap des presets publics. Filtres anti-spam UGC :
 *   - is_public = true            (auteur a explicitement publié)
 *   - play_count > 0              (au moins une partie jouée = preset "validé")
 *   - archived_at IS NULL         (preset non archivé)
 *
 * Limite à 50 000 entrées par sitemap (spec sitemaps.org). Au-delà, il
 * faudrait paginer (sitemap-presets-1.xml, sitemap-presets-2.xml...) mais
 * tant qu'on n'a pas atteint ce volume, un seul fichier suffit.
 */
export const dynamic = "force-dynamic";
export const revalidate = 3600;

const SITEMAP_LIMIT = 50_000;

export async function GET() {
  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from("presets")
    .select("id, updated_at, play_count")
    .eq("is_public", true)
    .gt("play_count", 0)
    .is("archived_at", null)
    .order("play_count", { ascending: false })
    .limit(SITEMAP_LIMIT);

  if (error) {
    // Plutôt que de renvoyer un 500 (qui ferait dégrader le sitemap dans
    // Search Console), on retourne un sitemap vide. L'index continue de pointer.
    console.error("[sitemap-presets] supabase error", error);
    return xmlResponse(renderUrlSet([]));
  }

  const entries: SitemapEntry[] = (data ?? []).map((preset) => {
    // Priorité dégressive selon la popularité, plafonnée à 0.8
    // (la landing reste à 1.0). Logarithmique pour ne pas trop creuser.
    const playBoost = Math.min(Math.log10(preset.play_count + 1) / 3, 0.4);
    return {
      path: `/presets/${preset.id}`,
      lastmod: preset.updated_at,
      changefreq: "weekly",
      priority: Math.min(0.4 + playBoost, 0.8),
    };
  });

  return xmlResponse(renderUrlSet(entries));
}
