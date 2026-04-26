// Limites partagées client/server pour les tickets support, synchronisées
// avec les CHECK constraints SQL de support_tickets.

export const TICKET_TITLE_MIN = 3;
export const TICKET_TITLE_MAX = 120;
export const TICKET_BODY_MIN = 10;
export const TICKET_BODY_MAX = 2000;
