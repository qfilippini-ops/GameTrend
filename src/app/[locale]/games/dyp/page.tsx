import type { Metadata } from "next";
import { DYP_META } from "@/games/dyp/config";
import { buildGameMetadata, buildGameJsonLd } from "@/lib/seo/game-meta";
import GamePopularPresets from "@/components/seo/GamePopularPresets";
import DYPLobbyClient from "./DYPLobbyClient";

/**
 * Page-jeu DYP (Server). Voir `ghostword/page.tsx` pour le pattern.
 */

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return buildGameMetadata({ game: DYP_META, locale: params.locale });
}

export default function DYPGamePage({
  params,
}: {
  params: { locale: string };
}) {
  const ld = buildGameJsonLd({ game: DYP_META, locale: params.locale });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />
      <DYPLobbyClient />
      <GamePopularPresets gameType={DYP_META.id} locale={params.locale} />
    </>
  );
}
