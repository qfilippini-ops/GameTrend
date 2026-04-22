/**
 * Constantes et types partagés pour le mode online de Blind Rank.
 *
 * Séparé des Server Actions (`src/app/actions/blindrank-rooms.ts`) car un
 * fichier `"use server"` ne peut exporter que des fonctions async.
 */

export const BLINDRANK_MIN_PLAYERS = 2;
export const BLINDRANK_MAX_PLAYERS = 16;
export const BLINDRANK_TOUR_MIN_SECONDS = 30;
export const BLINDRANK_TOUR_MAX_SECONDS = 300;
export const BLINDRANK_TOUR_DEFAULT_SECONDS = 60;
export const BLINDRANK_TIE_BREAKS = ["low", "high"] as const;
export type BlindRankTieBreak = (typeof BLINDRANK_TIE_BREAKS)[number];
