-- =================================================================
-- DYP (Do You Prefer) — Schema
-- À exécuter dans Supabase SQL Editor
-- =================================================================

-- 1. Ajouter "dyp" à la contrainte game_type de la table presets
ALTER TABLE public.presets
  DROP CONSTRAINT IF EXISTS game_type_valid;
ALTER TABLE public.presets
  ADD CONSTRAINT game_type_valid
    CHECK (game_type IN ('ghostword', 'quiz', 'auction', 'dyp'));

-- 2. Table des résultats DYP
CREATE TABLE IF NOT EXISTS public.dyp_results (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  preset_id   UUID NOT NULL REFERENCES public.presets(id) ON DELETE CASCADE,
  bracket_size INTEGER NOT NULL,
  -- Array de { card_id, card_name, image_url, position }
  -- position 1 = champion, 2 = finaliste, etc.
  rankings    JSONB NOT NULL,
  player_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dyp_results_preset_id_idx ON public.dyp_results(preset_id);
CREATE INDEX IF NOT EXISTS dyp_results_created_at_idx ON public.dyp_results(created_at);

-- 3. RLS
ALTER TABLE public.dyp_results ENABLE ROW LEVEL SECURITY;

-- Tout le monde peut insérer (anonyme compris — pas d'auth requise pour jouer)
DROP POLICY IF EXISTS "dyp_results_insert" ON public.dyp_results;
CREATE POLICY "dyp_results_insert" ON public.dyp_results
  FOR INSERT WITH CHECK (true);

-- Tout le monde peut lire (pour les stats sur la page preset)
DROP POLICY IF EXISTS "dyp_results_select" ON public.dyp_results;
CREATE POLICY "dyp_results_select" ON public.dyp_results
  FOR SELECT USING (true);
