import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { GameMeta } from "@/types/games";
import { SITE_URL } from "./sitemap";

interface BuildGameMetadataInput {
  game: GameMeta;
  locale: string;
}

/**
 * Génère les métadonnées Next pour une page de jeu (lobby).
 * Factorise le code commun entre `/games/ghostword/layout.tsx` et
 * `/games/dyp/layout.tsx`.
 */
export async function buildGameMetadata({
  game,
  locale,
}: BuildGameMetadataInput): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "games.seo" });

  const title = t("gameTitle", { name: game.name });
  const description = t("gameDescription", {
    name: game.name,
    short: game.description,
    min: game.minPlayers,
    max: game.maxPlayers,
    duration: game.estimatedDuration,
  });
  const canonicalPath = `/${locale}/games/${game.id}`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
      languages: {
        fr: `/fr/games/${game.id}`,
        en: `/en/games/${game.id}`,
        "x-default": `/fr/games/${game.id}`,
      },
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: `${SITE_URL}${canonicalPath}`,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

/**
 * JSON-LD `Game` (schema.org). Différent de `VideoGame` qui implique un
 * éditeur commercial. `Game` est plus adapté à une œuvre communautaire.
 *
 * On enrichit avec `applicationCategory: "Game"` qui aide Google à
 * comprendre que c'est une web app jouable.
 */
export function buildGameJsonLd({
  game,
  locale,
}: {
  game: GameMeta;
  locale: string;
}) {
  const url = `${SITE_URL}/${locale}/games/${game.id}`;
  return {
    "@context": "https://schema.org",
    "@type": "Game",
    "@id": url,
    name: game.name,
    description: game.description,
    url,
    inLanguage: locale,
    genre: "Party Game",
    numberOfPlayers: {
      "@type": "QuantitativeValue",
      minValue: game.minPlayers,
      maxValue: game.maxPlayers,
    },
    timeRequired: game.estimatedDuration,
    keywords: game.tags?.join(", "),
    publisher: {
      "@type": "Organization",
      name: "GameTrend",
      url: SITE_URL,
    },
  };
}
