"use server";

import { createClient } from "@/lib/supabase/server";

export interface SaveGameResultInput {
  gameType: string;
  presetId?: string | null;
  presetName?: string | null;
  resultData: Record<string, unknown>;
  isShared?: boolean;
}

export async function saveGameResult(
  input: SaveGameResultInput
): Promise<{ id: string } | { error: string }> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.is_anonymous) {
      return { error: "Non connecté — résultat non sauvegardé" };
    }

    const { data, error } = await supabase
      .from("game_results")
      .insert({
        user_id: user.id,
        game_type: input.gameType,
        preset_id: input.presetId ?? null,
        preset_name: input.presetName ?? null,
        result_data: input.resultData,
        is_shared: input.isShared ?? false,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[saveGameResult]", error);
      return { error: error.message };
    }

    return { id: data!.id as string };
  } catch (e) {
    console.error("[saveGameResult] exception:", e);
    return { error: String(e) };
  }
}

export async function markResultShared(resultId: string): Promise<void> {
  try {
    const supabase = createClient();
    await supabase.from("game_results").update({ is_shared: true }).eq("id", resultId);
  } catch (e) {
    console.error("[markResultShared]", e);
  }
}
