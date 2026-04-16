-- =================================================================
-- PATCH social : policy DELETE sur notifications
-- À exécuter dans Supabase SQL Editor
-- =================================================================

-- Permet aux utilisateurs de supprimer leurs propres notifications
DROP POLICY IF EXISTS "Utilisateur supprime ses notifications" ON public.notifications;
CREATE POLICY "Utilisateur supprime ses notifications" ON public.notifications
  FOR DELETE USING (auth.uid() = user_id);
