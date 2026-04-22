-- ===========================================================================
-- BLIND RANK — MODE ONLINE
-- À exécuter UNE SEULE FOIS dans le SQL Editor de Supabase.
-- Idempotent : DROP IF EXISTS / CREATE OR REPLACE partout.
-- ===========================================================================
--
-- Modèle de données réutilise les tables multijoueur existantes :
--   - game_rooms (game_type='blindrank', phase IN ('lobby','playing','result'))
--   - room_players (pas de role/word pour Blind Rank)
--   - room_messages (chat realtime, discussion_turn et vote_round = 0)
--   - room_votes (PRIMARY KEY déjà sur (room_id, voter_name, vote_round))
--   - room_replay_votes (réutilisé tel quel)
--
-- Convention `target_name` pour Blind Rank :
--   "rank:N"  où N est l'index 0-based du slot (0 = #1 du classement, top)
--
-- État dynamique stocké en JSONB sous game_rooms.config.blindrank :
--   {
--     presetId: "uuid|null",
--     rackSize: 10,
--     tourTimeSeconds: 60,
--     tieBreak: "low" | "high",          -- low = rang numérique max
--     drawOrder: ["card_id_1", ...],     -- ordre de pioche, len = rackSize
--     cards: [{id, name, imageUrl?}, ...],  -- snapshot des cartes
--     currentCardIndex: 0,                -- index courant dans drawOrder
--     slots: [null, {card}, null, ...],   -- état des rangs (len = rackSize)
--     currentRoundStartedAt: "iso ts",
--     finished: false                     -- helper, true quand currentCardIndex >= rackSize
--   }
--
-- Sécurité de concurrence :
--   - pg_advisory_xact_lock par room → sérialise la résolution sans bloquer
--     les autres rooms.
--   - Tous les UPDATE de game_rooms ajoutent un garde-fou
--     `WHERE phase='playing' AND vote_round=expected_round`.
--
-- Résolution d'un round :
--   - Trigger : déclenché par INSERT ou UPDATE sur room_votes ; appelle le
--     resolver si tous les votants alive ont voté.
--   - RPC `blindrank_force_timeout` : appelable côté client quand le timer
--     local atteint 0 ; le resolver vérifie que (now ≥ currentRoundStartedAt +
--     tourTimeSeconds) avant de procéder.
-- ===========================================================================

-- ── 1. Guard côté process_vote_fn (GhostWord) ─────────────────────────────
-- On préserve l'existant et on s'assure qu'il ignore les autres jeux.
-- (Nécessaire car si on ajoute Blind Rank au même trigger, on aurait deux
-- résolveurs sur la même table.)
CREATE OR REPLACE FUNCTION public.process_vote_fn()
RETURNS TRIGGER LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_alive_count   INT;
  v_vote_count    INT;
  v_max_votes     INT;
  v_tied_count    INT;
  v_eliminated    TEXT;
  v_roles         TEXT[];
  v_has_special   BOOLEAN;
  v_winner        TEXT;
  v_lock_key      BIGINT;
  v_current_phase TEXT;
  v_current_round INT;
  v_game_type     TEXT;
BEGIN
  -- Guard : n'agir que pour GhostWord
  SELECT game_type INTO v_game_type FROM game_rooms WHERE id = NEW.room_id;
  IF v_game_type IS DISTINCT FROM 'ghostword' THEN
    RETURN NEW;
  END IF;

  v_lock_key := abs(hashtext(NEW.room_id))::BIGINT;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  v_current_phase := (SELECT phase      FROM game_rooms WHERE id = NEW.room_id);
  v_current_round := (SELECT vote_round FROM game_rooms WHERE id = NEW.room_id);

  IF v_current_phase IS DISTINCT FROM 'vote' OR v_current_round <> NEW.vote_round THEN
    RETURN NEW;
  END IF;

  v_alive_count := (
    SELECT COUNT(*) FROM room_players
     WHERE room_id = NEW.room_id AND NOT is_eliminated
  );

  v_vote_count := (
    SELECT COUNT(*) FROM room_votes
     WHERE room_id = NEW.room_id AND vote_round = NEW.vote_round
  );

  IF v_vote_count < v_alive_count THEN
    RETURN NEW;
  END IF;

  v_max_votes := (
    SELECT MAX(cnt) FROM (
      SELECT COUNT(*) AS cnt FROM room_votes
       WHERE room_id = NEW.room_id AND vote_round = NEW.vote_round
       GROUP BY target_name
    ) s
  );

  v_tied_count := (
    SELECT COUNT(*) FROM (
      SELECT target_name FROM room_votes
       WHERE room_id = NEW.room_id AND vote_round = NEW.vote_round
       GROUP BY target_name HAVING COUNT(*) = v_max_votes
    ) s
  );

  IF v_tied_count > 1 THEN
    UPDATE game_rooms SET
      phase                 = 'discussion',
      vote_round            = vote_round + 1,
      tie_count             = tie_count + 1,
      discussion_turn       = 1,
      current_speaker_index = 0,
      speaker_started_at    = now()
     WHERE id = NEW.room_id
       AND phase = 'vote'
       AND vote_round = NEW.vote_round;

    UPDATE room_players SET is_ready = false WHERE room_id = NEW.room_id;
    RETURN NEW;
  END IF;

  v_eliminated := (
    SELECT target_name FROM room_votes
     WHERE room_id = NEW.room_id AND vote_round = NEW.vote_round
     GROUP BY target_name ORDER BY COUNT(*) DESC LIMIT 1
  );

  UPDATE room_players SET is_eliminated = true
   WHERE room_id = NEW.room_id AND display_name = v_eliminated;

  v_roles := (
    SELECT ARRAY_AGG(DISTINCT role) FROM room_players
     WHERE room_id = NEW.room_id AND NOT is_eliminated
  );

  v_alive_count := (
    SELECT COUNT(*) FROM room_players
     WHERE room_id = NEW.room_id AND NOT is_eliminated
  );

  v_has_special := v_roles && ARRAY['ombre', 'vide'];

  IF v_alive_count <= 2 OR NOT v_has_special THEN
    IF v_has_special THEN
      v_winner := (
        SELECT role FROM room_players
         WHERE room_id = NEW.room_id AND NOT is_eliminated AND role IN ('ombre','vide')
         LIMIT 1
      );
    ELSE
      v_winner := 'initie';
    END IF;

    UPDATE game_rooms SET phase = 'result', winner = v_winner
     WHERE id = NEW.room_id
       AND phase = 'vote';
  ELSE
    UPDATE game_rooms SET
      phase                 = 'discussion',
      vote_round            = vote_round + 1,
      tie_count             = 0,
      discussion_turn       = 1,
      current_speaker_index = 0,
      speaker_started_at    = now()
     WHERE id = NEW.room_id
       AND phase = 'vote'
       AND vote_round = NEW.vote_round;

    UPDATE room_players SET is_ready = false WHERE room_id = NEW.room_id;
  END IF;

  RETURN NEW;
END;
$$;

-- ── 2. Resolver Blind Rank (utilisé par trigger ET RPC) ───────────────────
-- Cette fonction interne est le SEUL endroit où la logique de tally + apply
-- d'un round est implémentée. Elle est appelée :
--   - par le trigger `trg_process_blindrank_vote` (sur chaque INSERT/UPDATE
--     de room_votes pour une room blindrank) avec p_force_timeout=false
--   - par le RPC `blindrank_force_timeout` quand le timer expire côté client
--     avec p_force_timeout=true
-- Idempotent : si le round est déjà résolu (vote_round avancé) ou si la
-- partie n'est pas en phase 'playing', no-op silencieux.
CREATE OR REPLACE FUNCTION public._blindrank_resolve_round(
  p_room_id        TEXT,
  p_vote_round     INT,
  p_force_timeout  BOOLEAN
)
RETURNS VOID LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lock_key      BIGINT;
  v_phase         TEXT;
  v_round         INT;
  v_game_type     TEXT;
  v_config        JSONB;
  v_blindrank     JSONB;
  v_slots         JSONB;
  v_draw_order    JSONB;
  v_cards         JSONB;
  v_total         INT;
  v_idx           INT;
  v_alive_count   INT;
  v_vote_count    INT;
  v_tie_break     TEXT;
  v_winning_rank  INT;
  v_round_started TIMESTAMPTZ;
  v_tour_seconds  INT;
  v_card_id       TEXT;
  v_card          JSONB;
  v_new_index     INT;
BEGIN
  v_lock_key := abs(hashtext(p_room_id))::BIGINT;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT phase, vote_round, game_type, config
    INTO v_phase, v_round, v_game_type, v_config
    FROM game_rooms WHERE id = p_room_id;

  IF v_game_type IS DISTINCT FROM 'blindrank' THEN RETURN; END IF;
  IF v_phase IS DISTINCT FROM 'playing' THEN RETURN; END IF;
  IF v_round <> p_vote_round THEN RETURN; END IF;

  v_blindrank   := v_config -> 'blindrank';
  v_slots       := v_blindrank -> 'slots';
  v_draw_order  := v_blindrank -> 'drawOrder';
  v_cards       := v_blindrank -> 'cards';
  v_total       := jsonb_array_length(v_draw_order);
  v_idx         := (v_blindrank ->> 'currentCardIndex')::INT;
  v_tie_break   := COALESCE(v_blindrank ->> 'tieBreak', 'low');
  v_tour_seconds := COALESCE((v_blindrank ->> 'tourTimeSeconds')::INT, 60);
  v_round_started := (v_blindrank ->> 'currentRoundStartedAt')::TIMESTAMPTZ;

  v_alive_count := (
    SELECT COUNT(*) FROM room_players
     WHERE room_id = p_room_id AND NOT is_eliminated
  );
  v_vote_count := (
    SELECT COUNT(*) FROM room_votes
     WHERE room_id = p_room_id AND vote_round = p_vote_round
  );

  -- Conditions de résolution :
  --   * trigger normal : tous les alive ont voté
  --   * timeout forcé  : timer expiré (et au moins 1 vote)
  IF NOT p_force_timeout THEN
    IF v_vote_count < v_alive_count THEN RETURN; END IF;
  ELSE
    IF v_round_started IS NULL OR now() < v_round_started + (v_tour_seconds || ' seconds')::INTERVAL THEN
      RETURN;
    END IF;
    -- Si personne n'a voté, on ne peut rien décider → on relance le round
    -- en remettant le timer à zéro (évite un blocage si tout le monde dort).
    IF v_vote_count = 0 THEN
      v_blindrank := jsonb_set(v_blindrank, '{currentRoundStartedAt}', to_jsonb(now()::TEXT));
      v_config    := jsonb_set(v_config, '{blindrank}', v_blindrank);
      UPDATE game_rooms SET config = v_config
       WHERE id = p_room_id AND phase = 'playing' AND vote_round = p_vote_round;
      RETURN;
    END IF;
  END IF;

  -- Tally : ne considérer que les votes valides (rang vide).
  -- target_name format = "rank:N"
  WITH valid_votes AS (
    SELECT (regexp_replace(target_name, '^rank:', ''))::INT AS rank_idx
      FROM room_votes
     WHERE room_id = p_room_id
       AND vote_round = p_vote_round
       AND target_name LIKE 'rank:%'
  ),
  filtered AS (
    SELECT rank_idx FROM valid_votes vv
     WHERE COALESCE(v_slots -> rank_idx, 'null'::jsonb) = 'null'::jsonb
  ),
  tally AS (
    SELECT rank_idx, COUNT(*) AS cnt FROM filtered GROUP BY rank_idx
  ),
  max_t AS (SELECT MAX(cnt) AS m FROM tally),
  top_ranks AS (SELECT rank_idx FROM tally, max_t WHERE cnt = max_t.m)
  SELECT CASE WHEN v_tie_break = 'high' THEN MIN(rank_idx) ELSE MAX(rank_idx) END
    INTO v_winning_rank
    FROM top_ranks;

  -- Si aucun vote valide (tous sur slots occupés ou aucun) → fallback :
  -- on prend le premier slot vide selon tieBreak.
  IF v_winning_rank IS NULL THEN
    SELECT CASE WHEN v_tie_break = 'high' THEN MIN(idx) ELSE MAX(idx) END
      INTO v_winning_rank
      FROM (
        SELECT (ord - 1)::INT AS idx
          FROM jsonb_array_elements(v_slots) WITH ORDINALITY AS t(elem, ord)
         WHERE elem = 'null'::jsonb
      ) s;
  END IF;

  -- Aucun slot vide → fin de partie (sécurité)
  IF v_winning_rank IS NULL THEN
    v_blindrank := jsonb_set(v_blindrank, '{finished}', 'true'::jsonb);
    v_config    := jsonb_set(v_config, '{blindrank}', v_blindrank);
    UPDATE game_rooms SET config = v_config, phase = 'result'
     WHERE id = p_room_id AND phase = 'playing' AND vote_round = p_vote_round;
    RETURN;
  END IF;

  -- Carte courante (depuis drawOrder[currentCardIndex])
  v_card_id := trim(both '"' from (v_draw_order -> v_idx)::TEXT);
  SELECT card INTO v_card FROM jsonb_array_elements(v_cards) AS card
   WHERE card ->> 'id' = v_card_id;

  IF v_card IS NULL THEN
    -- Carte introuvable → état corrompu, on stoppe la partie
    v_blindrank := jsonb_set(v_blindrank, '{finished}', 'true'::jsonb);
    v_config    := jsonb_set(v_config, '{blindrank}', v_blindrank);
    UPDATE game_rooms SET config = v_config, phase = 'result'
     WHERE id = p_room_id AND phase = 'playing' AND vote_round = p_vote_round;
    RETURN;
  END IF;

  -- Apply : place la carte + advance index + reset timer
  v_slots     := jsonb_set(v_slots, ARRAY[v_winning_rank::TEXT], v_card);
  v_new_index := v_idx + 1;
  v_blindrank := jsonb_set(v_blindrank, '{slots}', v_slots);
  v_blindrank := jsonb_set(v_blindrank, '{currentCardIndex}', to_jsonb(v_new_index));
  v_blindrank := jsonb_set(v_blindrank, '{currentRoundStartedAt}', to_jsonb(now()::TEXT));
  v_config    := jsonb_set(v_config, '{blindrank}', v_blindrank);

  IF v_new_index >= v_total THEN
    v_blindrank := jsonb_set(v_blindrank, '{finished}', 'true'::jsonb);
    v_config    := jsonb_set(v_config, '{blindrank}', v_blindrank);
    UPDATE game_rooms
       SET config = v_config,
           phase = 'result',
           vote_round = vote_round + 1
     WHERE id = p_room_id AND phase = 'playing' AND vote_round = p_vote_round;
  ELSE
    UPDATE game_rooms
       SET config = v_config,
           vote_round = vote_round + 1
     WHERE id = p_room_id AND phase = 'playing' AND vote_round = p_vote_round;
  END IF;
END;
$$;

-- ── 3. Trigger sur room_votes pour Blind Rank ─────────────────────────────
CREATE OR REPLACE FUNCTION public.process_blindrank_vote_fn()
RETURNS TRIGGER LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_game_type TEXT;
BEGIN
  SELECT game_type INTO v_game_type FROM game_rooms WHERE id = NEW.room_id;
  IF v_game_type IS DISTINCT FROM 'blindrank' THEN
    RETURN NEW;
  END IF;
  PERFORM public._blindrank_resolve_round(NEW.room_id, NEW.vote_round, false);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_process_blindrank_vote ON public.room_votes;
CREATE TRIGGER trg_process_blindrank_vote
  AFTER INSERT OR UPDATE ON public.room_votes
  FOR EACH ROW EXECUTE FUNCTION public.process_blindrank_vote_fn();

-- ── 4. RPC public : forcer la résolution sur timeout côté client ──────────
CREATE OR REPLACE FUNCTION public.blindrank_force_timeout(
  p_room_id    TEXT,
  p_vote_round INT
)
RETURNS VOID LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._blindrank_resolve_round(p_room_id, p_vote_round, true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.blindrank_force_timeout(TEXT, INT) TO authenticated, anon;

-- ── 5. RPC public : caster un vote (insère ou update) ─────────────────────
-- Permet à l'UI de faire un upsert simple sans avoir à gérer manuellement
-- ON CONFLICT côté client. Vérifie que le voteur est bien dans la room.
CREATE OR REPLACE FUNCTION public.blindrank_cast_vote(
  p_room_id     TEXT,
  p_vote_round  INT,
  p_rank_index  INT
)
RETURNS VOID LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id    UUID;
  v_my_name    TEXT;
  v_phase      TEXT;
  v_round      INT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT display_name INTO v_my_name FROM room_players
   WHERE room_id = p_room_id AND user_id = v_user_id;
  IF v_my_name IS NULL THEN
    RAISE EXCEPTION 'Player not in room';
  END IF;

  SELECT phase, vote_round INTO v_phase, v_round FROM game_rooms WHERE id = p_room_id;
  IF v_phase IS DISTINCT FROM 'playing' THEN
    RAISE EXCEPTION 'Round not active';
  END IF;
  IF v_round <> p_vote_round THEN
    RAISE EXCEPTION 'Stale vote round';
  END IF;

  INSERT INTO room_votes (room_id, voter_name, target_name, vote_round)
  VALUES (p_room_id, v_my_name, 'rank:' || p_rank_index, p_vote_round)
  ON CONFLICT (room_id, voter_name, vote_round)
  DO UPDATE SET target_name = EXCLUDED.target_name,
                created_at  = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.blindrank_cast_vote(TEXT, INT, INT) TO authenticated, anon;

-- ── 6. Patch : seuil min_players adaptatif par jeu ────────────────────────
-- Le trigger `check_end_game_on_leave` codait en dur "min 3 joueurs"
-- (GhostWord). Blind Rank tolère 2 joueurs → on rend le seuil dépendant
-- du game_type pour éviter d'abandonner une partie Blind Rank à 2 joueurs.
CREATE OR REPLACE FUNCTION public.check_end_game_on_leave(p_room_id TEXT)
RETURNS VOID LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_phase       TEXT;
  v_game_type   TEXT;
  v_alive_count INT;
  v_min_players INT;
BEGIN
  SELECT phase, game_type INTO v_phase, v_game_type
    FROM game_rooms WHERE id = p_room_id;
  IF v_phase IS NULL OR v_phase IN ('lobby', 'result') THEN RETURN; END IF;

  SELECT COUNT(*) INTO v_alive_count
    FROM room_players WHERE room_id = p_room_id AND NOT is_eliminated;

  v_min_players := CASE v_game_type
    WHEN 'blindrank' THEN 2
    ELSE 3
  END;

  IF v_alive_count >= v_min_players THEN RETURN; END IF;

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

-- ── 7. Vérifications ──────────────────────────────────────────────────────
-- Pour vérifier que les triggers sont bien actifs :
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid = 'public.room_votes'::regclass AND NOT tgisinternal;
-- On doit voir : trg_process_vote, trg_process_blindrank_vote
