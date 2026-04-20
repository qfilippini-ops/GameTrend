"use server";

import { createClient } from "@/lib/supabase/server";

export interface SaveGameResultInput {
  gameType: string;
  presetId?: string | null;
  presetName?: string | null;
  resultData: Record<string, unknown>;
  isShared?: boolean;
}

/**
 * Sauvegarde MINIMALE d'une partie terminée. Insère uniquement les colonnes
 * nécessaires aux stats du profil (CreatorStats : "parties 7j" par preset).
 *
 * Ne stocke PAS le `result_data` (souvent volumineux) ni le `preset_name`.
 * Ces champs ne sont enrichis que si l'utilisateur clique sur "Partager"
 * (cf. `shareGameResult`), ce qui rend la ligne publique.
 *
 * Retourne null silencieusement si l'utilisateur n'est pas connecté ou
 * si aucun preset n'est associé (sans preset, la stat 7j n'a pas de sens).
 */
export async function trackGameResult(
  input: Pick<SaveGameResultInput, "gameType" | "presetId">
): Promise<{ id: string } | null> {
  try {
    if (!input.presetId) return null;

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.is_anonymous) return null;

    const { data, error } = await supabase
      .from("game_results")
      .insert({
        user_id: user.id,
        game_type: input.gameType,
        preset_id: input.presetId,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[trackGameResult]", error);
      return null;
    }
    return { id: data!.id as string };
  } catch (e) {
    console.error("[trackGameResult] exception:", e);
    return null;
  }
}

/**
 * Enrichit (ou crée) une ligne `game_results` complète au moment où
 * l'utilisateur partage : ajoute `result_data`, `preset_name` et passe
 * `is_shared = true` pour rendre la ligne publique (visible dans le feed).
 *
 * Si `existingId` est fourni, on UPDATE la ligne minimale créée par
 * `trackGameResult`. Sinon on INSERT une nouvelle ligne complète.
 */
export async function shareGameResult(
  input: SaveGameResultInput,
  existingId?: string | null
): Promise<{ id: string } | { error: string }> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.is_anonymous) {
      return { error: "Non connecté — résultat non partagé" };
    }

    if (existingId) {
      const { data, error } = await supabase
        .from("game_results")
        .update({
          preset_name: input.presetName ?? null,
          result_data: input.resultData,
          is_shared: true,
        })
        .eq("id", existingId)
        .eq("user_id", user.id)
        .select("id")
        .single();
      if (error) {
        console.error("[shareGameResult update]", error);
        return { error: error.message };
      }
      return { id: data!.id as string };
    }

    const { data, error } = await supabase
      .from("game_results")
      .insert({
        user_id: user.id,
        game_type: input.gameType,
        preset_id: input.presetId ?? null,
        preset_name: input.presetName ?? null,
        result_data: input.resultData,
        is_shared: true,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[shareGameResult insert]", error);
      return { error: error.message };
    }
    return { id: data!.id as string };
  } catch (e) {
    console.error("[shareGameResult] exception:", e);
    return { error: String(e) };
  }
}
