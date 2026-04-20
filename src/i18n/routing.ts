import { defineRouting } from "next-intl/routing";

/**
 * Configuration centrale du multilangue.
 *
 * Ajouter une nouvelle langue =
 *   1. ajouter le code dans `locales`
 *   2. créer le fichier `src/messages/<code>.json`
 *   3. ajouter une option dans le toggle de langue (Header)
 *
 * Le préfixe d'URL est OBLIGATOIRE pour toutes les locales (`always`),
 * pour un meilleur SEO et des URLs partageables sans ambiguïté.
 */
export const routing = defineRouting({
  locales: ["fr", "en"] as const,
  defaultLocale: "fr",
  localePrefix: "always",
  // Cookie persistant : une fois la langue choisie, elle est conservée.
  localeCookie: {
    name: "NEXT_LOCALE",
    maxAge: 60 * 60 * 24 * 365, // 1 an
  },
});

export type Locale = (typeof routing.locales)[number];
