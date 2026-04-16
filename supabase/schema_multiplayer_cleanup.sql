-- =============================================================
-- CORRECTIF 2 : Politiques DELETE + Nettoyage automatique
-- À exécuter dans Supabase SQL Editor
-- =============================================================

-- ── 1. Politiques DELETE manquantes ──────────────────────────

-- game_rooms : le host peut supprimer son salon
DROP POLICY IF EXISTS "rooms_delete" ON game_rooms;
CREATE POLICY "rooms_delete" ON game_rooms FOR DELETE USING (
  host_id = auth.uid()
);

-- room_players : chaque joueur peut quitter (supprimer sa propre entrée)
DROP POLICY IF EXISTS "players_delete_self" ON room_players;
CREATE POLICY "players_delete_self" ON room_players FOR DELETE USING (
  user_id = auth.uid()
);

-- ── 2. Sliding expiry : prolonger expires_at à chaque action clé ─

-- Fonction helper pour refresher l'expiry
CREATE OR REPLACE FUNCTION refresh_room_expiry(p_room_id TEXT, p_hours INT DEFAULT 2)
RETURNS VOID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE game_rooms
  SET expires_at = now() + (p_hours || ' hours')::INTERVAL
  WHERE id = p_room_id;
$$;

-- Trigger : prolonger de 2h à chaque nouveau message ou vote
CREATE OR REPLACE FUNCTION trg_refresh_expiry_on_activity()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM refresh_room_expiry(NEW.room_id, 2);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS refresh_on_message ON room_messages;
CREATE TRIGGER refresh_on_message
  AFTER INSERT ON room_messages
  FOR EACH ROW EXECUTE FUNCTION trg_refresh_expiry_on_activity();

DROP TRIGGER IF EXISTS refresh_on_vote ON room_votes;
CREATE TRIGGER refresh_on_vote
  AFTER INSERT ON room_votes
  FOR EACH ROW EXECUTE FUNCTION trg_refresh_expiry_on_activity();

DROP TRIGGER IF EXISTS refresh_on_join ON room_players;
CREATE TRIGGER refresh_on_join
  AFTER INSERT ON room_players
  FOR EACH ROW EXECUTE FUNCTION trg_refresh_expiry_on_activity();

-- ── 3. Nettoyage automatique via pg_cron ──────────────────────
-- Prérequis : activer l'extension pg_cron dans
-- Supabase Dashboard → Database → Extensions → pg_cron

-- Supprimer les rooms expirées toutes les 30 minutes
-- (très léger : une seule requête DELETE avec index sur expires_at)
SELECT cron.schedule(
  'cleanup-expired-rooms',          -- nom du job (unique)
  '*/30 * * * *',                   -- toutes les 30 minutes
  $$DELETE FROM public.game_rooms WHERE expires_at < now()$$
);

-- Pour vérifier que le job est bien enregistré :
-- SELECT * FROM cron.job;

-- Pour supprimer le job si besoin :
-- SELECT cron.unschedule('cleanup-expired-rooms');
