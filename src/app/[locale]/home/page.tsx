import { Link } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createPublicClient } from "@/lib/supabase/server";
import PresetCard from "@/components/presets/PresetCard";
import Header from "@/components/layout/Header";
import QuickJoinBar from "@/components/QuickJoinBar";
import { GAMES_REGISTRY } from "@/games/registry";
import { PRESET_LIST_COLS } from "@/lib/supabase/columns";
import type { Preset } from "@/types/database";

// ISR : la page (popular presets) est régénérée au max toutes les 5 min.
// L'état user reste géré côté client par Header/BottomNav (hydratation),
// donc on peut cacher le HTML sans risque pour l'auth.
export const revalidate = 300;

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");

  const supabase = createPublicClient();
  const { data } = await supabase
    .from("presets")
    .select(PRESET_LIST_COLS)
    .eq("is_public", true)
    .order("play_count", { ascending: false })
    .limit(5);
  const popularPresets: Preset[] | null = data as Preset[] | null;

  return (
    <div className="bg-grid min-h-screen">
      <Header />

      <div className="px-4 pt-4 pb-8 space-y-5">

        {/* ── HERO ─────────────────────────────────────────────────────────── */}
        <div className="relative rounded-2xl bg-gradient-to-br from-brand-950 via-surface-900 to-ghost-950 border border-brand-700/20 px-5 py-4 overflow-hidden">
          <div className="absolute -top-8 -left-8 w-36 h-36 bg-brand-600/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-8 -right-8 w-36 h-36 bg-ghost-600/15 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex items-center justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-500/15 text-brand-300 border border-brand-500/25 mb-2">
                <span className="w-1 h-1 rounded-full bg-brand-400 animate-pulse" />
                {t("mvpTag")}
              </span>
              <h1 className="text-2xl font-display font-bold text-white leading-tight tracking-tight">
                {t("heroTitle1")}{" "}
                <span className="text-gradient-brand">{t("heroTitle2")}</span>{" "}
                {t("heroTitle3")}
              </h1>
            </div>

            <a
              href="#games"
              className="shrink-0 inline-flex items-center gap-1.5 bg-gradient-brand text-white font-bold px-4 py-2.5 rounded-xl glow-brand hover:opacity-90 transition-opacity text-sm whitespace-nowrap"
            >
              {t("heroCta")} <span>→</span>
            </a>
          </div>
        </div>

        {/* ── QUICK JOIN ───────────────────────────────────────────────────── */}
        <QuickJoinBar />

        {/* ── JEUX ─────────────────────────────────────────────────────────── */}
        <div id="games">
          <h2 className="text-base font-display font-bold text-white mb-3 flex items-center gap-2">
            <span>🎮</span> {t("availableGames")}
          </h2>

          <div className="grid grid-cols-2 gap-3">
            {GAMES_REGISTRY.map((game) => (
              <Link
                key={game.id}
                href={`/games/${game.id}`}
                className="relative rounded-2xl border border-brand-700/30 bg-gradient-to-b from-[#0c1145] to-[#3b0040] flex flex-col justify-between p-3.5 group hover:border-brand-500/50 transition-all overflow-hidden"
                style={{ height: "156px" }}
              >
                <div className="absolute -top-6 -right-6 w-20 h-20 bg-brand-600/10 rounded-full blur-2xl pointer-events-none" />
                <div className="relative">
                  <div className="text-3xl mb-1.5">{game.icon}</div>
                  <h3 className="font-display font-bold text-white text-base leading-tight">
                    {game.name}
                  </h3>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {game.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/10 text-white/75 border border-white/15 font-medium"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-brand-300 text-xs font-bold group-hover:gap-2 transition-all">
                  {t("playGame")} <span>→</span>
                </div>
              </Link>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <Link
              href="/presets/new"
              className="relative rounded-xl border-2 border-dashed border-surface-700/50 hover:border-brand-500/60 bg-surface-900/40 hover:bg-brand-950/30 flex items-center justify-center gap-2.5 px-3 py-3 transition-all group"
            >
              <div className="w-7 h-7 rounded-lg bg-brand-600/20 border border-brand-500/30 flex items-center justify-center text-sm group-hover:bg-brand-600/30 transition-colors shrink-0">
                ✨
              </div>
              <div>
                <p className="text-white font-semibold text-xs leading-tight">{t("createPresetTitle")}</p>
                <p className="text-surface-600 text-[10px]">{t("createPresetSubtitle")}</p>
              </div>
            </Link>

            <Link
              href="/presets"
              className="relative rounded-xl border border-surface-700/40 bg-surface-900/40 hover:border-ghost-500/40 hover:bg-ghost-950/30 flex items-center justify-center gap-2.5 px-3 py-3 transition-all group"
            >
              <div className="w-7 h-7 rounded-lg bg-ghost-600/20 border border-ghost-500/30 flex items-center justify-center text-sm shrink-0">
                📦
              </div>
              <div>
                <p className="text-white font-semibold text-xs leading-tight">{t("exploreTitle")}</p>
                <p className="text-surface-600 text-[10px]">{t("exploreSubtitle")}</p>
              </div>
            </Link>
          </div>
        </div>

        {/* ── PRESETS POPULAIRES ────────────────────────────────────────────── */}
        {popularPresets && popularPresets.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-display font-bold text-white flex items-center gap-2">
                <span className="text-orange-400">🔥</span> {t("popular")}
              </h2>
              <Link
                href="/presets"
                className="text-brand-400 text-xs font-medium hover:text-brand-300 transition-colors"
              >
                {t("seeAll")} →
              </Link>
            </div>

            <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
              {popularPresets.map((preset, i) => (
                <div key={preset.id} className="shrink-0 w-40">
                  <PresetCard preset={preset} index={i} compact />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── JEUX À VENIR ──────────────────────────────────────────────────── */}
        <div>
          <h2 className="text-base font-display font-bold text-white mb-3 flex items-center gap-2">
            <span>🚀</span> {t("comingSoon")}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: "🧩", name: t("soonGames.quiz"), tags: t("soonGames.quizTags") },
              { icon: "🏷️", name: t("soonGames.auction"), tags: t("soonGames.auctionTags") },
            ].map((game) => (
              <div
                key={game.name}
                className="relative rounded-2xl border border-surface-700/30 bg-surface-900/30 p-4 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-surface-800/10 to-transparent pointer-events-none" />
                <div className="text-2xl mb-2 opacity-40">{game.icon}</div>
                <p className="font-display font-bold text-surface-500 text-sm mb-0.5">{game.name}</p>
                <p className="text-surface-700 text-xs">{game.tags}</p>
                <span className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-950/60 text-amber-500 border border-amber-700/30 font-medium">
                  {t("comingSoonBadge")}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
