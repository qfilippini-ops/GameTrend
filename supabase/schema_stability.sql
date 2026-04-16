-- =============================================================
-- STABILITÉ : tie_count, transfert d'hôte, vote trigger (égalité)
-- À exécuter dans Supabase SQL Editor
-- =============================================================

-- ── 1. Nouvelles colonnes ─────────────────────────────────────
ALTER TABLE game_rooms   ADD COLUMN IF NOT EXISTS tie_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE room_players ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT now();

-- ── 2. Politique : joueur peut mettre à jour last_seen_at ─────
-- (players_update_self existe déjà, elle couvre cette colonne)

-- ── 3. Transfert d'hôte ou fermeture ─────────────────────────
-- Appelée quand l'hôte se déconnecte.
-- - Si assez de joueurs : transfère l'hôte au joueur avec le join_order le plus bas.
-- - Sinon : supprime la room (kick tout le monde via Realtime DELETE).
-- Retourne : 'transferred:<nom>' | 'closed' | 'no_room'
CREATE OR REPLACE FUNCTION transfer_host_or_close(p_room_id TEXT)
RETURNS TEXT LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_new_name TEXT;
  v_new_uid  UUID;
  v_count    INT;
  MIN_PLAYERS CONSTANT INT := 3;
BEGIN
  -- Vérifier que la room existe
  IF NOT EXISTS (SELECT 1 FROM game_rooms WHERE id = p_room_id) THEN
    RETURN 'no_room';
  END IF;

  -- Joueurs non-hôtes non-éliminés
  SELECT COUNT(*) INTO v_count
  FROM room_players WHERE room_id = p_room_id AND NOT is_host AND NOT is_eliminated;

  IF v_count < MIN_PLAYERS - 1 THEN
    -- Pas assez de joueurs pour continuer
    DELETE FROM game_rooms WHERE id = p_room_id;
    RETURN 'closed';
  END IF;

  -- Trouver le prochain hôte (join_order le plus bas parmi les non-hôtes)
  SELECT display_name, user_id INTO v_new_name, v_new_uid
  FROM room_players
  WHERE room_id = p_room_id AND NOT is_host AND NOT is_eliminated
  ORDER BY join_order LIMIT 1;

  IF v_new_name IS NULL THEN
    DELETE FROM game_rooms WHERE id = p_room_id;
    RETURN 'closed';
  END IF;

  -- Effectuer le transfert
  UPDATE room_players SET is_host = false WHERE room_id = p_room_id AND is_host = true;
  UPDATE room_players SET is_host = true  WHERE room_id = p_room_id AND display_name = v_new_name;
  UPDATE game_rooms     SET host_id = v_new_uid WHERE id = p_room_id;

  RETURN 'transferred:' || v_new_name;
END;
$$;

-- ── 4. Trigger de vote — gestion de l'égalité ────────────────
-- Remplace le trigger existant.
-- Égalité → "Tour de prolongation" : phase='discussion', tie_count++
-- Pas d'égalité → élimination normale + vérification victoire
CREATE OR REPLACE FUNCTION process_vote_fn()
RETURNS TRIGGER LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_alive_count  INT;
  v_vote_count   INT;
  v_max_votes    INT;
  v_tied_count   INT;
  v_eliminated   TEXT;
  v_roles        TEXT[];
  v_has_special  BOOLEAN;
  v_winner       TEXT;
BEGIN
  -- Vérifier si tout le monde a voté
  SELECT COUNT(*) INTO v_alive_count FROM room_players
  WHERE room_id = NEW.room_id AND NOT is_eliminated;

  SELECT COUNT(*) INTO v_vote_count FROM room_votes
  WHERE room_id = NEW.room_id AND vote_round = NEW.vote_round;

  IF v_vote_count < v_alive_count THEN RETURN NEW; END IF;

  -- Trouver le maximum de votes
  SELECT MAX(cnt) INTO v_max_votes FROM (
    SELECT COUNT(*) AS cnt FROM room_votes
    WHERE room_id = NEW.room_id AND vote_round = NEW.vote_round
    GROUP BY target_name
  ) s;

  -- Compter les joueurs à égalité
  SELECT COUNT(*) INTO v_tied_count FROM (
    SELECT target_name FROM room_votes
    WHERE room_id = NEW.room_id AND vote_round = NEW.vote_round
    GROUP BY target_name HAVING COUNT(*) = v_max_votes
  ) s;

  IF v_tied_count > 1 THEN
    -- ─── ÉGALITÉ → Tour de prolongation ───────────────────────
    UPDATE game_rooms SET
      phase                 = 'discussion',
      vote_round            = vote_round + 1,
      tie_count             = tie_count + 1,
      discussion_turn       = 1,
      current_speaker_index = 0,
      speaker_started_at    = now()
    WHERE id = NEW.room_id;
    RETURN NEW;
  END IF;

  -- ─── PAS D'ÉGALITÉ → Éliminer le joueur le plus voté ────────
  SELECT target_name INTO v_eliminated FROM room_votes
  WHERE room_id = NEW.room_id AND vote_round = NEW.vote_round
  GROUP BY target_name ORDER BY COUNT(*) DESC LIMIT 1;

  UPDATE room_players SET is_eliminated = true
  WHERE room_id = NEW.room_id AND display_name = v_eliminated;

  -- Vérifier la condition de victoire
  SELECT ARRAY_AGG(DISTINCT role) INTO v_roles
  FROM room_players WHERE room_id = NEW.room_id AND NOT is_eliminated;

  SELECT COUNT(*) INTO v_alive_count
  FROM room_players WHERE room_id = NEW.room_id AND NOT is_eliminated;

  v_has_special := v_roles && ARRAY['ombre', 'vide'];

  IF v_alive_count <= 2 OR NOT v_has_special THEN
    -- Fin de partie
    IF v_has_special THEN
      SELECT role INTO v_winner FROM room_players
      WHERE room_id = NEW.room_id AND NOT is_eliminated AND role IN ('ombre','vide') LIMIT 1;
    ELSE
      v_winner := 'initie';
    END IF;
    UPDATE game_rooms SET phase = 'result', winner = v_winner WHERE id = NEW.room_id;
  ELSE
    -- Continuer : nouvelle phase de discussion
    UPDATE game_rooms SET
      phase                 = 'discussion',
      vote_round            = vote_round + 1,
      tie_count             = 0,
      discussion_turn       = 1,
      current_speaker_index = 0,
      speaker_started_at    = now()
    WHERE id = NEW.room_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_process_vote ON room_votes;
CREATE TRIGGER trg_process_vote
  AFTER INSERT ON room_votes
  FOR EACH ROW EXECUTE FUNCTION process_vote_fn();

-- ── 5. Trigger : fin de partie si joueur quitte en cours de jeu ─
-- Quand un joueur quitte (DELETE room_players) pendant la partie,
-- si il reste < 3 joueurs vivants on déclenche la fin de partie.
CREATE OR REPLACE FUNCTION trg_check_min_players_fn()
RETURNS TRIGGER LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_phase       TEXT;
  v_alive_count INT;
  v_roles       TEXT[];
  v_has_special BOOLEAN;
  v_winner      TEXT;
BEGIN
  -- Ne rien faire si la room est en lobby ou déjà terminée
  SELECT phase INTO v_phase FROM game_rooms WHERE id = OLD.room_id;
  IF v_phase IS NULL OR v_phase IN ('lobby', 'result') THEN
    RETURN OLD;
  END IF;

  -- Compter les joueurs encore vivants (non éliminés et présents)
  SELECT COUNT(*) INTO v_alive_count
  FROM room_players WHERE room_id = OLD.room_id AND NOT is_eliminated;

  IF v_alive_count >= 3 THEN RETURN OLD; END IF;

  -- Pas assez de joueurs → fin de partie
  SELECT ARRAY_AGG(DISTINCT role) INTO v_roles
  FROM room_players WHERE room_id = OLD.room_id AND NOT is_eliminated;

  v_has_special := (v_roles IS NOT NULL) AND (v_roles && ARRAY['ombre', 'vide']);

  IF v_has_special THEN
    SELECT role INTO v_winner FROM room_players
    WHERE room_id = OLD.room_id AND NOT is_eliminated AND role IN ('ombre', 'vide') LIMIT 1;
  ELSE
    v_winner := 'initie';
  END IF;

  UPDATE game_rooms SET phase = 'result', winner = v_winner WHERE id = OLD.room_id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_min_players ON room_players;
CREATE TRIGGER trg_check_min_players
  AFTER DELETE ON room_players
  FOR EACH ROW EXECUTE FUNCTION trg_check_min_players_fn();

-- ── 6. Politique RLS : mise à jour last_seen_at ───────────────
-- players_update_self couvre déjà toutes les colonnes de room_players → rien à ajouter
