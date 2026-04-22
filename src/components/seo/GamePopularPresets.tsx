import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { createPublicClient } from "@/lib/supabase/server";
import PresetCard from "@/components/presets/PresetCard";
import type { Preset } from "@/types/database";
import { PRESET_LIST_COLS } from "@/lib/supabase/columns";
import { getAcceptedPresetTypes } from "@/games/compat";

interface Props {
  gameType: string;
  locale: string;
}

/**
 * Section "Presets populaires" indexable rendue côté serveur.
 * À placer dans le `layout.tsx` d'une page-jeu (sous les `{children}` qui
 * peuvent être des Client Components).
 *
 * Bénéfices SEO :
 *   - Contenu utile pour Google (≠ d'un lobby vide pour un crawler)
 *   - Maillage interne fort vers les pages preset (PageRank flow)
 *   - Mots-clés naturels du game (nom + description) + nom des presets
 */
export default async function GamePopularPresets({ gameType, locale }: Props) {
  const t = await getTranslations({ locale, namespace: "games.seo" });
  // Inclut aussi les presets d'autres jeux compatibles (ex: page Blind Rank
  // affiche les presets DYP populaires car ils sont jouables en Blind Rank).
  const acceptedTypes = getAcceptedPresetTypes(gameType);
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("presets")
    .select(PRESET_LIST_COLS)
    .eq("is_public", true)
    .in("game_type", acceptedTypes)
    .gt("play_count", 0)
    .is("archived_at", null)
    .order("play_count", { ascending: false })
    .limit(6);

  const presets = (data as Preset[] | null) ?? [];
  if (presets.length === 0) return null;

  return (
    <section className="px-4 pb-10 pt-2 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-display font-bold text-white flex items-center gap-2">
          <span className="text-orange-400">🔥</span> {t("popularForGame")}
        </h2>
        <Link
          href={`/presets?game=${gameType}`}
          className="text-brand-400 text-xs font-medium hover:text-brand-300 transition-colors"
        >
          {t("seeAll")} →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {presets.map((preset, i) => (
          <PresetCard key={preset.id} preset={preset} index={i} compact />
        ))}
      </div>
    </section>
  );
}
