/**
 * Sets de colonnes réutilisables pour les requêtes Supabase.
 * Centralise la définition des colonnes "list" vs "full" pour limiter
 * l'egress et garantir la cohérence entre vues.
 *
 * Règle :
 *  - LIST  : tout sauf le `config` (gros JSON), pour les listes/cards
 *  - FULL  : toutes colonnes, pour edit/play (besoin du config)
 */

/** Colonnes preset pour listes/cards (sans `config`) */
export const PRESET_LIST_COLS =
  "id, name, description, game_type, cover_url, play_count, like_count, author_id, created_at, is_public";

/** Colonnes preset pour listes avec recherche full-text dans `config` */
export const PRESET_LIST_SEARCH_COLS = `${PRESET_LIST_COLS}, config`;

/** Colonnes preset complètes (edit, play) */
export const PRESET_FULL_COLS = `${PRESET_LIST_COLS}, config, updated_at`;

/** Colonnes profile pour affichage minimal (cards, listes) */
export const PROFILE_MINI_COLS = "id, username, avatar_url";

/** Colonnes profile pour affichage public (page profil) */
export const PROFILE_PUBLIC_COLS =
  "id, username, avatar_url, bio, stats, followers_count, following_count, last_seen_at, created_at";

/** Colonnes profile pour le user connecté (incluant CGU) */
export const PROFILE_SELF_COLS = `${PROFILE_PUBLIC_COLS}, cgu_accepted_at, cgu_version`;
