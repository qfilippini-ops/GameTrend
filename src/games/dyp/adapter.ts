import { DYP_META } from "@/games/dyp/config";
import type { DYPConfig } from "@/types/games";
import type { GameAdapter, PlayerAssignment, EliminationResult } from "@/types/adapters";

/**
 * Adapter DYP — solo + online (depuis v2).
 *
 * Compatibilité presets : DYP et Blind Rank partagent la même structure
 * `{ cards: [...] }`, donc les presets sont interchangeables entre les
 * deux jeux.
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

  acceptedPresetTypes: () => ["dyp", "blindrank", "outbid"],

  onlineConfig: {
    supportsOnline: true,
    minPlayers: 2,
    maxPlayers: 16,
    chatMode: "realtime",
  },
};
