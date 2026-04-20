"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import Header from "@/components/layout/Header";
import { getPresetFormComponent } from "@/games/preset-forms";
import { GAMES_REGISTRY } from "@/games/registry";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/compressImage";

export default function NewPresetPage() {
  return (
    <Suspense fallback={null}>
      <NewPresetPageContent />
    </Suspense>
  );
}

function NewPresetPageContent() {
  const t = useTranslations("presets.form");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [gameType, setGameType] = useState(searchParams.get("game") ?? "ghostword");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function safeUploadWordImage(file: File): Promise<string> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error(t("notLoggedIn"));
    // La modération est déjà faite dans compressImage, on laisse l'erreur remonter au PresetForm
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

    let coverUrl: string | null = null;

    if (data.coverFile) {
      // La cover est déjà compressée + modérée par PresetForm à la sélection
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

    const { error: insertError } = await supabase
      .from("presets")
      .insert({
        author_id: user.id,
        name: data.name,
        description: data.description || null,
        game_type: gameType,
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

  const PresetForm = getPresetFormComponent(gameType);
  const currentGame = GAMES_REGISTRY.find((g) => g.id === gameType) ?? GAMES_REGISTRY[0];

  return (
    <div>
      <Header title={t("title_new")} backHref="/presets" />
      <div className="px-4 py-4 space-y-4">

        {/* ── Sélecteur de jeu ── */}
        <div className="rounded-2xl border border-surface-700/40 bg-surface-900/50 p-1.5">
          <div className="flex gap-1">
            {GAMES_REGISTRY.map((game) => {
              const isActive = game.id === gameType;
              return (
                <button
                  key={game.id}
                  type="button"
                  onClick={() => { setGameType(game.id); setError(null); }}
                  className={`relative flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-semibold transition-all ${
                    isActive
                      ? "text-white"
                      : "text-surface-500 hover:text-surface-300"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="game-tab-bg"
                      className="absolute inset-0 rounded-xl bg-surface-700/80 border border-surface-600/50"
                      transition={{ type: "spring", stiffness: 400, damping: 35 }}
                    />
                  )}
                  <span className="relative z-10">{game.icon}</span>
                  <span className="relative z-10">{game.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Sous-titre du jeu sélectionné ── */}
        <AnimatePresence mode="wait">
          <motion.p
            key={gameType}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="text-surface-500 text-xs px-1"
          >
            {currentGame?.description}
          </motion.p>
        </AnimatePresence>

        {error && (
          <div className="p-4 rounded-xl bg-red-950/40 border border-red-700/50 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* ── Formulaire du jeu sélectionné ── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={gameType}
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
