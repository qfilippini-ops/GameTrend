import { DEFAULT_CONFIG, createGame } from "@/games/ghostword/engine";
import { GHOSTWORD_META } from "@/games/ghostword/config";
import type { GhostWordConfig, WordFamily } from "@/types/games";
import type { GameAdapter, PlayerAssignment, EliminationResult } from "@/types/adapters";

export const GhostWordAdapter: GameAdapter = {
  meta: GHOSTWORD_META,

  assignPlayers({ playerNames, presetConfig, options }): PlayerAssignment[] {
    const config: GhostWordConfig =
      presetConfig && typeof presetConfig === "object" && "families" in (presetConfig as object)
        ? (presetConfig as GhostWordConfig)
        : { ...DEFAULT_CONFIG };

    const ombrePercent =
      typeof options.ombrePercent === "number" ? options.ombrePercent : 90;

    const gameState = createGame({ playerNames, config, ombrePercent });

    return gameState.players.map((p) => ({
      display_name: p.name,
      role: p.role,
      word: p.word ?? null,
      word_image_url: p.wordImageUrl ?? null,
    }));
  },

  resolveElimination({ remainingPlayers }): EliminationResult {
    // La partie se termine quand il reste 2 joueurs ou moins
    if (remainingPlayers.length <= 2) {
      const hasOmbre = remainingPlayers.some((p) => p.role === "ombre");
      const hasVide = remainingPlayers.some((p) => p.role === "vide");
      return {
        gameOver: true,
        winner: hasOmbre ? "ombre" : hasVide ? "vide" : "initie",
      };
    }
    return { gameOver: false, winner: null };
  },

  getSearchableStrings(config: unknown): string[] {
    const strings: string[] = [];
    try {
      const c = config as GhostWordConfig;
      for (const family of c?.families ?? []) {
        if (family.name) strings.push(family.name);
        for (const word of (family as WordFamily).words ?? []) {
          if (word.name) strings.push(word.name);
        }
      }
    } catch {
      // config invalide — on ignore
    }
    return strings;
  },

  onlineConfig: {
    supportsOnline: true,
    minPlayers: 3,
    maxPlayers: 12,
    chatMode: "turn-based",
  },
};
