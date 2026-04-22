"use client";

import { useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import Header from "@/components/layout/Header";
import { getPresetFormComponent } from "@/games/preset-forms";
import {
  PRESET_FAMILIES,
  getFamilyForGameType,
  getFamilyById,
  getCanonicalGameType,
  getFamilyGames,
  type PresetFamily,
} from "@/games/preset-families";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/compressImage";
import { useSubscription } from "@/hooks/useSubscription";
import { usePaywall } from "@/components/premium/PaywallProvider";

const FREE_PRESET_LIMIT = 5;

/**
 * Résolution de la famille initiale depuis les query params :
 *   1. ?family=cards   → on prend cette famille (priorité)
 *   2. ?game=blindrank → on prend la famille qui contient ce game_type
 *   3. fallback : première famille du registry
 *
 * Cette double résolution garantit la rétrocompatibilité avec les liens
 * existants `/presets/new?game=dyp` qui pointent vers la famille "cards".
 */
function resolveInitialFamily(searchParams: URLSearchParams): PresetFamily {
  const familyParam = searchParams.get("family");
  if (familyParam) {
    const fam = getFamilyById(familyParam);
    if (fam) return fam;
  }
  const gameParam = searchParams.get("game");
  if (gameParam) {
    const fam = getFamilyForGameType(gameParam);
    if (fam) return fam;
  }
  return PRESET_FAMILIES[0];
}

export default function NewPresetPage() {
  return (
    <Suspense fallback={null}>
      <NewPresetPageContent />
    </Suspense>
  );
}

function NewPresetPageContent() {
  const t = useTranslations("presets.form");
  const tFamilies = useTranslations("presets.families");
  const router = useRouter();
  const searchParams = useSearchParams();

  const [family, setFamily] = useState<PresetFamily>(() =>
    resolveInitialFamily(searchParams)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isPremium } = useSubscription();
  const { openPaywall } = usePaywall();

  // Métadonnées des jeux jouables avec la famille active (pour le bandeau).
  // Le bandeau est toujours affiché — y compris quand un seul jeu est compatible
  // — pour garder une grille visuelle cohérente entre familles et anticiper
  // l'ajout futur de jeux dans la famille "Famille" (mots).
  const compatibleGames = useMemo(() => getFamilyGames(family), [family]);

  async function safeUploadWordImage(file: File): Promise<string> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error(t("notLoggedIn"));
    const optimized = await compressImage(file, { maxWidthOrHeight: 800, maxSizeMB: 0.3 });
    const ext = optimized.name.split(".").pop();
    const path = `${user.id}/words/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("covers").upload(path, optimized);
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from("covers").getPublicUrl(path);
    return data.publicUrl;
  }

  async function handleSave(data: {
    name: string;
    description: string;
    isPublic: boolean;
    config: unknown;
    coverFile?: File;
  }) {
    setLoading(true);
    setError(null);
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      router.push("/auth/login?redirect=/presets/new");
      return;
    }

    if (!isPremium) {
      const { data: countResult } = await supabase.rpc("count_active_presets", { uid: user.id });
      const activeCount = typeof countResult === "number" ? countResult : 0;
      if (activeCount >= FREE_PRESET_LIMIT) {
        setLoading(false);
        openPaywall("presetLimit");
        return;
      }
    }

    let coverUrl: string | null = null;

    if (data.coverFile) {
      const ext = data.coverFile.name.split(".").pop();
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("covers").upload(path, data.coverFile);

      if (uploadError) {
        setError(t("errorUpload", { message: uploadError.message }));
        setLoading(false);
        return;
      }
      const { data: urlData } = supabase.storage.from("covers").getPublicUrl(path);
      coverUrl = urlData.publicUrl;
    }

    // game_type stocké = canonical de la famille (ex: 'dyp' pour cards).
    // Tous les jeux de la famille sauront le retrouver via acceptedPresetTypes.
    const canonicalGameType = getCanonicalGameType(family);

    const { error: insertError } = await supabase
      .from("presets")
      .insert({
        author_id: user.id,
        name: data.name,
        description: data.description || null,
        game_type: canonicalGameType,
        is_public: data.isPublic,
        config: data.config as unknown as Record<string, unknown>,
        cover_url: coverUrl,
      })
      .select()
      .single();

    setLoading(false);

    if (insertError) {
      setError(t("errorSave"));
      return;
    }

    router.push("/profile");
  }

  // Le formulaire est routé via le game_type canonical de la famille.
  const PresetForm = getPresetFormComponent(getCanonicalGameType(family));

  return (
    <div>
      <Header title={t("title_new")} backHref="/presets" />
      <div className="px-4 py-4 space-y-4">

        {/* ── Sélecteur de famille de preset ── */}
        <div className="rounded-2xl border border-surface-700/40 bg-surface-900/50 p-1.5">
          <div className="flex gap-1">
            {PRESET_FAMILIES.map((fam) => {
              const isActive = fam.id === family.id;
              return (
                <button
                  key={fam.id}
                  type="button"
                  onClick={() => { setFamily(fam); setError(null); }}
                  className={`relative flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-semibold transition-all ${
                    isActive
                      ? "text-white"
                      : "text-surface-500 hover:text-surface-300"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="family-tab-bg"
                      className="absolute inset-0 rounded-xl bg-surface-700/80 border border-surface-600/50"
                      transition={{ type: "spring", stiffness: 400, damping: 35 }}
                    />
                  )}
                  <span className="relative z-10">{fam.icon}</span>
                  <span className="relative z-10">
                    {tFamilies(`${fam.i18nKey}.name`)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Bandeau de compatibilité ── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={family.id}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="space-y-2"
          >
            {/* Description courte de la famille */}
            <p className="text-surface-500 text-xs px-1">
              {tFamilies(`${family.i18nKey}.description`)}
            </p>

            {/* Bandeau "Jouable en : ..." — toujours affiché pour cohérence */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-950/20 border border-amber-700/30">
              <span className="text-amber-400 text-sm shrink-0">✦</span>
              <p className="text-amber-200/90 text-xs leading-snug">
                <span className="font-semibold">
                  {tFamilies("compatibleWith")}
                </span>{" "}
                {compatibleGames.map((g, idx) => (
                  <span key={g.id}>
                    <span className="font-medium">
                      {g.icon} {g.name}
                    </span>
                    {idx < compatibleGames.length - 1 && (
                      <span className="text-amber-500/60 mx-1">·</span>
                    )}
                  </span>
                ))}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>

        {error && (
          <div className="p-4 rounded-xl bg-red-950/40 border border-red-700/50 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* ── Formulaire de la famille ── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={family.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
          >
            <PresetForm onSave={handleSave} uploadImage={safeUploadWordImage} loading={loading} />
          </motion.div>
        </AnimatePresence>

      </div>
    </div>
  );
}
