import type { Metadata } from "next";
import { GHOSTWORD_META } from "@/games/ghostword/config";
import { buildGameMetadata, buildGameJsonLd } from "@/lib/seo/game-meta";
import GamePopularPresets from "@/components/seo/GamePopularPresets";
import GhostWordLobbyClient from "./GhostWordLobbyClient";

/**
 * Page-jeu GhostWord (Server). Le lobby interactif (state, framer, localStorage)
 * est isolé dans `GhostWordLobbyClient.tsx`. Ce wrapper Server fournit :
 *   - Les métadonnées SEO (title, description, hreflang, OG, Twitter)
 *   - Le JSON-LD `Game` (schema.org)
 *   - Une section "Presets populaires" indexable rendue après le lobby
 *
 * Important : ce pattern n'affecte PAS les sous-routes /play et /online qui
 * doivent rester des écrans actifs sans contenu SEO.
 */

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return buildGameMetadata({ game: GHOSTWORD_META, locale: params.locale });
}

export default function GhostWordGamePage({
  params,
}: {
  params: { locale: string };
}) {
  const ld = buildGameJsonLd({ game: GHOSTWORD_META, locale: params.locale });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />
      <GhostWordLobbyClient />
      <GamePopularPresets gameType={GHOSTWORD_META.id} locale={params.locale} />
    </>
  );
}
