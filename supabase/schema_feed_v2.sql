-- ══════════════════════════════════════════════════════════════════════════
-- FEED V2 — feed enrichi (self + engagement + activity profile)
-- ──────────────────────────────────────────────────────────────────────────
-- Étend schema_feed.sql avec :
--   1. get_following_feed : inclut désormais les posts de auth.uid() (auto)
--      et expose les compteurs like/dislike/comment dans le payload des
--      résultats. Tri "hot" : engagement avec décroissance temporelle.
--   2. get_user_activity_feed : feed unifié (presets + résultats partagés)
--      pour un utilisateur ciblé (page profil), tri chronologique simple.
--
-- À exécuter APRÈS schema_social_v3.sql.
-- ══════════════════════════════════════════════════════════════════════════


-- ─── 1. Refonte get_following_feed ───────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_following_feed(timestamptz, int);

CREATE OR REPLACE FUNCTION public.get_following_feed(
  before_at  timestamptz DEFAULT NULL,
  page_size  int         DEFAULT 10
)
RETURNS TABLE (
  item_type                   text,
  item_id                     uuid,
  created_at                  timestamptz,
  author_id                   uuid,
  author_username             text,
  author_avatar_url           text,
  author_subscription_status  text,
  payload                     jsonb,
  hot_score                   double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  since_at timestamptz := NOW() - INTERVAL '30 days';
BEGIN
  IF uid IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH visible_authors AS (
    -- Comptes suivis ∪ {soi-même} (auto-feed)
    SELECT f.following_id AS uid FROM public.follows f WHERE f.follower_id = uid
    UNION
    SELECT uid AS uid
  ),
  preset_items AS (
    SELECT
      'preset'::text AS item_type,
      p.id           AS item_id,
      p.created_at,
      p.author_id,
      jsonb_build_object(
        'id',           p.id,
        'name',         p.name,
        'description',  p.description,
        'game_type',    p.game_type,
        'cover_url',    p.cover_url,
        'play_count',   p.play_count
      ) AS payload,
      -- Tri "hot" simple pour les presets : combine play_count + récence.
      (COALESCE(p.play_count,0) + 1)::double precision
        / power(EXTRACT(EPOCH FROM (NOW() - p.created_at))/3600.0 + 2.0, 1.5) AS hot_score
    FROM public.presets p
    JOIN visible_authors va ON va.uid = p.author_id
    WHERE p.is_public = true
      AND p.created_at >= since_at
  ),
  result_items AS (
    SELECT
      'result'::text AS item_type,
      r.id           AS item_id,
      r.created_at,
      r.user_id      AS author_id,
      jsonb_build_object(
        'id',            r.id,
        'game_type',     r.game_type,
        'preset_id',     r.preset_id,
        'preset_name',   r.preset_name,
        'result_data',   r.result_data,
        'like_count',    r.like_count,
        'dislike_count', r.dislike_count,
        'comment_count', r.comment_count
      ) AS payload,
      -- Engagement total pondéré : commentaires comptent x2.
      (
        COALESCE(r.like_count,0)
        + COALESCE(r.dislike_count,0)
        + 2 * COALESCE(r.comment_count,0)
        + 1
      )::double precision
        / power(EXTRACT(EPOCH FROM (NOW() - r.created_at))/3600.0 + 2.0, 1.5) AS hot_score
    FROM public.game_results r
    JOIN visible_authors va ON va.uid = r.user_id
    WHERE r.is_shared = true
      AND r.created_at >= since_at
  ),
  merged AS (
    SELECT * FROM preset_items
    UNION ALL
    SELECT * FROM result_items
  ),
  filtered AS (
    -- Curseur de pagination basé sur created_at (stable, pas sur hot_score
    -- qui change avec le temps). On accepte donc un léger ré-ordonnancement
    -- entre pages : c'est le compromis classique "feed hot".
    SELECT * FROM merged
    WHERE before_at IS NULL OR created_at < before_at
  )
  SELECT
    f.item_type,
    f.item_id,
    f.created_at,
    f.author_id,
    pr.username,
    pr.avatar_url,
    COALESCE(pr.subscription_status, 'free'),
    f.payload,
    f.hot_score
  FROM filtered f
  LEFT JOIN public.profiles pr ON pr.id = f.author_id
  ORDER BY f.hot_score DESC, f.created_at DESC
  LIMIT page_size;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_following_feed(timestamptz, int) TO authenticated, anon;


-- ─── 2. Nouveau RPC : get_user_activity_feed ──────────────────────────────
-- Feed d'activité d'un utilisateur précis (page profil). Pas de tri "hot",
-- juste chronologique : on veut voir l'historique récent. Pas de fenêtre
-- 30j ici, tout l'historique partagé est visible.
CREATE OR REPLACE FUNCTION public.get_user_activity_feed(
  p_user_id  uuid,
  before_at  timestamptz DEFAULT NULL,
  page_size  int         DEFAULT 10
)
RETURNS TABLE (
  item_type                   text,
  item_id                     uuid,
  created_at                  timestamptz,
  author_id                   uuid,
  author_username             text,
  author_avatar_url           text,
  author_subscription_status  text,
  payload                     jsonb,
  hot_score                   double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH preset_items AS (
    SELECT
      'preset'::text AS item_type,
      p.id           AS item_id,
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
    WHERE p.author_id = p_user_id
      AND p.is_public = true
  ),
  result_items AS (
    SELECT
      'result'::text AS item_type,
      r.id           AS item_id,
      r.created_at,
      r.user_id      AS author_id,
      jsonb_build_object(
        'id',            r.id,
        'game_type',     r.game_type,
        'preset_id',     r.preset_id,
        'preset_name',   r.preset_name,
        'result_data',   r.result_data,
        'like_count',    r.like_count,
        'dislike_count', r.dislike_count,
        'comment_count', r.comment_count
      ) AS payload
    FROM public.game_results r
    WHERE r.user_id = p_user_id
      AND r.is_shared = true
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
    pr.username,
    pr.avatar_url,
    COALESCE(pr.subscription_status, 'free'),
    m.payload,
    0.0::double precision -- hot_score ignoré, on trie chronologique
  FROM merged m
  LEFT JOIN public.profiles pr ON pr.id = m.author_id
  WHERE before_at IS NULL OR m.created_at < before_at
  ORDER BY m.created_at DESC
  LIMIT page_size;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_activity_feed(uuid, timestamptz, int) TO authenticated, anon;


-- ─── 3. Index sur game_results pour boost requêtes feed ──────────────────
CREATE INDEX IF NOT EXISTS game_results_user_shared_idx
  ON public.game_results(user_id, created_at DESC)
  WHERE is_shared = true;
