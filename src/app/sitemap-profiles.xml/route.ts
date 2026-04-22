import { renderUrlSet, type SitemapEntry, xmlResponse } from "@/lib/seo/sitemap";
import { createPublicClient } from "@/lib/supabase/server";

/**
 * Sitemap des profils créateurs. On n'expose que les profils ayant publié
 * AU MOINS un preset public — un profil vide n'a aucune valeur SEO et risque
 * d'être marqué "Soft 404" par Google.
 *
 * Stratégie : on récupère les author_id distincts de la table presets (filtre
 * is_public + non archivé), puis on hydrate avec username + updated_at depuis
 * profiles. Tout en RLS public (createPublicClient).
 */
export const dynamic = "force-dynamic";
export const revalidate = 3600;

const SITEMAP_LIMIT = 50_000;

export async function GET() {
  const supabase = createPublicClient();

  // Étape 1 : ID des auteurs ayant publié un preset public valide.
  // On limite côté SQL pour éviter de tirer 100k+ lignes inutilement.
  const { data: presetAuthors, error: presetsError } = await supabase
    .from("presets")
    .select("author_id")
    .eq("is_public", true)
    .gt("play_count", 0)
    .is("archived_at", null)
    .limit(SITEMAP_LIMIT * 5); // marge pour dédupliquer

  if (presetsError) {
    console.error("[sitemap-profiles] presets query error", presetsError);
    return xmlResponse(renderUrlSet([]));
  }

  const authorIds = Array.from(
    new Set((presetAuthors ?? []).map((row) => row.author_id).filter(Boolean))
  ).slice(0, SITEMAP_LIMIT);

  if (authorIds.length === 0) {
    return xmlResponse(renderUrlSet([]));
  }

  // Étape 2 : hydrate avec username + updated_at. Les profils sans username
  // sont écartés (pas de slug = pas indexable proprement).
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, username, updated_at")
    .in("id", authorIds)
    .not("username", "is", null);

  if (profilesError) {
    console.error("[sitemap-profiles] profiles query error", profilesError);
    return xmlResponse(renderUrlSet([]));
  }

  const entries: SitemapEntry[] = (profiles ?? []).map((profile) => ({
    path: `/profile/${profile.id}`,
    lastmod: profile.updated_at,
    changefreq: "weekly",
    priority: 0.6,
  }));

  return xmlResponse(renderUrlSet(entries));
}
