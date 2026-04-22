import { BLINDRANK_META } from "@/games/blindrank/config";
import type { BlindRankConfig } from "@/types/games";
import type {
  GameAdapter,
  PlayerAssignment,
  EliminationResult,
} from "@/types/adapters";

/**
 * Adapter Blind Rank — jeu solo uniquement en v1.
 *
 * Compatibilité presets : Blind Rank et DYP partagent la même structure
 * `{ cards: [...] }`, donc les presets sont interchangeables entre les
 * deux jeux. Voir `src/games/compat.ts`.
 */
export const BlindRankAdapter: GameAdapter = {
  meta: BLINDRANK_META,

  assignPlayers(): PlayerAssignment[] {
    return [];
  },

  resolveElimination(): EliminationResult {
    return { gameOver: false, winner: null };
  },

  getSearchableStrings(config: unknown): string[] {
    const strings: string[] = [];
    try {
      const c = config as BlindRankConfig;
      for (const card of c?.cards ?? []) {
        if (card.name) strings.push(card.name);
      }
    } catch {
      // config invalide
    }
    return strings;
  },

  acceptedPresetTypes: () => ["blindrank", "dyp"],
};
