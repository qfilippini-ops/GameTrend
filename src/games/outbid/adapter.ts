import { OUTBID_META } from "@/games/outbid/config";
import type { DYPConfig } from "@/types/games";
import type {
  GameAdapter,
  PlayerAssignment,
  EliminationResult,
} from "@/types/adapters";

/**
 * Adapter Outbid — jeu online uniquement, 1v1 strict.
 *
 * Compatibilité presets : Outbid partage le format `{ cards: [...] }` avec
 * DYP et Blind Rank. Les presets sont interchangeables entre les trois.
 */
export const OutbidAdapter: GameAdapter = {
  meta: OUTBID_META,

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
    maxPlayers: 2,
    chatMode: "realtime",
  },
};
