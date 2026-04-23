-- ===========================================================================
-- OUTBID — MODE ONLINE (1v1)
-- À exécuter UNE SEULE FOIS dans le SQL Editor de Supabase.
-- Idempotent : DROP IF EXISTS / CREATE OR REPLACE partout.
-- ===========================================================================
--
-- Modèle de données réutilise les tables multijoueur existantes :
--   - game_rooms (game_type='outbid', phase IN ('lobby','playing','result'))
--   - room_players (1v1, exactement 2 joueurs)
--   - room_messages (chat realtime, discussion_turn = vote_round = 0)
--   - room_replay_votes (réutilisé tel quel)
--
-- PAS d'utilisation de room_votes — le flux est tour-par-tour, pas simultané.
-- Toute la logique passe par les RPCs `outbid_place_bid`, `outbid_pass` et
-- `outbid_force_timeout`.
--
-- État dynamique stocké en JSONB sous game_rooms.config.outbid :
--   {
--     presetId:           "uuid|null",
--     teamSize:           8,                    -- 3..11
--     tourTimeSeconds:    60,
--     openingBidder:      "alternate"|"loser"|"winner"|"random",
--     cards:              [{id,name,imageUrl?}, ...],   -- snapshot, len = teamSize*2
--     cardOrder:          ["id1","id2",...],            -- ordre de tirage, len = teamSize*2
--     currentCardIndex:   0,                            -- index dans cardOrder
--     currentBid:         {"amount": 100, "bidder": "Alice"},
--     awaitingResponse:   "Bob",                        -- nom du joueur qui doit répondre
--     decisionStartedAt:  "iso ts",                     -- reset à chaque décision
--     playerA:            {"name":"Alice","points":100000,"team":[{"cardId":"x","price":50000}]},
--     playerB:            {"name":"Bob",  "points":100000,"team":[]},
--     firstBidder:        "Alice",                      -- qui a ouvert la 1ère carte (random)
--     lastWinner:         null,                         -- pour openingBidder='winner'
--     lastLoser:          null,                         -- pour openingBidder='loser'
--     finished:           false
--   }
--
-- Cycle d'une carte :
--   1. Une carte est posée : currentBid = { amount: 100, bidder: opener }
--      (ou amount = points restants si opener < 100)
--      awaitingResponse = autre joueur
--   2. L'autre joueur appelle outbid_place_bid (surenchérir) ou outbid_pass.
--   3. Si surenchère : currentBid mis à jour, awaitingResponse swap, vote_round++.
--   4. Si pass (ou timeout via outbid_force_timeout) : la carte est attribuée à
--      currentBid.bidder au prix amount. _outbid_advance_card avance.
--   5. Si un joueur est "out" (0 point ou équipe pleine) : auto-fill — toutes
--      les cartes restantes vont au joueur restant gratuitement, en un seul
--      UPDATE atomique. Le client anime l'apparition côté UI.
--
-- Sécurité de concurrence :
--   - pg_advisory_xact_lock par room → sérialise les RPCs sur une même room.
--   - Tous les UPDATE de game_rooms ajoutent `WHERE phase='playing' AND vote_round=expected`.
-- ===========================================================================


-- ── 1. Helper interne : avance d'une carte (résolution) ───────────────────
-- Doit être appelée DEPUIS une RPC (qui a déjà pris l'advisory lock).
-- Présuppose que la carte courante a un currentBid valide et awaitingResponse
-- vient de passer (ou a timeouté).
CREATE OR REPLACE FUNCTION public._outbid_advance_card(
  p_room_id TEXT
)
RETURNS VOID LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_config         JSONB;
  v_outbid         JSONB;
  v_team_size      INT;
  v_opening_bidder TEXT;
  v_card_order     JSONB;
  v_idx            INT;
  v_total          INT;
  v_bid            JSONB;
  v_winner_name    TEXT;
  v_amount         INT;
  v_card_id        TEXT;
  v_player_a       JSONB;
  v_player_b       JSONB;
  v_a_name         TEXT;
  v_b_name         TEXT;
  v_first_bidder   TEXT;
  v_a_points       INT;
  v_b_points       INT;
  v_a_team_size    INT;
  v_b_team_size    INT;
  v_team_entry     JSONB;
  v_next_opener    TEXT;
  v_other          TEXT;
  v_opener_points  INT;
  v_opening_amount INT;
  v_a_full         BOOLEAN;
  v_b_full         BOOLEAN;
  v_a_broke        BOOLEAN;
  v_b_broke        BOOLEAN;
  v_receiver       TEXT;
  v_round          INT;
BEGIN
  SELECT config, vote_round INTO v_config, v_round
    FROM game_rooms WHERE id = p_room_id;

  v_outbid := v_config -> 'outbid';
  IF v_outbid IS NULL THEN RETURN; END IF;

  v_team_size      := COALESCE((v_outbid ->> 'teamSize')::INT, 8);
  v_opening_bidder := COALESCE(v_outbid ->> 'openingBidder', 'alternate');
  v_card_order     := v_outbid -> 'cardOrder';
  v_idx            := COALESCE((v_outbid ->> 'currentCardIndex')::INT, 0);
  v_total          := jsonb_array_length(v_card_order);
  v_bid            := v_outbid -> 'currentBid';
  v_winner_name    := v_bid ->> 'bidder';
  v_amount         := COALESCE((v_bid ->> 'amount')::INT, 0);
  v_player_a       := v_outbid -> 'playerA';
  v_player_b       := v_outbid -> 'playerB';
  v_a_name         := v_player_a ->> 'name';
  v_b_name         := v_player_b ->> 'name';
  v_first_bidder   := v_outbid ->> 'firstBidder';

  v_card_id := trim(both '"' from (v_card_order -> v_idx)::TEXT);

  -- Applique : ajoute la carte à l'équipe du gagnant + déduit ses points
  v_team_entry := jsonb_build_object('cardId', v_card_id, 'price', v_amount);

  IF v_winner_name = v_a_name THEN
    v_player_a := jsonb_set(
      v_player_a, '{team}',
      (v_player_a -> 'team') || jsonb_build_array(v_team_entry)
    );
    v_player_a := jsonb_set(
      v_player_a, '{points}',
      to_jsonb(GREATEST(0, COALESCE((v_player_a ->> 'points')::INT, 0) - v_amount))
    );
  ELSE
    v_player_b := jsonb_set(
      v_player_b, '{team}',
      (v_player_b -> 'team') || jsonb_build_array(v_team_entry)
    );
    v_player_b := jsonb_set(
      v_player_b, '{points}',
      to_jsonb(GREATEST(0, COALESCE((v_player_b ->> 'points')::INT, 0) - v_amount))
    );
  END IF;

  v_outbid := jsonb_set(v_outbid, '{playerA}', v_player_a);
  v_outbid := jsonb_set(v_outbid, '{playerB}', v_player_b);
  v_outbid := jsonb_set(v_outbid, '{lastWinner}', to_jsonb(v_winner_name));
  v_outbid := jsonb_set(
    v_outbid, '{lastLoser}',
    to_jsonb(CASE WHEN v_winner_name = v_a_name THEN v_b_name ELSE v_a_name END)
  );

  v_idx := v_idx + 1;
  v_outbid := jsonb_set(v_outbid, '{currentCardIndex}', to_jsonb(v_idx));

  -- Fin de partie ?
  IF v_idx >= v_total THEN
    v_outbid := jsonb_set(v_outbid, '{finished}', 'true'::jsonb);
    v_outbid := jsonb_set(v_outbid, '{currentBid}', 'null'::jsonb);
    v_outbid := jsonb_set(v_outbid, '{awaitingResponse}', 'null'::jsonb);
    v_outbid := jsonb_set(v_outbid, '{decisionStartedAt}', 'null'::jsonb);
    v_config := jsonb_set(v_config, '{outbid}', v_outbid);
    UPDATE game_rooms
       SET config = v_config,
           phase = 'result',
           vote_round = vote_round + 1
     WHERE id = p_room_id AND phase = 'playing' AND vote_round = v_round;
    RETURN;
  END IF;

  -- ── Mode auto-fill : si l'un des deux joueurs est "out" ──
  -- Out = 0 point OU équipe pleine. L'autre prend tout le reste gratuitement.
  v_a_team_size := jsonb_array_length(v_player_a -> 'team');
  v_b_team_size := jsonb_array_length(v_player_b -> 'team');
  v_a_points    := COALESCE((v_player_a ->> 'points')::INT, 0);
  v_b_points    := COALESCE((v_player_b ->> 'points')::INT, 0);
  v_a_full      := v_a_team_size >= v_team_size;
  v_b_full      := v_b_team_size >= v_team_size;
  v_a_broke     := v_a_points <= 0;
  v_b_broke     := v_b_points <= 0;

  IF (v_a_full OR v_a_broke) AND NOT (v_b_full OR v_b_broke) THEN
    v_receiver := v_b_name;
  ELSIF (v_b_full OR v_b_broke) AND NOT (v_a_full OR v_a_broke) THEN
    v_receiver := v_a_name;
  ELSE
    v_receiver := NULL;
  END IF;

  IF v_receiver IS NOT NULL THEN
    -- ── Mode auto-fill : on NE distribue PAS encore les cartes ──
    -- On marque juste l'état pour que le client anime le déroulement.
    -- Une fois l'animation terminée, le client appelle `outbid_finalize_autofill`
    -- qui distribue effectivement les cartes et passe en phase 'result'.
    v_outbid := jsonb_set(v_outbid, '{autoFill}', 'true'::jsonb);
    v_outbid := jsonb_set(
      v_outbid, '{autoFillReceiver}', to_jsonb(v_receiver)
    );
    v_outbid := jsonb_set(
      v_outbid, '{autoFillStartedAt}',
      to_jsonb(to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
    );
    v_outbid := jsonb_set(v_outbid, '{currentBid}', 'null'::jsonb);
    v_outbid := jsonb_set(v_outbid, '{awaitingResponse}', 'null'::jsonb);
    v_outbid := jsonb_set(v_outbid, '{decisionStartedAt}', 'null'::jsonb);
    v_config := jsonb_set(v_config, '{outbid}', v_outbid);
    UPDATE game_rooms
       SET config = v_config,
           vote_round = vote_round + 1
     WHERE id = p_room_id AND phase = 'playing' AND vote_round = v_round;
    RETURN;
  END IF;

  -- ── Carte suivante normale : détermine l'opener ──
  v_other := CASE WHEN v_winner_name = v_a_name THEN v_b_name ELSE v_a_name END;

  v_next_opener := CASE v_opening_bidder
    WHEN 'alternate' THEN
      CASE WHEN v_idx % 2 = 0 THEN v_first_bidder
           ELSE CASE WHEN v_first_bidder = v_a_name THEN v_b_name ELSE v_a_name END
      END
    WHEN 'winner' THEN v_winner_name
    WHEN 'loser'  THEN v_other
    WHEN 'random' THEN
      CASE WHEN random() < 0.5 THEN v_a_name ELSE v_b_name END
    ELSE v_first_bidder
  END;

  -- Détermine la mise d'ouverture (100 ou tout le reste si < 100)
  v_opener_points := CASE WHEN v_next_opener = v_a_name
                          THEN COALESCE((v_player_a ->> 'points')::INT, 0)
                          ELSE COALESCE((v_player_b ->> 'points')::INT, 0)
                     END;
  v_opening_amount := LEAST(100, v_opener_points);

  v_outbid := jsonb_set(
    v_outbid, '{currentBid}',
    jsonb_build_object('amount', v_opening_amount, 'bidder', v_next_opener)
  );
  v_outbid := jsonb_set(
    v_outbid, '{awaitingResponse}',
    to_jsonb(CASE WHEN v_next_opener = v_a_name THEN v_b_name ELSE v_a_name END)
  );
  v_outbid := jsonb_set(
    v_outbid, '{decisionStartedAt}',
    to_jsonb(to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  );

  v_config := jsonb_set(v_config, '{outbid}', v_outbid);

  UPDATE game_rooms
     SET config = v_config,
         vote_round = vote_round + 1
   WHERE id = p_room_id AND phase = 'playing' AND vote_round = v_round;
END;
$$;


-- ── 2. RPC : surenchérir ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.outbid_place_bid(
  p_room_id    TEXT,
  p_vote_round INT,
  p_amount     INT
)
RETURNS VOID LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lock_key   BIGINT;
  v_user_id    UUID;
  v_my_name    TEXT;
  v_phase      TEXT;
  v_round      INT;
  v_game_type  TEXT;
  v_config     JSONB;
  v_outbid     JSONB;
  v_player_a   JSONB;
  v_player_b   JSONB;
  v_a_name     TEXT;
  v_b_name     TEXT;
  v_my_points  INT;
  v_bid        JSONB;
  v_cur_amount INT;
  v_awaiting   TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_lock_key := abs(hashtext(p_room_id))::BIGINT;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT phase, vote_round, game_type, config
    INTO v_phase, v_round, v_game_type, v_config
    FROM game_rooms WHERE id = p_room_id;

  IF v_game_type IS DISTINCT FROM 'outbid' THEN
    RAISE EXCEPTION 'Wrong game type';
  END IF;
  IF v_phase IS DISTINCT FROM 'playing' THEN
    RAISE EXCEPTION 'Round not active';
  END IF;
  IF v_round <> p_vote_round THEN
    RAISE EXCEPTION 'Stale vote round';
  END IF;

  SELECT display_name INTO v_my_name FROM room_players
   WHERE room_id = p_room_id AND user_id = v_user_id;
  IF v_my_name IS NULL THEN
    RAISE EXCEPTION 'Player not in room';
  END IF;

  v_outbid    := v_config -> 'outbid';
  v_player_a  := v_outbid -> 'playerA';
  v_player_b  := v_outbid -> 'playerB';
  v_a_name    := v_player_a ->> 'name';
  v_b_name    := v_player_b ->> 'name';
  v_bid       := v_outbid -> 'currentBid';
  v_cur_amount := COALESCE((v_bid ->> 'amount')::INT, 0);
  v_awaiting  := v_outbid ->> 'awaitingResponse';

  IF v_awaiting IS DISTINCT FROM v_my_name THEN
    RAISE EXCEPTION 'Not your turn';
  END IF;

  v_my_points := CASE WHEN v_my_name = v_a_name
                      THEN COALESCE((v_player_a ->> 'points')::INT, 0)
                      ELSE COALESCE((v_player_b ->> 'points')::INT, 0)
                 END;

  IF p_amount <= v_cur_amount THEN
    RAISE EXCEPTION 'Bid must be higher than current bid';
  END IF;
  IF p_amount > v_my_points THEN
    RAISE EXCEPTION 'Bid exceeds your points';
  END IF;

  -- Applique la nouvelle mise
  v_outbid := jsonb_set(
    v_outbid, '{currentBid}',
    jsonb_build_object('amount', p_amount, 'bidder', v_my_name)
  );
  v_outbid := jsonb_set(
    v_outbid, '{awaitingResponse}',
    to_jsonb(CASE WHEN v_my_name = v_a_name THEN v_b_name ELSE v_a_name END)
  );
  v_outbid := jsonb_set(
    v_outbid, '{decisionStartedAt}',
    to_jsonb(to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  );

  v_config := jsonb_set(v_config, '{outbid}', v_outbid);

  UPDATE game_rooms
     SET config = v_config,
         vote_round = vote_round + 1
   WHERE id = p_room_id AND phase = 'playing' AND vote_round = p_vote_round;
END;
$$;

GRANT EXECUTE ON FUNCTION public.outbid_place_bid(TEXT, INT, INT) TO authenticated, anon;


-- ── 3. RPC : passer (l'adversaire remporte la carte) ──────────────────────
CREATE OR REPLACE FUNCTION public.outbid_pass(
  p_room_id    TEXT,
  p_vote_round INT
)
RETURNS VOID LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lock_key  BIGINT;
  v_user_id   UUID;
  v_my_name   TEXT;
  v_phase     TEXT;
  v_round     INT;
  v_game_type TEXT;
  v_config    JSONB;
  v_outbid    JSONB;
  v_awaiting  TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_lock_key := abs(hashtext(p_room_id))::BIGINT;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT phase, vote_round, game_type, config
    INTO v_phase, v_round, v_game_type, v_config
    FROM game_rooms WHERE id = p_room_id;

  IF v_game_type IS DISTINCT FROM 'outbid' THEN
    RAISE EXCEPTION 'Wrong game type';
  END IF;
  IF v_phase IS DISTINCT FROM 'playing' THEN
    RAISE EXCEPTION 'Round not active';
  END IF;
  IF v_round <> p_vote_round THEN
    RAISE EXCEPTION 'Stale vote round';
  END IF;

  SELECT display_name INTO v_my_name FROM room_players
   WHERE room_id = p_room_id AND user_id = v_user_id;
  IF v_my_name IS NULL THEN
    RAISE EXCEPTION 'Player not in room';
  END IF;

  v_outbid := v_config -> 'outbid';
  v_awaiting := v_outbid ->> 'awaitingResponse';

  IF v_awaiting IS DISTINCT FROM v_my_name THEN
    RAISE EXCEPTION 'Not your turn to pass';
  END IF;

  PERFORM public._outbid_advance_card(p_room_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.outbid_pass(TEXT, INT) TO authenticated, anon;


-- ── 4. RPC : forcer le timeout (n'importe quel client peut appeler) ──────
-- Le serveur valide le timestamp avant de considérer comme un pass.
CREATE OR REPLACE FUNCTION public.outbid_force_timeout(
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
  v_outbid        JSONB;
  v_dec_started   TIMESTAMPTZ;
  v_tour_seconds  INT;
BEGIN
  v_lock_key := abs(hashtext(p_room_id))::BIGINT;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT phase, vote_round, game_type, config
    INTO v_phase, v_round, v_game_type, v_config
    FROM game_rooms WHERE id = p_room_id;

  IF v_game_type IS DISTINCT FROM 'outbid' THEN RETURN; END IF;
  IF v_phase IS DISTINCT FROM 'playing' THEN RETURN; END IF;
  IF v_round <> p_vote_round THEN RETURN; END IF;

  v_outbid := v_config -> 'outbid';
  IF v_outbid IS NULL THEN RETURN; END IF;

  v_dec_started  := (v_outbid ->> 'decisionStartedAt')::TIMESTAMPTZ;
  v_tour_seconds := COALESCE((v_outbid ->> 'tourTimeSeconds')::INT, 60);

  IF v_dec_started IS NULL THEN RETURN; END IF;
  IF now() < v_dec_started + (v_tour_seconds || ' seconds')::INTERVAL THEN
    RETURN;
  END IF;

  -- Timer expiré : équivaut à un pass de awaitingResponse → l'adversaire prend.
  PERFORM public._outbid_advance_card(p_room_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.outbid_force_timeout(TEXT, INT) TO authenticated, anon;


-- ── 5. RPC : finaliser l'auto-fill (n'importe quel client peut appeler) ──
-- Distribue toutes les cartes restantes au receiver de l'auto-fill et passe
-- en phase 'result'. Idempotent (no-op si autoFill n'est pas marqué).
CREATE OR REPLACE FUNCTION public.outbid_finalize_autofill(
  p_room_id    TEXT,
  p_vote_round INT
)
RETURNS VOID LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lock_key           BIGINT;
  v_phase              TEXT;
  v_round              INT;
  v_game_type          TEXT;
  v_config             JSONB;
  v_outbid             JSONB;
  v_team_size          INT;
  v_card_order         JSONB;
  v_idx                INT;
  v_total              INT;
  v_player_a           JSONB;
  v_player_b           JSONB;
  v_a_name             TEXT;
  v_receiver           TEXT;
  v_receiver_team      JSONB;
  v_receiver_team_size INT;
  v_loop_card_id       TEXT;
BEGIN
  v_lock_key := abs(hashtext(p_room_id))::BIGINT;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT phase, vote_round, game_type, config
    INTO v_phase, v_round, v_game_type, v_config
    FROM game_rooms WHERE id = p_room_id;

  IF v_game_type IS DISTINCT FROM 'outbid' THEN RETURN; END IF;
  IF v_phase IS DISTINCT FROM 'playing' THEN RETURN; END IF;
  IF v_round <> p_vote_round THEN RETURN; END IF;

  v_outbid := v_config -> 'outbid';
  IF v_outbid IS NULL THEN RETURN; END IF;
  IF NOT COALESCE((v_outbid ->> 'autoFill')::BOOLEAN, false) THEN RETURN; END IF;

  v_receiver   := v_outbid ->> 'autoFillReceiver';
  v_team_size  := COALESCE((v_outbid ->> 'teamSize')::INT, 8);
  v_card_order := v_outbid -> 'cardOrder';
  v_idx        := COALESCE((v_outbid ->> 'currentCardIndex')::INT, 0);
  v_total      := jsonb_array_length(v_card_order);
  v_player_a   := v_outbid -> 'playerA';
  v_player_b   := v_outbid -> 'playerB';
  v_a_name     := v_player_a ->> 'name';

  IF v_receiver IS NULL THEN RETURN; END IF;

  IF v_receiver = v_a_name THEN
    v_receiver_team := v_player_a -> 'team';
  ELSE
    v_receiver_team := v_player_b -> 'team';
  END IF;
  v_receiver_team_size := jsonb_array_length(v_receiver_team);

  WHILE v_idx < v_total AND v_receiver_team_size < v_team_size LOOP
    v_loop_card_id := trim(both '"' from (v_card_order -> v_idx)::TEXT);
    v_receiver_team := v_receiver_team || jsonb_build_array(
      jsonb_build_object('cardId', v_loop_card_id, 'price', 0)
    );
    v_receiver_team_size := v_receiver_team_size + 1;
    v_idx := v_idx + 1;
  END LOOP;

  IF v_receiver = v_a_name THEN
    v_player_a := jsonb_set(v_player_a, '{team}', v_receiver_team);
    v_outbid := jsonb_set(v_outbid, '{playerA}', v_player_a);
  ELSE
    v_player_b := jsonb_set(v_player_b, '{team}', v_receiver_team);
    v_outbid := jsonb_set(v_outbid, '{playerB}', v_player_b);
  END IF;

  v_outbid := jsonb_set(v_outbid, '{currentCardIndex}', to_jsonb(v_idx));
  v_outbid := jsonb_set(v_outbid, '{finished}', 'true'::jsonb);

  v_config := jsonb_set(v_config, '{outbid}', v_outbid);

  UPDATE game_rooms
     SET config     = v_config,
         phase      = 'result',
         vote_round = vote_round + 1
   WHERE id = p_room_id AND phase = 'playing' AND vote_round = v_round;
END;
$$;

GRANT EXECUTE ON FUNCTION public.outbid_finalize_autofill(TEXT, INT) TO authenticated, anon;


-- ── 6. Patch : seuil min_players adaptatif (ajoute Outbid) ────────────────
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
    WHEN 'outbid'    THEN 2
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
-- Pour vérifier que les RPCs sont bien créés :
--   SELECT proname FROM pg_proc WHERE proname LIKE 'outbid_%';
-- Doit lister : outbid_place_bid, outbid_pass, outbid_force_timeout,
--               outbid_finalize_autofill
