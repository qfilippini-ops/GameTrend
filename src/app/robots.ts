import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/sitemap";

/**
 * robots.txt dynamique.
 *
 * Stratégie de crawl :
 *   - allow par défaut TOUT (on veut maximiser l'indexation pour le SEO)
 *   - disallow uniquement les pages "privées" qui n'ont aucun intérêt SEO :
 *       * /api/                  → endpoints serveur
 *       * /auth/                 → écrans connexion / signup
 *       * /profile               → profil PERSO du user connecté (≠ /profile/<id>)
 *       * /profile/*/followers   → pas de PageRank à gagner sur des listes
 *       * /profile/*/following
 *       * /presets/new           → form de création (vide pour un crawler)
 *       * /presets/*/edit        → édition (privée)
 *       * /games/*/play          → écran de jeu actif (state-driven)
 *       * /games/*/online        → idem
 *       * /games/*/online/*      → variantes avec [code]
 *       * /join/*                → liens de rejoindre une partie
 *       * /r/*                   → liens courts d'affiliation (redirige)
 *       * /friends               → page sociale interne
 *       * /premium/analytics/*   → analytics privées créateur
 *
 * Important :
 *   - On utilise `*` en préfixe pour matcher AUSSI les variantes localisées
 *     (`/fr/profile`, `/en/profile`, etc.)
 *   - L'ordre Disallow/Allow ne compte pas : Google applique la règle la PLUS
 *     SPÉCIFIQUE (plus longue), donc `Allow: */profile/` débloque les profils
 *     publics même si `Disallow: */profile` existe.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          // Réactive explicitement les profils publics : `Disallow: */profile`
          // bloquerait sinon `/profile/<id>` qu'on veut indexer.
          "*/profile/",
          // Les routes OG dynamiques DOIVENT être crawlables : Google + les
          // réseaux sociaux (Discord, X, WhatsApp) ont besoin de récupérer
          // l'image pour afficher la preview du lien partagé.
          "/api/og/",
        ],
        disallow: [
          "/api/",
          "*/auth/",
          "*/profile",
          "*/profile/*/followers",
          "*/profile/*/following",
          "*/presets/new",
          "*/presets/*/edit",
          "*/games/*/play",
          "*/games/*/online",
          "*/join/",
          "/r/",
          "*/friends",
          "*/premium/analytics/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
