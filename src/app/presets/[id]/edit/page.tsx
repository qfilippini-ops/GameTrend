"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Header from "@/components/layout/Header";
import { getPresetFormComponent } from "@/games/preset-forms";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/compressImage";
import { extractStoragePath } from "@/lib/storageUtils";

export default function EditPresetPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gameType, setGameType] = useState("ghostword");
  const [initialData, setInitialData] = useState<{
    name: string;
    description: string;
    isPublic: boolean;
    config: unknown;
    coverUrl?: string | null;
  } | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/auth/login");
        return;
      }

      const { data: preset } = await supabase
        .from("presets")
        .select("name, description, is_public, config, cover_url, game_type")
        .eq("id", params.id)
        .eq("author_id", user.id)
        .single();

      if (!preset) {
        // Pas le propriétaire ou introuvable
        router.push(`/presets/${params.id}`);
        return;
      }

      setGameType(preset.game_type ?? "ghostword");
      setInitialData({
        name: preset.name,
        description: preset.description ?? "",
        isPublic: preset.is_public,
        config: preset.config,
        coverUrl: preset.cover_url,
      });
      setLoading(false);
    }
    load();
  }, [params.id, router]);

  async function uploadWordImage(file: File): Promise<string> {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Non connecté");
    // La modération remonte au PresetForm qui affiche le popup NSFW
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
    setSaving(true);
    setError(null);
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    let coverUrl = initialData?.coverUrl ?? null;

    if (data.coverFile) {
      // Supprimer l'ancienne cover avant d'uploader la nouvelle
      if (initialData?.coverUrl) {
        const oldPath = extractStoragePath(initialData.coverUrl);
        if (oldPath) {
          await supabase.storage.from("covers").remove([oldPath]);
        }
      }

      // La cover est déjà compressée + modérée par PresetForm à la sélection
      const ext = data.coverFile.name.split(".").pop();
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("covers")
        .upload(path, data.coverFile);

      if (uploadError) {
        setError(`Erreur upload image : ${uploadError.message}`);
        setSaving(false);
        return;
      }
      const { data: urlData } = supabase.storage
        .from("covers")
        .getPublicUrl(path);
      coverUrl = urlData.publicUrl;
    }

    const { error: updateError } = await supabase
      .from("presets")
      .update({
        name: data.name,
        description: data.description || null,
        is_public: data.isPublic,
        config: data.config as unknown as Record<string, unknown>,
        cover_url: coverUrl,
      })
      .eq("id", params.id)
      .eq("author_id", user.id);

    setSaving(false);

    if (updateError) {
      setError("Erreur lors de la sauvegarde. Réessaie.");
      return;
    }

    router.push("/profile");
  }

  if (loading || !initialData) {
    return (
      <div>
        <Header title="Modifier le preset" backHref={`/presets/${params.id}`} />
        <div className="flex items-center justify-center pt-20">
          <div className="w-8 h-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Modifier le preset" backHref={`/presets/${params.id}`} />
      <div className="px-4 py-6">
        {error && (
          <div className="mb-4 p-4 rounded-xl bg-red-950/40 border border-red-700/50 text-red-300 text-sm">
            {error}
          </div>
        )}
        {(() => {
          const PresetForm = getPresetFormComponent(gameType);
          return (
            <PresetForm
              initialData={initialData}
              onSave={handleSave}
              uploadImage={uploadWordImage}
              loading={saving}
            />
          );
        })()}
      </div>
    </div>
  );
}
