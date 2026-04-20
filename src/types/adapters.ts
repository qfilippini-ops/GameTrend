import type { GameMeta } from "@/types/games";

/** Assignation rôle/mot pour un joueur lors du démarrage d'une partie en ligne */
export interface PlayerAssignment {
  display_name: string;
  role: string;
  word: string | null;
  word_image_url: string | null;
}

/** Résultat de l'évaluation après un vote d'élimination */
export interface EliminationResult {
  /** null = la partie continue */
  winner: string | null;
  gameOver: boolean;
}

/** Données communes soumises par n'importe quel formulaire de création de preset */
export interface PresetSaveData {
  name: string;
  description: string;
  isPublic: boolean;
  /** Config spécifique au jeu — typée par le formulaire mais traitée comme unknown côté central */
  config: unknown;
  coverFile?: File;
}

/** Props standard que tout composant de formulaire de preset doit accepter */
export interface PresetFormProps {
  initialData?: {
    name: string;
    description: string;
    isPublic: boolean;
    config: unknown;
    coverUrl?: string | null;
  };
  onSave: (data: PresetSaveData) => Promise<void>;
  uploadImage: (file: File) => Promise<string>;
  loading?: boolean;
}

/**
 * Interface que chaque jeu doit implémenter pour s'intégrer dans GameTrend.
 * Le code central (rooms.ts, presets, accueil) utilise uniquement cette interface.
 */
export interface GameAdapter {
  meta: GameMeta;

  /**
   * Calcule les assignations rôle/mot pour chaque joueur au démarrage.
   * Appelé par startOnlineGame côté serveur.
   */
  assignPlayers(params: {
    playerNames: string[];
    presetConfig: unknown;
    options: Record<string, unknown>;
  }): PlayerAssignment[];

  /**
   * Détermine si la partie est terminée après l'élimination d'un joueur.
   * Note : pour le mode online, la logique d'élimination est gérée
   * atomiquement par le trigger PG `process_vote_fn`. Cette méthode est
   * conservée pour le mode solo et pour les futurs jeux.
   */
  resolveElimination(params: {
    eliminatedRole: string;
    remainingPlayers: { role: string }[];
  }): EliminationResult;

  /**
   * Retourne toutes les chaînes indexables d'une config de preset.
   * Utilisé pour la recherche full-text côté client (PresetList, PresetPicker).
   */
  getSearchableStrings(config: unknown): string[];
}
