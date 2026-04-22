import { SITE_URL } from "@/lib/seo/sitemap";

/**
 * robots.txt servi via Route Handler.
 *
 * Pourquoi pas `app/robots.ts` (l'API officielle Next) ?
 *   Next 14.2 a un bug dans `next-metadata-route-loader` qui fait crasher le
 *   build webpack avec "The loaded module contains errors" dès qu'on importe
 *   un module externe (ex. `@/lib/seo/sitemap`) ou qu'on utilise certains
 *   champs comme `host`. Voir vercel/next.js #64403 et discussion #64745.
 *   Le route handler nous donne le même résultat sans toucher au loader.
 *
 * Stratégie de crawl identique à la spec d'origine :
 *   - allow par défaut TOUT (on veut maximiser l'indexation pour le SEO)
 *   - on réactive explicitement `*/profile/` (profils publics) et `/api/og/`
 *     (images OG dynamiques nécessaires pour les previews Discord/X/WhatsApp)
 *   - disallow couvre les pages privées sans intérêt SEO
 *
 * Note : Google applique la règle la PLUS SPÉCIFIQUE (longueur du pattern),
 * donc l'ordre Disallow/Allow ne compte pas tant que le pattern Allow est
 * plus long que le pattern Disallow correspondant.
 */
export const dynamic = "force-static";

export function GET(): Response {
  const lines = [
    "User-agent: *",
    "Allow: /",
    "Allow: */profile/",
    "Allow: /api/og/",
    "Disallow: /api/",
    "Disallow: */auth/",
    "Disallow: */profile",
    "Disallow: */profile/*/followers",
    "Disallow: */profile/*/following",
    "Disallow: */presets/new",
    "Disallow: */presets/*/edit",
    "Disallow: */games/*/play",
    "Disallow: */games/*/online",
    "Disallow: */join/",
    "Disallow: /r/",
    "Disallow: */friends",
    "Disallow: */premium/analytics/",
    "",
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    `Host: ${SITE_URL}`,
    "",
  ];

  return new Response(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
