/**
 * Constantes et types partagés pour le mode online de Outbid.
 *
 * Séparé des Server Actions (`src/app/actions/outbid-rooms.ts`) car un fichier
 * `"use server"` ne peut exporter que des fonctions async.
 */

export const OUTBID_MIN_PLAYERS = 2;
export const OUTBID_MAX_PLAYERS = 2;

export const OUTBID_TOUR_MIN_SECONDS = 30;
export const OUTBID_TOUR_MAX_SECONDS = 300;
export const OUTBID_TOUR_DEFAULT_SECONDS = 60;

export const OUTBID_TEAM_MIN = 3;
export const OUTBID_TEAM_MAX = 11;
export const OUTBID_TEAM_DEFAULT = 8;

export const OUTBID_STARTING_POINTS = 100;
export const OUTBID_OPENING_BID = 10;

export const OUTBID_OPENING_BIDDERS = [
  "alternate",
  "loser",
  "winner",
  "random",
] as const;
export type OutbidOpeningBidder = (typeof OUTBID_OPENING_BIDDERS)[number];

export const OUTBID_QUICK_BIDS = [10, 50, 100] as const;
