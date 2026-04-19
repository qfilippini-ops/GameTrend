-- ========================================================================
-- HOTFIX : ajoute les colonnes manquantes de schema_stability.sql
-- ========================================================================
-- À exécuter dans le SQL Editor Supabase si tu obtiens l'erreur :
--   "column game_rooms.tie_count does not exist"
--
-- Safe à ré-exécuter (IF NOT EXISTS).
-- ========================================================================

ALTER TABLE public.game_rooms
  ADD COLUMN IF NOT EXISTS tie_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.room_players
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT now();

-- Vérification
SELECT
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'game_rooms' AND column_name = 'tie_count')
    OR (table_name = 'room_players' AND column_name = 'last_seen_at'));
