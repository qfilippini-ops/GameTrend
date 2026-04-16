-- =============================================================
-- MULTIJOUEUR EN LIGNE — GhostWord
-- À exécuter dans Supabase SQL Editor
-- =============================================================

-- ── game_rooms : état public de la partie ─────────────────────
CREATE TABLE IF NOT EXISTS game_rooms (
  id                          TEXT PRIMARY KEY,          -- code court ex: "AB3X9K"
  host_id                     UUID REFERENCES profiles(id) ON DELETE CASCADE,
  game_type                   TEXT NOT NULL DEFAULT 'ghostword',
  config                      JSONB NOT NULL DEFAULT '{}', -- presetIds, ombrePercent
  phase                       TEXT NOT NULL DEFAULT 'lobby',
    -- lobby | reveal | discussion | vote | result
  reveal_index                INTEGER NOT NULL DEFAULT 0, -- unused (each device reveals itself)
  discussion_turn             INTEGER NOT NULL DEFAULT 1,
  discussion_turns_per_round  INTEGER NOT NULL DEFAULT 2,
  current_speaker_index       INTEGER NOT NULL DEFAULT 0,
  speaker_started_at          TIMESTAMPTZ,
  speaker_duration_seconds    INTEGER NOT NULL DEFAULT 30,
  vote_round                  INTEGER NOT NULL DEFAULT 0,
  winner                      TEXT,
  created_at                  TIMESTAMPTZ DEFAULT now(),
  expires_at                  TIMESTAMPTZ DEFAULT now() + INTERVAL '2 hours'
);

-- ── room_players : joueurs + données privées ──────────────────
CREATE TABLE IF NOT EXISTS room_players (
  room_id        TEXT      REFERENCES game_rooms(id) ON DELETE CASCADE,
  user_id        UUID,                          -- null possible (anon auth)
  display_name   TEXT      NOT NULL,
  is_host        BOOLEAN   NOT NULL DEFAULT false,
  is_eliminated  BOOLEAN   NOT NULL DEFAULT false,
  is_ready       BOOLEAN   NOT NULL DEFAULT false,  -- pour phase reveal
  -- PRIVÉ — jamais exposé directement au client, uniquement via Server Action
  role           TEXT,
  word           TEXT,
  word_image_url TEXT,
  join_order     INTEGER   NOT NULL DEFAULT 0,
  joined_at      TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (room_id, display_name)
);

-- ── room_messages : chat de discussion ───────────────────────
CREATE TABLE IF NOT EXISTS room_messages (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id         TEXT REFERENCES game_rooms(id) ON DELETE CASCADE,
  player_name     TEXT NOT NULL,
  message         TEXT NOT NULL,
  discussion_turn INTEGER NOT NULL,
  vote_round      INTEGER NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ── room_votes : votes par round ─────────────────────────────
CREATE TABLE IF NOT EXISTS room_votes (
  room_id      TEXT REFERENCES game_rooms(id) ON DELETE CASCADE,
  voter_name   TEXT NOT NULL,
  target_name  TEXT NOT NULL,
  vote_round   INTEGER NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (room_id, voter_name, vote_round)
);

-- =============================================================
-- ROW LEVEL SECURITY
-- =============================================================

ALTER TABLE game_rooms    ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_players  ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_votes    ENABLE ROW LEVEL SECURITY;

-- game_rooms : lecture — lobby ouvert + membres de la room
CREATE POLICY "rooms_read" ON game_rooms FOR SELECT USING (
  phase = 'lobby'
  OR host_id = auth.uid()
  OR id IN (
    SELECT room_id FROM room_players WHERE user_id = auth.uid()
  )
);
CREATE POLICY "rooms_insert" ON game_rooms FOR INSERT WITH CHECK (host_id = auth.uid());
CREATE POLICY "rooms_update" ON game_rooms FOR UPDATE USING (host_id = auth.uid());

-- room_players : lecture — membres de la room ou lobby public
-- NB : role/word sont lus UNIQUEMENT via Server Action, jamais exposés directement
CREATE POLICY "players_read" ON room_players FOR SELECT USING (
  room_id IN (
    SELECT id FROM game_rooms WHERE phase = 'lobby'
    UNION
    SELECT rp.room_id FROM room_players rp WHERE rp.user_id = auth.uid()
  )
);
CREATE POLICY "players_insert" ON room_players FOR INSERT WITH CHECK (
  user_id = auth.uid()
);
CREATE POLICY "players_update_self" ON room_players FOR UPDATE USING (
  user_id = auth.uid()
);
-- Le host peut aussi modifier (pour assigner roles/mots et éliminer)
CREATE POLICY "players_update_host" ON room_players FOR UPDATE USING (
  room_id IN (SELECT id FROM game_rooms WHERE host_id = auth.uid())
);

-- room_messages : lecture/écriture membres
CREATE POLICY "messages_read" ON room_messages FOR SELECT USING (
  room_id IN (SELECT room_id FROM room_players WHERE user_id = auth.uid())
);
CREATE POLICY "messages_insert" ON room_messages FOR INSERT WITH CHECK (
  room_id IN (SELECT room_id FROM room_players WHERE user_id = auth.uid() AND display_name = player_name)
);

-- room_votes : chaque joueur voit les votes après résolution
CREATE POLICY "votes_read" ON room_votes FOR SELECT USING (
  room_id IN (SELECT room_id FROM room_players WHERE user_id = auth.uid())
);
CREATE POLICY "votes_insert" ON room_votes FOR INSERT WITH CHECK (
  room_id IN (SELECT room_id FROM room_players WHERE user_id = auth.uid() AND display_name = voter_name)
);

-- =============================================================
-- Activer Realtime sur les tables nécessaires
-- (À faire aussi dans Supabase Dashboard → Database → Replication)
-- =============================================================
-- ALTER PUBLICATION supabase_realtime ADD TABLE game_rooms;
-- ALTER PUBLICATION supabase_realtime ADD TABLE room_players;
-- ALTER PUBLICATION supabase_realtime ADD TABLE room_messages;
-- ALTER PUBLICATION supabase_realtime ADD TABLE room_votes;
