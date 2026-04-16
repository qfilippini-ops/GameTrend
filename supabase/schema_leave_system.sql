-- =============================================================
-- SYSTÈME DE DÉPART / TRANSFERT D'HÔTE / KICK
-- Version 3 — SIMPLE : pas de trigger sur DELETE, tout passe
-- par quit_room_fn appelée directement côté client via RPC.
--
-- IMPORTANT : exécuter ce fichier ENTIER dans Supabase SQL Editor
-- =============================================================

-- ── 0. SUPPRIMER LE TRIGGER QUI CAUSAIT LES ROLLBACKS ─────────
-- Ce trigger faisait un UPDATE game_rooms dans la même transaction
-- que le DELETE room_players, causant des cascades avec d'autres
-- triggers (trg_check_reveal_ready) → rollback silencieux.
DROP TRIGGER IF EXISTS trg_check_min_players ON room_players;
DROP FUNCTION IF EXISTS trg_check_min_players_fn();
DROP FUNCTION IF EXISTS check_end_game_on_leave(TEXT);

-- ── 1. Garder trg_check_reveal_ready (safe, avec guards) ──────
-- Ne réagit QUE si is_ready a CHANGÉ et que la phase = 'reveal'.
-- L'UPDATE is_host ne change pas is_ready → le guard retourne immédiatement.
CREATE OR REPLACE FUNCTION check_reveal_ready_fn()
RETURNS TRIGGER LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE v_phase TEXT; v_total INT; v_ready INT;
BEGIN
  -- Guard : ne rien faire si is_ready n'a pas changé
  IF OLD.is_ready IS NOT DISTINCT FROM NEW.is_ready THEN RETURN NEW; END IF;

  SELECT phase INTO v_phase FROM game_rooms WHERE id = NEW.room_id;
  IF v_phase IS DISTINCT FROM 'reveal' THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO v_total FROM room_players
    WHERE room_id = NEW.room_id AND NOT is_eliminated;
  SELECT COUNT(*) INTO v_ready FROM room_players
    WHERE room_id = NEW.room_id AND NOT is_eliminated AND is_ready = true;

  IF v_ready >= v_total THEN
    UPDATE game_rooms SET
      phase = 'discussion',
      discussion_turn = 1,
      current_speaker_index = 0,
      speaker_started_at = now()
    WHERE id = NEW.room_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_reveal_ready ON room_players;
CREATE TRIGGER trg_check_reveal_ready
  AFTER UPDATE ON room_players
  FOR EACH ROW EXECUTE FUNCTION check_reveal_ready_fn();

-- ══════════════════════════════════════════════════════════════
-- 2. FONCTION PRINCIPALE : quit_room_fn(room_id, display_name)
--
-- Gère TOUT : suppression, transfert d'hôte, fin de partie,
-- notification Realtime. Pas de trigger, pas de cascade.
-- Appelée directement côté client via supabase.rpc().
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION quit_room_fn(p_room_id TEXT, p_display_name TEXT)
RETURNS JSONB LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid           UUID;
  v_is_host       BOOLEAN;
  v_phase         TEXT;
  v_remaining     INT;
  v_alive         INT;
  v_new_host_name TEXT;
  v_new_host_uid  UUID;
  v_event_type    TEXT;
BEGIN
  -- ① Trouver le joueur
  SELECT user_id, is_host INTO v_uid, v_is_host
  FROM room_players
  WHERE room_id = p_room_id AND display_name = p_display_name;

  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  -- ② Phase actuelle
  SELECT phase INTO v_phase FROM game_rooms WHERE id = p_room_id;
  IF v_phase IS NULL THEN
    RETURN jsonb_build_object('status', 'no_room');
  END IF;

  -- ③ Si hôte → trouver le successeur AVANT de supprimer
  IF v_is_host THEN
    SELECT display_name, user_id INTO v_new_host_name, v_new_host_uid
    FROM room_players
    WHERE room_id = p_room_id
      AND display_name != p_display_name
      AND NOT is_eliminated
    ORDER BY join_order
    LIMIT 1;

    IF v_new_host_uid IS NOT NULL THEN
      UPDATE game_rooms SET host_id = v_new_host_uid WHERE id = p_room_id;
    END IF;
  END IF;

  -- ④ Supprimer le joueur (pas de trigger AFTER DELETE → pas de cascade)
  DELETE FROM room_players
  WHERE room_id = p_room_id AND display_name = p_display_name;

  -- ⑤ Transférer is_host au successeur
  -- (trg_check_reveal_ready fire mais le guard sur is_ready le bloque)
  IF v_is_host AND v_new_host_name IS NOT NULL THEN
    UPDATE room_players SET is_host = true
    WHERE room_id = p_room_id AND display_name = v_new_host_name;
  END IF;

  -- ⑥ Si personne ne reste → supprimer la room
  SELECT COUNT(*) INTO v_remaining
  FROM room_players WHERE room_id = p_room_id;

  IF v_remaining = 0 THEN
    DELETE FROM game_rooms WHERE id = p_room_id;
    RETURN jsonb_build_object('status', 'closed');
  END IF;

  -- ⑦ Fin de partie si joueurs insuffisants (< 3 pour GhostWord)
  IF v_phase NOT IN ('lobby', 'result') THEN
    SELECT COUNT(*) INTO v_alive
    FROM room_players WHERE room_id = p_room_id AND NOT is_eliminated;

    IF v_alive < 3 THEN
      v_event_type := CASE WHEN v_is_host THEN 'host_left' ELSE 'player_left' END;
      UPDATE game_rooms SET
        phase = 'lobby',
        winner = NULL,
        discussion_turn = 1,
        current_speaker_index = 0,
        speaker_started_at = NULL,
        vote_round = 0,
        config = config || jsonb_build_object(
          'abandon_reason', 'Trop de joueurs ont quitté la partie',
          'last_event', jsonb_build_object(
            'type', v_event_type,
            'player', p_display_name,
            'new_host', v_new_host_name,
            'ts', extract(epoch from clock_timestamp())::TEXT
          )
        )
      WHERE id = p_room_id;
      RETURN jsonb_build_object('status', 'game_ended');
    END IF;
  END IF;

  -- ⑧ Stocker l'événement pour le toast Realtime
  v_event_type := CASE WHEN v_is_host THEN 'host_left' ELSE 'player_left' END;
  UPDATE game_rooms SET
    config = config || jsonb_build_object(
      'last_event', jsonb_build_object(
        'type', v_event_type,
        'player', p_display_name,
        'new_host', v_new_host_name,
        'ts', extract(epoch from clock_timestamp())::TEXT
      )
    )
  WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'status', CASE WHEN v_new_host_name IS NOT NULL THEN 'transferred' ELSE 'left' END,
    'new_host', v_new_host_name
  );
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 3. KICK PAR L'HÔTE
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION kick_player_fn(p_room_id TEXT, p_display_name TEXT)
RETURNS JSONB LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result JSONB;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM room_players
    WHERE room_id = p_room_id AND display_name = p_display_name AND NOT is_host
  ) THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  v_result := quit_room_fn(p_room_id, p_display_name);

  IF EXISTS (SELECT 1 FROM game_rooms WHERE id = p_room_id) THEN
    UPDATE game_rooms SET
      config = config || jsonb_build_object(
        'last_event', jsonb_build_object(
          'type', 'kicked',
          'player', p_display_name,
          'ts', extract(epoch from clock_timestamp())::TEXT
        )
      )
    WHERE id = p_room_id;
  END IF;

  RETURN v_result;
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 4. DÉCONNEXION DE L'HÔTE (appelé par le prochain joueur)
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION handle_disconnect_fn(p_room_id TEXT)
RETURNS JSONB LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE v_host_name TEXT;
BEGIN
  SELECT display_name INTO v_host_name
  FROM room_players
  WHERE room_id = p_room_id AND is_host = true;

  IF v_host_name IS NULL THEN
    RETURN jsonb_build_object('status', 'no_host');
  END IF;

  RETURN quit_room_fn(p_room_id, v_host_name);
END;
$$;

-- ══════════════════════════════════════════════════════════════
-- 5. RÉTRO-COMPAT : leave_room_fn (pour leaveAllOtherRooms)
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION leave_room_fn(p_room_id TEXT, p_user_id UUID)
RETURNS JSONB LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name TEXT;
BEGIN
  SELECT display_name INTO v_name
  FROM room_players
  WHERE room_id = p_room_id AND user_id = p_user_id;

  IF v_name IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  RETURN quit_room_fn(p_room_id, v_name);
END;
$$;
