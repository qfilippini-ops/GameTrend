// Limites partagées client/server pour les interactions sociales.
// Synchronisées avec les CHECK SQL des tables correspondantes.

// post_comments.body : CHECK char_length BETWEEN 1 AND 500
export const COMMENT_MAX_LEN = 500;
