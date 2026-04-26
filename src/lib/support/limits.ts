// Limites partagées client/server pour les tickets support, synchronisées
// avec les CHECK constraints SQL de support_tickets.

export const TICKET_TITLE_MIN = 3;
export const TICKET_TITLE_MAX = 120;
export const TICKET_BODY_MIN = 10;
export const TICKET_BODY_MAX = 2000;
export const TICKET_MAX_ATTACHMENTS = 5;
// Formats d'images acceptés pour les pièces jointes de tickets.
// On reste sur les classiques + WebP (output de la compression).
export const TICKET_ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
