/**
 * Registre central des jeux disponibles dans GameTrend.
 *
 * Pour ajouter un nouveau jeu :
 *   1. Créer src/games/monjeu/config.ts   → MONJEU_META: GameMeta
 *   2. Créer src/games/monjeu/adapter.ts  → MonjeuAdapter: GameAdapter
 *   3. Ajouter MONJEU_META à GAMES_REGISTRY ci-dessous
 *   4. Ajouter "monjeu": MonjeuAdapter à ADAPTERS ci-dessous
 *   5. Créer src/app/games/monjeu/...     → pages du jeu
 * Aucun autre fichier central n'a besoin d'être modifié.
 */

import { GHOSTWORD_META } from "@/games/ghostword/config";
import { GhostWordAdapter } from "@/games/ghostword/adapter";
import { DYP_META } from "@/games/dyp/config";
import { DYPAdapter } from "@/games/dyp/adapter";
import type { GameMeta } from "@/types/games";
import type { GameAdapter } from "@/types/adapters";

/** Liste des jeux jouables — utilisée pour la page d'accueil et les filtres */
export const GAMES_REGISTRY: GameMeta[] = [
  GHOSTWORD_META,
  DYP_META,
];

/** Map gameType → adapter */
const ADAPTERS: Record<string, GameAdapter> = {
  ghostword: GhostWordAdapter,
  dyp: DYPAdapter,
};

/**
 * Retourne l'adapter d'un jeu par son game_type.
 * Fallback sur GhostWord si le type est inconnu (ne devrait pas arriver en prod).
 */
export function getAdapter(gameType: string): GameAdapter {
  return ADAPTERS[gameType] ?? ADAPTERS["ghostword"];
}
