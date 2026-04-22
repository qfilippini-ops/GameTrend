import type { Metadata } from "next";
import { BLINDRANK_META } from "@/games/blindrank/config";
import { buildGameMetadata, buildGameJsonLd } from "@/lib/seo/game-meta";
import GamePopularPresets from "@/components/seo/GamePopularPresets";
import BlindRankLobbyClient from "./BlindRankLobbyClient";

/**
 * Page-jeu Blind Rank (Server). Voir `ghostword/page.tsx` pour le pattern :
 *   - Server component pour les métadonnées SEO + JSON-LD
 *   - Lobby client séparé (state, framer, localStorage)
 *   - Section presets populaires indexable rendue après le lobby
 */

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return buildGameMetadata({ game: BLINDRANK_META, locale: params.locale });
}

export default function BlindRankGamePage({
  params,
}: {
  params: { locale: string };
}) {
  const ld = buildGameJsonLd({ game: BLINDRANK_META, locale: params.locale });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />
      <BlindRankLobbyClient />
      <GamePopularPresets gameType={BLINDRANK_META.id} locale={params.locale} />
    </>
  );
}
