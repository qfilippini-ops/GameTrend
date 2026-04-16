-- Fonction SECURITY DEFINER pour incrémenter play_count d'un preset
-- Contourne le RLS (l'auteur seul peut mettre à jour son preset en temps normal)
-- Appel depuis le client anonyme lors de la fin d'une partie DYP.

CREATE OR REPLACE FUNCTION increment_preset_play_count(p_preset_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.presets
  SET play_count = play_count + 1
  WHERE id = p_preset_id;
END;
$$;
