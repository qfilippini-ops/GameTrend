import type {
  BlindRankCard,
  BlindRankConfig,
  BlindRankGameState,
} from "@/types/games";

// ── Config par défaut (utilisée si aucun preset sélectionné) ─────
export const DEFAULT_CONFIG: BlindRankConfig = {
  cards: [
    { id: "br1", name: "Pizza" },
    { id: "br2", name: "Sushi" },
    { id: "br3", name: "Burger" },
    { id: "br4", name: "Tacos" },
    { id: "br5", name: "Ramen" },
    { id: "br6", name: "Pâtes" },
    { id: "br7", name: "Curry" },
    { id: "br8", name: "Steak" },
  ],
};

// ── Bornes du paramètre rackSize ──
export const MIN_RACK_SIZE = 2;
export const MAX_RACK_SIZE = 128;

/** Tailles "rapides" proposées dans l'UI (filtrées selon `cardCount`) */
export const QUICK_RACK_SIZES = [3, 5, 8, 10, 15, 20, 30, 50, 75, 100, 128];

// ── Utilitaires ───────────────────────────────────────────────

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Borne `rackSize` à la plage valide pour un preset donné.
 * Garantit `MIN_RACK_SIZE ≤ result ≤ min(MAX_RACK_SIZE, cardCount)`.
 */
export function clampRackSize(rackSize: number, cardCount: number): number {
  const upper = Math.min(MAX_RACK_SIZE, cardCount);
  if (upper < MIN_RACK_SIZE) return MIN_RACK_SIZE;
  return Math.max(MIN_RACK_SIZE, Math.min(rackSize, upper));
}

// ── API publique ──────────────────────────────────────────────

export function createGame(
  config: BlindRankConfig,
  rackSize: number,
  presetId?: string
): BlindRankGameState {
  const safeSize = clampRackSize(rackSize, config.cards.length);
  const drawn = shuffleArray(config.cards).slice(0, safeSize);
  const [first, ...rest] = drawn;

  return {
    phase: "place",
    presetId,
    rackSize: safeSize,
    slots: Array.from({ length: safeSize }, () => null),
    remainingCards: rest,
    currentCard: first ?? null,
    cardsPlaced: 0,
  };
}

/**
 * Place la carte courante dans le slot `slotIndex`.
 * Pioche la prochaine carte (ou termine la partie si la pioche est vide).
 *
 * Retourne le state inchangé si :
 *   - le slot est déjà occupé
 *   - il n'y a pas de carte courante
 *   - la phase n'est pas "place"
 */
export function placeCard(
  state: BlindRankGameState,
  slotIndex: number
): BlindRankGameState {
  if (state.phase !== "place" || !state.currentCard) return state;
  if (slotIndex < 0 || slotIndex >= state.slots.length) return state;
  if (state.slots[slotIndex] !== null) return state;

  const newSlots = [...state.slots];
  newSlots[slotIndex] = state.currentCard;

  const [next, ...rest] = state.remainingCards;
  const cardsPlaced = state.cardsPlaced + 1;

  if (!next) {
    // Plus de carte à piocher : la partie est terminée.
    return {
      ...state,
      phase: "result",
      slots: newSlots,
      remainingCards: [],
      currentCard: null,
      cardsPlaced,
    };
  }

  return {
    ...state,
    slots: newSlots,
    remainingCards: rest,
    currentCard: next,
    cardsPlaced,
  };
}

/**
 * Retourne le classement final (slot 0 = #1, slot N-1 = #N).
 * Utile pour l'écran résultat et le partage.
 */
export function getFinalRanking(
  state: BlindRankGameState
): Array<{ card: BlindRankCard; position: number }> {
  return state.slots
    .map((card, idx) => (card ? { card, position: idx + 1 } : null))
    .filter((x): x is { card: BlindRankCard; position: number } => x !== null);
}
