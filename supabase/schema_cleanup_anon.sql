-- ========================================================================
-- Cleanup des comptes auth anonymes
-- ========================================================================
-- Stratégie :
--   1. Cleanup ponctuel des anon existants non liés à un lobby actif
--   2. Activation de pg_cron pour suppression auto quotidienne (>24h inactif)
--   3. Trigger "fast cleanup" : à chaque insertion d'un nouvel anon, on supprime
--      les autres anon inactifs depuis >24h (zéro coût supplémentaire).
--
-- À exécuter dans le SQL Editor de Supabase.
-- ========================================================================

-- ─── 1. Cleanup ponctuel ────────────────────────────────────────────────
-- Supprime les anon qui ne sont dans aucun lobby actif (game_rooms.phase != 'finished')
-- Les FK CASCADE sur room_players, follows, etc. nettoient les enregistrements liés.
DELETE FROM auth.users
 WHERE is_anonymous = true
   AND id NOT IN (
     SELECT rp.user_id
       FROM public.room_players rp
       JOIN public.game_rooms   gr ON gr.id = rp.room_id
      WHERE gr.phase != 'finished'
   );

-- ─── 2. Cron quotidien (pg_cron) ────────────────────────────────────────
-- Supprime les anon inactifs depuis plus de 24h, hors lobbies actifs.
-- pg_cron est disponible sur tous les plans Supabase (incluant Free).

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Fonction de nettoyage encapsulée (sécurisée pour pg_cron)
CREATE OR REPLACE FUNCTION public.cleanup_anonymous_users()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM auth.users u
   WHERE u.is_anonymous = true
     AND u.last_sign_in_at < (now() - interval '24 hours')
     AND u.id NOT IN (
       SELECT rp.user_id
         FROM public.room_players rp
         JOIN public.game_rooms   gr ON gr.id = rp.room_id
        WHERE gr.phase != 'finished'
     );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- Annule un éventuel job existant pour permettre le re-run du script
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-anonymous-users');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Planifie tous les jours à 03h00 UTC
SELECT cron.schedule(
  'cleanup-anonymous-users',
  '0 3 * * *',
  $$SELECT public.cleanup_anonymous_users();$$
);

-- ─── 3. Trigger "fast cleanup" optionnel ────────────────────────────────
-- À chaque insertion d'un nouvel anon, déclenche le cleanup async.
-- Ainsi, même sans pg_cron actif, la BDD reste propre dès qu'il y a du trafic.
-- Limite : on ne nettoie que 50 anon max par insert pour éviter de bloquer.

CREATE OR REPLACE FUNCTION public.trigger_cleanup_old_anon()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  -- Ne se déclenche que pour les anon
  IF NEW.is_anonymous = true THEN
    DELETE FROM auth.users u
     WHERE u.id IN (
       SELECT u2.id
         FROM auth.users u2
        WHERE u2.is_anonymous = true
          AND u2.id != NEW.id
          AND u2.last_sign_in_at < (now() - interval '24 hours')
          AND u2.id NOT IN (
            SELECT rp.user_id
              FROM public.room_players rp
              JOIN public.game_rooms   gr ON gr.id = rp.room_id
             WHERE gr.phase != 'finished'
          )
        LIMIT 50
     );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cleanup_anon_on_signup ON auth.users;
CREATE TRIGGER cleanup_anon_on_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_cleanup_old_anon();

-- ─── Vérifications ──────────────────────────────────────────────────────
-- Pour vérifier l'état après exécution :
--   SELECT count(*) FROM auth.users WHERE is_anonymous = true;
--   SELECT * FROM cron.job WHERE jobname = 'cleanup-anonymous-users';
--   SELECT public.cleanup_anonymous_users();  -- exécution manuelle
