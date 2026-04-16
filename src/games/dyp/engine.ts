import type { DYPCard, DYPConfig, DYPGameState, DYPMatch, DYPEliminatedCard } from "@/types/games";

// ── Config par défaut ─────────────────────────────────────────
export const DEFAULT_CONFIG: DYPConfig = {
  cards: [
    { id: "d1", name: "Pizza" },
    { id: "d2", name: "Sushi" },
    { id: "d3", name: "Burger" },
    { id: "d4", name: "Tacos" },
    { id: "d5", name: "Ramen" },
    { id: "d6", name: "Pâtes" },
    { id: "d7", name: "Curry" },
    { id: "d8", name: "Steak" },
  ],
};

// ── Utilitaires ───────────────────────────────────────────────

export function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Tailles de bracket valides (puissances de 2) que le preset peut supporter */
export function getValidBracketSizes(cardCount: number): number[] {
  return [2, 4, 8, 16, 32, 64, 128].filter((s) => s <= cardCount);
}

function createMatches(cards: DYPCard[]): DYPMatch[] {
  const shuffled = shuffleArray(cards);
  const matches: DYPMatch[] = [];
  for (let i = 0; i < shuffled.length; i += 2) {
    matches.push({ card1: shuffled[i], card2: shuffled[i + 1] });
  }
  return matches;
}

/**
 * Position finale des perdants d'un round donné.
 * Formule : bracketSize / 2^round + 1
 * Ex : bracket 8, round 1 → position 5 (perdants partagent 5ème place)
 *      bracket 8, round 2 → position 3
 *      bracket 8, round 3 → position 2 (finaliste)
 */
function loserPosition(bracketSize: number, round: number): number {
  return Math.floor(bracketSize / Math.pow(2, round)) + 1;
}

// ── API publique ──────────────────────────────────────────────

export function createGame(
  config: DYPConfig,
  bracketSize: number,
  presetId?: string
): DYPGameState {
  const selected = shuffleArray(config.cards).slice(0, bracketSize);
  const matches = createMatches(selected);

  return {
    phase: "duel",
    presetId,
    bracketSize,
    totalRounds: Math.log2(bracketSize),
    currentRound: 1,
    matches,
    currentMatchIndex: 0,
    roundWinners: [],
    eliminated: [],
    champion: null,
  };
}

export function castVote(state: DYPGameState, winnerId: string): DYPGameState {
  const match = state.matches[state.currentMatchIndex];
  const winner = match.card1.id === winnerId ? match.card1 : match.card2;
  const loser = match.card1.id === winnerId ? match.card2 : match.card1;

  const newEliminated: DYPEliminatedCard[] = [
    ...state.eliminated,
    {
      card: loser,
      round: state.currentRound,
      position: loserPosition(state.bracketSize, state.currentRound),
    },
  ];
  const newRoundWinners = [...state.roundWinners, winner];
  const isLastMatchInRound = state.currentMatchIndex === state.matches.length - 1;

  if (isLastMatchInRound) {
    if (newRoundWinners.length === 1) {
      // Champion trouvé
      return {
        ...state,
        phase: "result",
        eliminated: newEliminated,
        roundWinners: newRoundWinners,
        champion: newRoundWinners[0],
      };
    }
    // Préparer le round suivant (matches re-mélangés)
    return {
      ...state,
      phase: "round_transition",
      currentRound: state.currentRound + 1,
      matches: createMatches(newRoundWinners),
      currentMatchIndex: 0,
      roundWinners: [],
      eliminated: newEliminated,
      champion: null,
    };
  }

  return {
    ...state,
    currentMatchIndex: state.currentMatchIndex + 1,
    roundWinners: newRoundWinners,
    eliminated: newEliminated,
  };
}

/** Appelé depuis l'écran de transition entre rounds */
export function continueToNextRound(state: DYPGameState): DYPGameState {
  return { ...state, phase: "duel" };
}

/** Retourne le classement complet trié par position */
export function getFinalRankings(
  state: DYPGameState
): Array<{ card: DYPCard; position: number }> {
  const rankings = state.eliminated.map((e) => ({ card: e.card, position: e.position }));
  if (state.champion) rankings.push({ card: state.champion, position: 1 });
  return rankings.sort((a, b) => a.position - b.position);
}
