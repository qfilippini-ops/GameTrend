-- ===========================================================================
-- DYP — MODE ONLINE
-- À exécuter UNE SEULE FOIS dans le SQL Editor de Supabase.
-- Idempotent : DROP IF EXISTS / CREATE OR REPLACE partout.
-- ===========================================================================
--
-- Modèle de données réutilise les tables multijoueur existantes :
--   - game_rooms (game_type='dyp', phase IN ('lobby','playing','result'))
--   - room_players (pas de role/word pour DYP)
--   - room_messages (chat realtime)
--   - room_votes (PRIMARY KEY déjà sur (room_id, voter_name, vote_round))
--   - room_replay_votes (réutilisé tel quel)
--
-- Convention `target_name` pour DYP :
--   "card:<cardId>"  où <cardId> est l'id d'une des 2 cartes du duel courant.
--
-- État dynamique stocké en JSONB sous game_rooms.config.dyp :
--   {
--     presetId:           "uuid|null",
--     bracketSize:        8,
--     tourTimeSeconds:    60,
--     tieBreak:           "random" | "first",
--     cards:              [{id, name, imageUrl?}, ...],   -- snapshot du preset
--     totalRounds:        3,                              -- log2(bracketSize)
--     bracket:            [                               -- 1 entrée par round
--       [{matchId, card1Id, card2Id, winnerId|null}, ...],
--       ...
--     ],
--     currentRound:       1,                              -- 1-based
--     currentMatchIndex:  0,
--     currentRoundStartedAt: "iso ts",                    -- début du duel
--     pendingTransition:  false,                          -- vrai entre 2 rounds
--     transitionStartedAt: "iso ts|null",                 -- start du compte 3 s
--     championId:         null,
--     finished:           false
--   }
--
-- Sécurité de concurrence :
--   - pg_advisory_xact_lock par room → sérialise la résolution sans bloquer
--     les autres rooms.
--   - Tous les UPDATE de game_rooms ajoutent un garde-fou
--     `WHERE phase='playing' AND vote_round=expected_round`.
--
-- Cycle de vie d'un duel :
--   1. Le client poste son vote via RPC `dyp_cast_vote`.
--   2. Le trigger `trg_process_dyp_vote` appelle `_dyp_resolve_round` dès que
--      tous les joueurs alive ont voté.
--   3. Si timer expiré côté client, n'importe quel client appelle
--      `dyp_force_timeout` → `_dyp_resolve_round(..., true)`.
--   4. Le resolver place le winner, advance currentMatchIndex, ou (si dernier
--      match du round) bascule en pendingTransition pendant 3 s.
--   5. Pendant la transition, n'importe quel client appelle
--      `dyp_force_round_advance` au timeout local pour générer le round suivant.
-- ===========================================================================


-- ── 1. Resolver DYP (utilisé par trigger ET RPC timeout) ──────────────────
CREATE OR REPLACE FUNCTION public._dyp_resolve_round(
  p_room_id        TEXT,
  p_vote_round     INT,
  p_force_timeout  BOOLEAN
)
RETURNS VOID LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lock_key       BIGINT;
  v_phase          TEXT;
  v_round          INT;
  v_game_type      TEXT;
  v_config         JSONB;
  v_dyp            JSONB;
  v_bracket        JSONB;
  v_current_round  INT;
  v_current_match  INT;
  v_total_rounds   INT;
  v_round_matches  JSONB;
  v_match          JSONB;
  v_card1_id       TEXT;
  v_card2_id       TEXT;
  v_tie_break      TEXT;
  v_round_started  TIMESTAMPTZ;
  v_tour_seconds   INT;
  v_alive_count    INT;
  v_vote_count     INT;
  v_winner_id      TEXT;
  v_max_count      INT;
  v_path_winner    TEXT[];
  v_is_last_match  BOOLEAN;
  v_is_last_round  BOOLEAN;
BEGIN
  v_lock_key := abs(hashtext(p_room_id))::BIGINT;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT phase, vote_round, game_type, config
    INTO v_phase, v_round, v_game_type, v_config
    FROM game_rooms WHERE id = p_room_id;

  IF v_game_type IS DISTINCT FROM 'dyp' THEN RETURN; END IF;
  IF v_phase IS DISTINCT FROM 'playing' THEN RETURN; END IF;
  IF v_round <> p_vote_round THEN RETURN; END IF;

  v_dyp           := v_config -> 'dyp';
  IF v_dyp IS NULL THEN RETURN; END IF;

  -- Si on est déjà en transition entre rounds, ce n'est pas le moment de
  -- résoudre un duel.
  IF COALESCE((v_dyp ->> 'pendingTransition')::BOOLEAN, FALSE) THEN
    RETURN;
  END IF;

  v_bracket       := v_dyp -> 'bracket';
  v_current_round := COALESCE((v_dyp ->> 'currentRound')::INT, 1);
  v_current_match := COALESCE((v_dyp ->> 'currentMatchIndex')::INT, 0);
  v_total_rounds  := COALESCE((v_dyp ->> 'totalRounds')::INT,
                              jsonb_array_length(v_dyp -> 'cards'));
  v_tie_break     := COALESCE(v_dyp ->> 'tieBreak', 'random');
  v_tour_seconds  := COALESCE((v_dyp ->> 'tourTimeSeconds')::INT, 60);
  v_round_started := (v_dyp ->> 'currentRoundStartedAt')::TIMESTAMPTZ;

  v_round_matches := v_bracket -> (v_current_round - 1);
  v_match         := v_round_matches -> v_current_match;

  IF v_match IS NULL THEN RETURN; END IF;

  v_card1_id := v_match ->> 'card1Id';
  v_card2_id := v_match ->> 'card2Id';

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
  --   * timeout forcé  : timer expiré
  IF NOT p_force_timeout THEN
    IF v_vote_count < v_alive_count THEN RETURN; END IF;
  ELSE
    IF v_round_started IS NULL OR
       now() < v_round_started + (v_tour_seconds || ' seconds')::INTERVAL THEN
      RETURN;
    END IF;
  END IF;

  -- Tally : ne considère que les votes pour les 2 cartes du duel courant.
  WITH valid_votes AS (
    SELECT regexp_replace(target_name, '^card:', '') AS card_id, created_at
      FROM room_votes
     WHERE room_id = p_room_id
       AND vote_round = p_vote_round
       AND target_name LIKE 'card:%'
  ),
  filtered AS (
    SELECT card_id, created_at FROM valid_votes
     WHERE card_id IN (v_card1_id, v_card2_id)
  ),
  tally AS (
    SELECT card_id, COUNT(*)::INT AS cnt, MIN(created_at) AS first_ts
      FROM filtered GROUP BY card_id
  )
  SELECT MAX(cnt) INTO v_max_count FROM tally;

  IF v_max_count IS NULL THEN
    -- Aucun vote valide (timeout pur) → fallback selon tieBreak
    IF v_tie_break = 'random' THEN
      v_winner_id := CASE WHEN random() < 0.5 THEN v_card1_id ELSE v_card2_id END;
    ELSE
      -- "first" sans aucun vote → on garde un comportement déterministe :
      -- card1 par défaut (ordre du bracket).
      v_winner_id := v_card1_id;
    END IF;
  ELSE
    -- Sélectionne parmi les cartes à égalité au max
    IF v_tie_break = 'first' THEN
      WITH valid_votes AS (
        SELECT regexp_replace(target_name, '^card:', '') AS card_id, created_at
          FROM room_votes
         WHERE room_id = p_room_id
           AND vote_round = p_vote_round
           AND target_name LIKE 'card:%'
      ),
      filtered AS (
        SELECT card_id, created_at FROM valid_votes
         WHERE card_id IN (v_card1_id, v_card2_id)
      ),
      tally AS (
        SELECT card_id, COUNT(*)::INT AS cnt, MIN(created_at) AS first_ts
          FROM filtered GROUP BY card_id
      )
      SELECT card_id INTO v_winner_id
        FROM tally WHERE cnt = v_max_count
       ORDER BY first_ts ASC LIMIT 1;
    ELSE
      WITH valid_votes AS (
        SELECT regexp_replace(target_name, '^card:', '') AS card_id, created_at
          FROM room_votes
         WHERE room_id = p_room_id
           AND vote_round = p_vote_round
           AND target_name LIKE 'card:%'
      ),
      filtered AS (
        SELECT card_id, created_at FROM valid_votes
         WHERE card_id IN (v_card1_id, v_card2_id)
      ),
      tally AS (
        SELECT card_id, COUNT(*)::INT AS cnt FROM filtered GROUP BY card_id
      )
      SELECT card_id INTO v_winner_id
        FROM tally WHERE cnt = v_max_count
       ORDER BY random() LIMIT 1;
    END IF;
  END IF;

  IF v_winner_id IS NULL THEN
    -- Sécurité : ne devrait jamais arriver, mais on prend card1 par défaut.
    v_winner_id := v_card1_id;
  END IF;

  -- Apply : pose winnerId dans bracket[round-1][matchIndex]
  v_path_winner := ARRAY[(v_current_round - 1)::TEXT, v_current_match::TEXT, 'winnerId'];
  v_bracket     := jsonb_set(v_bracket, v_path_winner, to_jsonb(v_winner_id));
  v_dyp         := jsonb_set(v_dyp, '{bracket}', v_bracket);

  v_is_last_match := (v_current_match >= jsonb_array_length(v_round_matches) - 1);
  v_is_last_round := (v_current_round >= v_total_rounds);

  IF v_is_last_match AND v_is_last_round THEN
    -- Champion ! Fin de partie.
    v_dyp := jsonb_set(v_dyp, '{championId}', to_jsonb(v_winner_id));
    v_dyp := jsonb_set(v_dyp, '{finished}', 'true'::jsonb);
    v_config := jsonb_set(v_config, '{dyp}', v_dyp);
    UPDATE game_rooms
       SET config = v_config,
           phase = 'result',
           vote_round = vote_round + 1
     WHERE id = p_room_id AND phase = 'playing' AND vote_round = p_vote_round;
  ELSIF v_is_last_match THEN
    -- Fin du round → on entre en transition (3 s) avant le round suivant.
    v_dyp := jsonb_set(v_dyp, '{pendingTransition}', 'true'::jsonb);
    v_dyp := jsonb_set(v_dyp, '{transitionStartedAt}', to_jsonb(now()::TEXT));
    v_config := jsonb_set(v_config, '{dyp}', v_dyp);
    UPDATE game_rooms
       SET config = v_config,
           vote_round = vote_round + 1
     WHERE id = p_room_id AND phase = 'playing' AND vote_round = p_vote_round;
  ELSE
    -- Match suivant dans le même round
    v_dyp := jsonb_set(v_dyp, '{currentMatchIndex}', to_jsonb(v_current_match + 1));
    v_dyp := jsonb_set(v_dyp, '{currentRoundStartedAt}', to_jsonb(now()::TEXT));
    v_config := jsonb_set(v_config, '{dyp}', v_dyp);
    UPDATE game_rooms
       SET config = v_config,
           vote_round = vote_round + 1
     WHERE id = p_room_id AND phase = 'playing' AND vote_round = p_vote_round;
  END IF;
END;
$$;


-- ── 2. Avancement du round (utilisé par RPC après transition de 3 s) ──────
CREATE OR REPLACE FUNCTION public._dyp_advance_round_internal(
  p_room_id    TEXT,
  p_vote_round INT
)
RETURNS VOID LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lock_key      BIGINT;
  v_phase         TEXT;
  v_round         INT;
  v_game_type     TEXT;
  v_config        JSONB;
  v_dyp           JSONB;
  v_bracket       JSONB;
  v_current_round INT;
  v_total_rounds  INT;
  v_pending       BOOLEAN;
  v_trans_started TIMESTAMPTZ;
  v_new_round     JSONB;
BEGIN
  v_lock_key := abs(hashtext(p_room_id))::BIGINT;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT phase, vote_round, game_type, config
    INTO v_phase, v_round, v_game_type, v_config
    FROM game_rooms WHERE id = p_room_id;

  IF v_game_type IS DISTINCT FROM 'dyp' THEN RETURN; END IF;
  IF v_phase IS DISTINCT FROM 'playing' THEN RETURN; END IF;
  IF v_round <> p_vote_round THEN RETURN; END IF;

  v_dyp := v_config -> 'dyp';
  IF v_dyp IS NULL THEN RETURN; END IF;

  v_pending       := COALESCE((v_dyp ->> 'pendingTransition')::BOOLEAN, FALSE);
  v_trans_started := (v_dyp ->> 'transitionStartedAt')::TIMESTAMPTZ;

  IF NOT v_pending THEN RETURN; END IF;
  IF v_trans_started IS NULL OR now() < v_trans_started + INTERVAL '3 seconds' THEN
    RETURN;
  END IF;

  v_bracket       := v_dyp -> 'bracket';
  v_current_round := COALESCE((v_dyp ->> 'currentRound')::INT, 1);
  v_total_rounds  := COALESCE((v_dyp ->> 'totalRounds')::INT, 1);

  -- Cas pathologique : on est déjà au dernier round, on ne devrait pas
  -- avoir pendingTransition=true. Sécurité.
  IF v_current_round >= v_total_rounds THEN
    v_dyp := jsonb_set(v_dyp, '{pendingTransition}', 'false'::jsonb);
    v_config := jsonb_set(v_config, '{dyp}', v_dyp);
    UPDATE game_rooms SET config = v_config
     WHERE id = p_room_id AND phase = 'playing' AND vote_round = p_vote_round;
    RETURN;
  END IF;

  -- Construit le round suivant en appariant aléatoirement les winners
  -- du round courant.
  WITH winners_shuffled AS (
    SELECT (elem ->> 'winnerId') AS winner_id,
           (ROW_NUMBER() OVER (ORDER BY random()) - 1)::INT AS rn
      FROM jsonb_array_elements(v_bracket -> (v_current_round - 1)) AS elem
     WHERE elem ->> 'winnerId' IS NOT NULL
  ),
  paired AS (
    SELECT (rn / 2)::INT AS match_idx,
           MAX(CASE WHEN rn % 2 = 0 THEN winner_id END) AS card1_id,
           MAX(CASE WHEN rn % 2 = 1 THEN winner_id END) AS card2_id
      FROM winners_shuffled
     GROUP BY (rn / 2)::INT
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'matchId',  'r' || (v_current_round + 1) || 'm' || match_idx,
           'card1Id',  card1_id,
           'card2Id',  card2_id,
           'winnerId', NULL
         ) ORDER BY match_idx), '[]'::jsonb)
    INTO v_new_round
    FROM paired;

  -- Push le nouveau round dans le bracket
  v_bracket := v_bracket || jsonb_build_array(v_new_round);

  v_dyp := jsonb_set(v_dyp, '{bracket}', v_bracket);
  v_dyp := jsonb_set(v_dyp, '{currentRound}', to_jsonb(v_current_round + 1));
  v_dyp := jsonb_set(v_dyp, '{currentMatchIndex}', '0'::jsonb);
  v_dyp := jsonb_set(v_dyp, '{pendingTransition}', 'false'::jsonb);
  v_dyp := jsonb_set(v_dyp, '{transitionStartedAt}', 'null'::jsonb);
  v_dyp := jsonb_set(v_dyp, '{currentRoundStartedAt}', to_jsonb(now()::TEXT));
  v_config := jsonb_set(v_config, '{dyp}', v_dyp);

  UPDATE game_rooms
     SET config = v_config,
         vote_round = vote_round + 1
   WHERE id = p_room_id AND phase = 'playing' AND vote_round = p_vote_round;
END;
$$;


-- ── 3. Trigger sur room_votes pour DYP ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_dyp_vote_fn()
RETURNS TRIGGER LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_game_type TEXT;
BEGIN
  SELECT game_type INTO v_game_type FROM game_rooms WHERE id = NEW.room_id;
  IF v_game_type IS DISTINCT FROM 'dyp' THEN
    RETURN NEW;
  END IF;
  PERFORM public._dyp_resolve_round(NEW.room_id, NEW.vote_round, false);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_process_dyp_vote ON public.room_votes;
CREATE TRIGGER trg_process_dyp_vote
  AFTER INSERT OR UPDATE ON public.room_votes
  FOR EACH ROW EXECUTE FUNCTION public.process_dyp_vote_fn();


-- ── 4. RPC publique : caster un vote (insère ou update) ───────────────────
CREATE OR REPLACE FUNCTION public.dyp_cast_vote(
  p_room_id    TEXT,
  p_vote_round INT,
  p_card_id    TEXT
)
RETURNS VOID LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id   UUID;
  v_my_name   TEXT;
  v_phase     TEXT;
  v_round     INT;
  v_dyp       JSONB;
  v_match     JSONB;
  v_pending   BOOLEAN;
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

  SELECT phase, vote_round, config -> 'dyp' INTO v_phase, v_round, v_dyp
    FROM game_rooms WHERE id = p_room_id;
  IF v_phase IS DISTINCT FROM 'playing' THEN
    RAISE EXCEPTION 'Round not active';
  END IF;
  IF v_round <> p_vote_round THEN
    RAISE EXCEPTION 'Stale vote round';
  END IF;

  v_pending := COALESCE((v_dyp ->> 'pendingTransition')::BOOLEAN, FALSE);
  IF v_pending THEN
    RAISE EXCEPTION 'Transition in progress';
  END IF;

  -- Vérifie que la carte fait bien partie du duel courant
  v_match := (v_dyp -> 'bracket')
              -> ((v_dyp ->> 'currentRound')::INT - 1)
              -> ((v_dyp ->> 'currentMatchIndex')::INT);
  IF v_match IS NULL THEN
    RAISE EXCEPTION 'No current match';
  END IF;
  IF p_card_id <> (v_match ->> 'card1Id') AND p_card_id <> (v_match ->> 'card2Id') THEN
    RAISE EXCEPTION 'Card not in current duel';
  END IF;

  INSERT INTO room_votes (room_id, voter_name, target_name, vote_round)
  VALUES (p_room_id, v_my_name, 'card:' || p_card_id, p_vote_round)
  ON CONFLICT (room_id, voter_name, vote_round)
  DO UPDATE SET target_name = EXCLUDED.target_name,
                created_at  = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.dyp_cast_vote(TEXT, INT, TEXT) TO authenticated, anon;


-- ── 5. RPC publique : forcer la résolution sur timeout côté client ────────
CREATE OR REPLACE FUNCTION public.dyp_force_timeout(
  p_room_id    TEXT,
  p_vote_round INT
)
RETURNS VOID LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._dyp_resolve_round(p_room_id, p_vote_round, true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.dyp_force_timeout(TEXT, INT) TO authenticated, anon;


-- ── 6. RPC publique : avancer au round suivant après transition ───────────
CREATE OR REPLACE FUNCTION public.dyp_force_round_advance(
  p_room_id    TEXT,
  p_vote_round INT
)
RETURNS VOID LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._dyp_advance_round_internal(p_room_id, p_vote_round);
END;
$$;

GRANT EXECUTE ON FUNCTION public.dyp_force_round_advance(TEXT, INT) TO authenticated, anon;


-- ── 7. Patch : seuil min_players adaptatif par jeu (ajoute DYP) ───────────
-- Le trigger `check_end_game_on_leave` avait un CASE par game_type pour le
-- min_players. On ajoute DYP (2 joueurs minimum, comme Blind Rank).
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
    WHEN 'dyp'       THEN 2
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


-- ── 8. Vérifications ──────────────────────────────────────────────────────
-- Pour vérifier que les triggers sont bien actifs :
--   SELECT tgname FROM pg_trigger
--    WHERE tgrelid = 'public.room_votes'::regclass AND NOT tgisinternal;
-- On doit voir : trg_process_vote, trg_process_blindrank_vote, trg_process_dyp_vote
