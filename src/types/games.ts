// Types communs à tous les jeux
export interface GameMeta {
  id: string;
  name: string;
  description: string;
  icon: string;
  minPlayers: number;
  maxPlayers: number;
  estimatedDuration: string;
  tags: string[];
}

// ============ GHOSTWORD ============
export type GhostWordRole = "initie" | "ombre" | "vide";

// Un mot au sein d'une famille
export interface WordItem {
  id: string;
  name: string;
  imageUrl?: string;
}

// Une famille regroupe des mots d'un même thème
// Ex: "Animaux" → ["Lion", "Tigre", "Panthère"]
export interface WordFamily {
  id: string;
  name: string;
  words: WordItem[];
}

// Nom personnalisé d'un rôle (sans description — les règles sont dans le jeu)
export interface GhostWordRoleConfig {
  name: string;
  imageUrl?: string;
}

export interface GhostWordConfig {
  families: WordFamily[];
  roles: {
    initie: GhostWordRoleConfig;
    ombre: GhostWordRoleConfig;
    vide: GhostWordRoleConfig;
  };
}

export interface GhostWordPlayer {
  id: string;
  name: string;
  role: GhostWordRole;
  word: string | null;
  /** Image associée au mot attribué (peut être undefined si pas d'image) */
  wordImageUrl?: string;
  isEliminated: boolean;
  hasRevealed: boolean;
}

export type GhostWordPhase =
  | "veil"       // écran "passe le téléphone à X" — inclut aussi la révélation (showingReveal local)
  | "discussion" // les joueurs parlent à voix haute
  | "vote"       // vote d'élimination (tous les 2 tours)
  | "result";    // fin de partie

export interface GhostWordGameState {
  phase: GhostWordPhase;
  players: GhostWordPlayer[];
  currentPlayerIndex: number;
  voteRound: number;
  /** Tour courant dans le cycle de discussion (1…discussionTurnsPerRound) */
  discussionTurn: number;
  /** Nombre de tours de discussion avant chaque vote (paramètre de la partie) */
  discussionTurnsPerRound: number;
  initialRevealDone: boolean;
  eliminatedThisRound: string[];
  winner: GhostWordRole | null;
  presetId?: string;
}

export interface GhostWordVoteState {
  votes: Record<string, string>; // voterId -> targetId
  currentVoterIndex: number;
}

// Preset GhostWord stocké en JSONB dans Supabase
export type GhostWordPresetConfig = GhostWordConfig;

// ============ DYP (Do You Prefer) ============

export interface DYPCard {
  id: string;
  name: string;
  imageUrl?: string;
}

export interface DYPConfig {
  cards: DYPCard[];
}

export interface DYPMatch {
  card1: DYPCard;
  card2: DYPCard;
}

export interface DYPEliminatedCard {
  card: DYPCard;
  round: number;
  /** Position finale (1 = champion, 2 = finaliste, etc.) */
  position: number;
}

export type DYPPhase = "duel" | "round_transition" | "result";

export interface DYPGameState {
  phase: DYPPhase;
  presetId?: string;
  bracketSize: number;
  totalRounds: number;
  currentRound: number;
  /** Matchups du round en cours (re-mélangés à chaque round) */
  matches: DYPMatch[];
  currentMatchIndex: number;
  /** Gagnants accumulés dans le round en cours */
  roundWinners: DYPCard[];
  eliminated: DYPEliminatedCard[];
  champion: DYPCard | null;
}
