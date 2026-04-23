/**
 * Constantes et types partagés pour le mode online de DYP.
 *
 * Séparé des Server Actions (`src/app/actions/dyp-rooms.ts`) car un fichier
 * `"use server"` ne peut exporter que des fonctions async.
 */

export const DYP_MIN_PLAYERS = 2;
export const DYP_MAX_PLAYERS = 16;
export const DYP_TOUR_MIN_SECONDS = 30;
export const DYP_TOUR_MAX_SECONDS = 300;
export const DYP_TOUR_DEFAULT_SECONDS = 60;

/**
 * Stratégie de départage en cas d'égalité dans les votes :
 *   - "random" : choix aléatoire parmi les cartes à égalité
 *   - "first"  : on prend la carte qui a reçu le premier vote (par created_at)
 */
export const DYP_TIE_BREAKS = ["random", "first"] as const;
export type DypTieBreak = (typeof DYP_TIE_BREAKS)[number];

/** Durée de la pause automatique entre 2 rounds (en secondes). */
export const DYP_TRANSITION_SECONDS = 3;

/** Durée de la pause inter-duels pour montrer le vainqueur (en secondes). */
export const DYP_MATCH_TRANSITION_SECONDS = 1;

/** Tailles de bracket valides (puissances de 2). */
export const DYP_BRACKET_SIZES = [2, 4, 8, 16, 32, 64, 128] as const;
export type DypBracketSize = (typeof DYP_BRACKET_SIZES)[number];
