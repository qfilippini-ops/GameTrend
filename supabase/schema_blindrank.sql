-- ============================================================
-- Blind Rank — Schema patch
-- ============================================================
-- À appliquer sur Supabase (SQL Editor) avant de créer le premier
-- preset Blind Rank, sinon l'INSERT est rejeté par game_type_valid.
--
-- Ce patch est IDEMPOTENT : peut être rejoué sans danger.
--
-- Aucune table dédiée `blindrank_results` n'est créée :
--   - les résultats BR sont stockés dans la table générique `game_results`
--     (créée par schema_social_v2.sql), via game_type = 'blindrank'.
--   - le palmarès d'un preset BR n'est pas agrégé pour le moment ;
--     si on en a besoin un jour, on ajoutera une migration séparée.
-- ============================================================

-- 1. Étendre la contrainte game_type des presets pour inclure 'blindrank'
ALTER TABLE public.presets
  DROP CONSTRAINT IF EXISTS game_type_valid;
ALTER TABLE public.presets
  ADD CONSTRAINT game_type_valid
    CHECK (game_type IN ('ghostword', 'quiz', 'auction', 'dyp', 'blindrank'));

-- Note : pas de migration nécessaire pour
--   - public.game_results.game_type  (text sans CHECK)
--   - public.game_rooms.game_type    (text sans CHECK ; utile pour BR online)
