-- =============================================================
-- REPLAY / LOBBY VOTING + KICK + AUTO-START
-- À exécuter dans Supabase SQL Editor
-- =============================================================

-- ── 1. Table votes Rejouer / Retour au lobby ─────────────────
CREATE TABLE IF NOT EXISTS room_replay_votes (
  room_id      TEXT REFERENCES game_rooms(id) ON DELETE CASCADE,
  player_name  TEXT NOT NULL,
  choice       TEXT NOT NULL CHECK (choice IN ('replay', 'lobby')),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (room_id, player_name)
);

ALTER TABLE room_replay_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "replay_read"   ON room_replay_votes FOR SELECT USING (auth_is_room_member(room_id));
CREATE POLICY "replay_insert" ON room_replay_votes FOR INSERT WITH CHECK (auth_is_room_member(room_id));
CREATE POLICY "replay_update" ON room_replay_votes FOR UPDATE USING (auth_is_room_member(room_id));

-- ── 2. Politique kick : l'hôte peut supprimer des joueurs ────
DROP POLICY IF EXISTS "players_delete_host" ON room_players;
CREATE POLICY "players_delete_host" ON room_players FOR DELETE USING (
  room_id IN (SELECT id FROM game_rooms WHERE host_id = auth.uid())
);

-- ── 3. Fonction de reset vers le lobby ───────────────────────
-- auto_start = true → l'hôte relance automatiquement la partie
CREATE OR REPLACE FUNCTION reset_room_to_lobby(p_room_id TEXT, p_auto_start BOOLEAN DEFAULT FALSE)
RETURNS VOID LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE v_config JSONB;
BEGIN
  SELECT config INTO v_config FROM game_rooms WHERE id = p_room_id;

  UPDATE game_rooms SET
    phase                    = 'lobby',
    winner                   = NULL,
    discussion_turn          = 1,
    current_speaker_index    = 0,
    speaker_started_at       = NULL,
    vote_round               = 0,
    config = v_config || jsonb_build_object('auto_start', p_auto_start)
  WHERE id = p_room_id;

  UPDATE room_players SET
    role = NULL, word = NULL, word_image_url = NULL,
    is_eliminated = false, is_ready = false
  WHERE room_id = p_room_id;

  DELETE FROM room_messages     WHERE room_id = p_room_id;
  DELETE FROM room_votes        WHERE room_id = p_room_id;
  DELETE FROM room_replay_votes WHERE room_id = p_room_id;
END;
$$;

-- ── 4. Trigger : traite les votes Rejouer / Lobby ────────────
-- - Un seul vote "lobby" → tout le monde retourne au lobby
-- - Tous votent "replay" → relance automatique
CREATE OR REPLACE FUNCTION process_replay_vote_fn()
RETURNS TRIGGER LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total  INT;
  v_replay INT;
BEGIN
  IF NEW.choice = 'lobby' THEN
    PERFORM reset_room_to_lobby(NEW.room_id, false);
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_total  FROM room_players      WHERE room_id = NEW.room_id;
  SELECT COUNT(*) INTO v_replay FROM room_replay_votes WHERE room_id = NEW.room_id AND choice = 'replay';

  IF v_replay >= v_total THEN
    PERFORM reset_room_to_lobby(NEW.room_id, true);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_process_replay_vote ON room_replay_votes;
CREATE TRIGGER trg_process_replay_vote
  AFTER INSERT OR UPDATE ON room_replay_votes
  FOR EACH ROW EXECUTE FUNCTION process_replay_vote_fn();

-- ── 5. Activer Realtime sur la nouvelle table ────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE room_replay_votes;
