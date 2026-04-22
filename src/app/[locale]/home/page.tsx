import { redirect } from "@/i18n/navigation";

/**
 * Ancienne URL de la landing. Conservée comme redirect permanent (308) vers
 * `/` (= la nouvelle landing) pour préserver les anciens partages, bookmarks
 * et le PageRank Google déjà accumulé.
 *
 * À supprimer dans 6-12 mois quand Google aura réindexé l'ancienne URL.
 */
export default async function HomeRedirect({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect({ href: "/", locale });
}
