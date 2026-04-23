import type { Metadata } from "next";
import { OUTBID_META } from "@/games/outbid/config";
import { buildGameMetadata, buildGameJsonLd } from "@/lib/seo/game-meta";
import OutbidLobbyClient from "./OutbidLobbyClient";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return buildGameMetadata({ game: OUTBID_META, locale: params.locale });
}

export default function OutbidGamePage({
  params,
}: {
  params: { locale: string };
}) {
  const ld = buildGameJsonLd({ game: OUTBID_META, locale: params.locale });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />
      <OutbidLobbyClient />
    </>
  );
}
