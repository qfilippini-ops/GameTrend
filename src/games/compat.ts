/**
 * Helpers de compatibilité multi-jeux pour les presets.
 *
 * Concept : un preset est tagué avec un seul `game_type` en base, mais
 * plusieurs jeux peuvent l'accepter si leur format de config est compatible.
 * Chaque adapter déclare via `acceptedPresetTypes()` la liste des types
 * qu'il sait jouer.
 *
 * Exemple :
 *   - Blind Rank et DYP utilisent tous les deux `{ cards: [...] }`.
 *   - DYPAdapter.acceptedPresetTypes()       → ["dyp", "blindrank"]
 *   - BlindRankAdapter.acceptedPresetTypes() → ["blindrank", "dyp"]
 *
 * Côté UI :
 *   - Un lobby de jeu utilise `getAcceptedPresetTypes(gameId)` pour filtrer
 *     les presets qui apparaissent dans le picker.
 *   - Une PresetCard utilise `getCompatibleGames(presetType)` pour afficher
 *     les icônes des jeux qui peuvent jouer ce preset.
 */

import { GAMES_REGISTRY, getAdapter } from "@/games/registry";
import type { GameMeta } from "@/types/games";

/**
 * Retourne les `game_type` qu'un jeu sait jouer (lui-même + extensions).
 * Garantit que le type natif est toujours en première position.
 */
export function getAcceptedPresetTypes(gameId: string): string[] {
  const adapter = getAdapter(gameId);
  if (adapter.acceptedPresetTypes) {
    const types = adapter.acceptedPresetTypes();
    // Sécurité : on s'assure que le type natif est présent et en tête.
    return types.includes(gameId)
      ? [gameId, ...types.filter((t) => t !== gameId)]
      : [gameId, ...types];
  }
  return [gameId];
}

/**
 * Retourne les jeux qui peuvent jouer un preset d'un certain `game_type`.
 * Ordonnés : le jeu natif du preset en premier, puis les autres compatibles.
 */
export function getCompatibleGames(presetGameType: string): GameMeta[] {
  const compatible: GameMeta[] = [];
  let native: GameMeta | null = null;

  for (const game of GAMES_REGISTRY) {
    const accepted = getAcceptedPresetTypes(game.id);
    if (accepted.includes(presetGameType)) {
      if (game.id === presetGameType) native = game;
      else compatible.push(game);
    }
  }

  return native ? [native, ...compatible] : compatible;
}
