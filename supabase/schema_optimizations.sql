-- ========================================================================
-- Optimisations BDD : ajustements de seuils et de RPC
-- ========================================================================
-- À exécuter dans le SQL Editor de Supabase, après schema_social.sql.
-- ========================================================================

-- ─── 1. Seuil "is_online" : 2 min → 5 min ───────────────────────────────
-- L'heartbeat client passe de 60s à 3 min pour économiser des écritures.
-- On élargit la fenêtre "en ligne" à 5 min pour conserver 2 min de tolérance
-- en cas de timer désynchronisé (onglet en arrière-plan, etc.).

CREATE OR REPLACE FUNCTION public.get_friend_activities()
RETURNS TABLE (
  user_id    UUID,
  username   TEXT,
  avatar_url TEXT,
  last_seen_at TIMESTAMPTZ,
  is_online  BOOLEAN,
  room_id    TEXT,
  room_phase TEXT,
  game_type  TEXT,
  friendship_id UUID
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id                                                      AS user_id,
    p.username,
    p.avatar_url,
    p.last_seen_at,
    (p.last_seen_at IS NOT NULL AND
     p.last_seen_at > NOW() - INTERVAL '5 minutes')          AS is_online,
    active_room.room_id,
    active_room.phase                                         AS room_phase,
    active_room.game_type,
    f.id                                                      AS friendship_id
  FROM public.friendships f
  JOIN public.profiles p ON p.id = CASE
    WHEN f.requester_id = auth.uid() THEN f.addressee_id
    ELSE f.requester_id
  END
  LEFT JOIN LATERAL (
    SELECT rp.room_id, gr.phase, gr.game_type
    FROM public.room_players rp
    JOIN public.game_rooms gr ON gr.id = rp.room_id
    WHERE rp.user_id = p.id
      AND gr.phase IN ('lobby', 'reveal', 'discussion', 'vote')
    ORDER BY rp.joined_at DESC
    LIMIT 1
  ) active_room ON TRUE
  WHERE (f.requester_id = auth.uid() OR f.addressee_id = auth.uid())
    AND f.status = 'accepted'
  ORDER BY
    (p.last_seen_at IS NOT NULL AND p.last_seen_at > NOW() - INTERVAL '5 minutes') DESC,
    active_room.room_id IS NOT NULL DESC,
    p.username ASC;
END;
$$;
