-- =============================================================
-- FIN DE PARTIE AUTOMATIQUE si joueurs insuffisants
-- À exécuter dans Supabase SQL Editor
-- =============================================================

-- ── Fonction appelée explicitement depuis leaveRoom (Server Action)
-- ET via trigger AFTER DELETE sur room_players (double sécurité)
-- SECURITY DEFINER : contourne RLS pour pouvoir UPDATE game_rooms
-- même si l'appelant n'est pas l'hôte.
CREATE OR REPLACE FUNCTION check_end_game_on_leave(p_room_id TEXT)
RETURNS VOID LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_phase       TEXT;
  v_alive_count INT;
BEGIN
  SELECT phase INTO v_phase FROM game_rooms WHERE id = p_room_id;
  -- Ne rien faire si lobby, résultats, ou room introuvable
  IF v_phase IS NULL OR v_phase IN ('lobby', 'result') THEN RETURN; END IF;

  -- Compter les joueurs encore dans la room ET non éliminés
  SELECT COUNT(*) INTO v_alive_count
  FROM room_players WHERE room_id = p_room_id AND NOT is_eliminated;

  -- Minimum 3 joueurs pour GhostWord
  IF v_alive_count >= 3 THEN RETURN; END IF;

  -- Retour au lobby avec message d'abandon.
  -- On ne touche QUE game_rooms pour éviter de déclencher d'autres triggers
  -- (trg_check_reveal_ready sur room_players UPDATE, etc.) qui causeraient un rollback.
  -- Le client nettoie les messages/votes localement (useEffect sur phase).
  -- startOnlineGame réinitialisera les rôles/mots/is_ready au prochain lancement.
  UPDATE game_rooms SET
    phase                 = 'lobby',
    winner                = NULL,
    discussion_turn       = 1,
    current_speaker_index = 0,
    speaker_started_at    = NULL,
    vote_round            = 0,
    tie_count             = 0,
    config = config || '{"abandon_reason": "Trop de joueurs ont quitté la partie"}'::jsonb
  WHERE id = p_room_id;
END;
$$;

-- ── Trigger AFTER DELETE (filet de sécurité si l'appel RPC échoue)
CREATE OR REPLACE FUNCTION trg_check_min_players_fn()
RETURNS TRIGGER LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM check_end_game_on_leave(OLD.room_id);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_min_players ON room_players;
CREATE TRIGGER trg_check_min_players
  AFTER DELETE ON room_players
  FOR EACH ROW EXECUTE FUNCTION trg_check_min_players_fn();
