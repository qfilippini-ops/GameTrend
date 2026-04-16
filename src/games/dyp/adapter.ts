import { DYP_META } from "@/games/dyp/config";
import type { DYPConfig } from "@/types/games";
import type { GameAdapter, PlayerAssignment, EliminationResult } from "@/types/adapters";

/**
 * Adapter DYP — jeu solo uniquement en v1.
 * Les méthodes assignPlayers et resolveElimination ne sont pas utilisées
 * (pas de partie en ligne), mais sont implémentées pour respecter l'interface.
 */
export const DYPAdapter: GameAdapter = {
  meta: DYP_META,

  assignPlayers(): PlayerAssignment[] {
    return [];
  },

  resolveElimination(): EliminationResult {
    return { gameOver: false, winner: null };
  },

  getSearchableStrings(config: unknown): string[] {
    const strings: string[] = [];
    try {
      const c = config as DYPConfig;
      for (const card of c?.cards ?? []) {
        if (card.name) strings.push(card.name);
      }
    } catch {
      // config invalide
    }
    return strings;
  },
};
