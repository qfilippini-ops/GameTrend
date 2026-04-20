-- ============================================================================
-- Feed RPC consolidation (Following + Explore)
-- ============================================================================
-- À exécuter dans le SQL Editor de Supabase, après schema_social_v2.sql.
-- Objectif : remplacer 4 requêtes client par 1 RPC pour chaque tab du feed.
-- ============================================================================

-- ─── 0. Index manquant : Following feed ─────────────────────────────────────
-- Optimise WHERE author_id IN (...) AND is_public AND created_at < cursor
-- L'index existant `presets_author_idx` ne couvre pas la clause is_public + tri,
-- ce qui force un Bitmap Heap Scan + filter. Avec ce composite + WHERE partiel,
-- on obtient un Index Scan direct.

CREATE INDEX IF NOT EXISTS presets_author_public_recent_idx
  ON public.presets (author_id, created_at DESC)
  WHERE is_public = true;


-- ─── 1. RPC : get_following_feed ────────────────────────────────────────────
-- Retourne le flux fusionné (presets publics + résultats partagés) des comptes
-- suivis par auth.uid(), trié par date desc, paginé via cursor `before_at`.
--
-- Avantages vs requêtes client séparées :
--   - 1 round-trip réseau au lieu de 4 (follows + profiles + presets + results)
--   - JOIN profiles côté DB → pas de Map à maintenir client-side
--   - UNION + ORDER + LIMIT en SQL → garanti correct (pas de surcharge x2)

CREATE OR REPLACE FUNCTION public.get_following_feed(
  before_at  timestamptz DEFAULT NULL,
  page_size  int         DEFAULT 10
)
RETURNS TABLE (
  item_type           text,
  item_id             uuid,
  created_at          timestamptz,
  author_id           uuid,
  author_username     text,
  author_avatar_url   text,
  payload             jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  since_at timestamptz := NOW() - INTERVAL '30 days';
BEGIN
  -- Visiteur anonyme → flux vide (le client gère l'affichage "Connexion requise")
  IF uid IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH following AS (
    SELECT f.following_id AS uid
    FROM public.follows f
    WHERE f.follower_id = uid
  ),
  preset_items AS (
    SELECT
      'preset'::text                              AS item_type,
      p.id                                        AS item_id,
      p.created_at,
      p.author_id,
      jsonb_build_object(
        'id',           p.id,
        'name',         p.name,
        'description',  p.description,
        'game_type',    p.game_type,
        'cover_url',    p.cover_url,
        'play_count',   p.play_count
      ) AS payload
    FROM public.presets p
    JOIN following fl ON fl.uid = p.author_id
    WHERE p.is_public = true
      AND p.created_at >= since_at
      AND (before_at IS NULL OR p.created_at < before_at)
    ORDER BY p.created_at DESC
    LIMIT page_size
  ),
  result_items AS (
    SELECT
      'result'::text                              AS item_type,
      r.id                                        AS item_id,
      r.created_at,
      r.user_id                                   AS author_id,
      jsonb_build_object(
        'id',           r.id,
        'game_type',    r.game_type,
        'preset_id',    r.preset_id,
        'preset_name',  r.preset_name,
        'result_data',  r.result_data
      ) AS payload
    FROM public.game_results r
    JOIN following fl ON fl.uid = r.user_id
    WHERE r.is_shared = true
      AND r.created_at >= since_at
      AND (before_at IS NULL OR r.created_at < before_at)
    ORDER BY r.created_at DESC
    LIMIT page_size
  ),
  merged AS (
    SELECT * FROM preset_items
    UNION ALL
    SELECT * FROM result_items
  )
  SELECT
    m.item_type,
    m.item_id,
    m.created_at,
    m.author_id,
    pr.username    AS author_username,
    pr.avatar_url  AS author_avatar_url,
    m.payload
  FROM merged m
  LEFT JOIN public.profiles pr ON pr.id = m.author_id
  ORDER BY m.created_at DESC
  LIMIT page_size;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_following_feed(timestamptz, int) TO authenticated, anon;


-- ─── 2. RPC : get_explore_feed ──────────────────────────────────────────────
-- Retourne en une seule passe les 2 sections de l'onglet Explore :
--   - trending_presets : top N presets publics par play_count (avec auteur)
--   - public_rooms     : lobbies ouverts (avec host + count joueurs)

CREATE OR REPLACE FUNCTION public.get_explore_feed(
  top_presets int DEFAULT 10,
  top_rooms   int DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  trending jsonb;
  rooms    jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(t ORDER BY t.play_count DESC), '[]'::jsonb)
  INTO trending
  FROM (
    SELECT
      p.id,
      p.name,
      p.description,
      p.game_type,
      p.cover_url,
      p.play_count,
      p.author_id,
      jsonb_build_object(
        'username',   pr.username,
        'avatar_url', pr.avatar_url
      ) AS author
    FROM public.presets p
    LEFT JOIN public.profiles pr ON pr.id = p.author_id
    WHERE p.is_public = true
    ORDER BY p.play_count DESC
    LIMIT top_presets
  ) t;

  SELECT COALESCE(jsonb_agg(r ORDER BY r.created_at DESC), '[]'::jsonb)
  INTO rooms
  FROM (
    SELECT
      gr.id,
      gr.game_type,
      gr.host_id,
      gr.created_at,
      COALESCE(rp.player_count, 0) AS player_count,
      jsonb_build_object(
        'username',   pr.username,
        'avatar_url', pr.avatar_url
      ) AS host
    FROM public.game_rooms gr
    LEFT JOIN public.profiles pr ON pr.id = gr.host_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS player_count
      FROM public.room_players
      WHERE room_id = gr.id
    ) rp ON true
    WHERE gr.is_private = false
      AND gr.phase = 'lobby'
    ORDER BY gr.created_at DESC
    LIMIT top_rooms
  ) r;

  RETURN jsonb_build_object(
    'trending_presets', trending,
    'public_rooms',     rooms
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_explore_feed(int, int) TO authenticated, anon;
