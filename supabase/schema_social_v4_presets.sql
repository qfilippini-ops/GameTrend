-- ══════════════════════════════════════════════════════════════════════════
-- SOCIAL V4 — extension réactions / commentaires aux PRESETS
-- ──────────────────────────────────────────────────────────────────────────
-- Étend schema_social_v3.sql en autorisant les posts de type 'preset' dans
-- post_reactions et post_comments (auparavant 'result' uniquement).
--
-- Ajoute :
--   1. Extension des CHECK post_type sur post_reactions / post_comments
--   2. Limite de longueur des commentaires durcie à 500 caractères
--   3. Compteurs dénormalisés sur public.presets (post_like_count, etc.)
--      -- nommés 'post_*' pour ne pas collisionner avec like_count existant
--      qui désigne les favoris (preset_likes).
--   4. Triggers update_post_reaction_counts et update_post_comment_count
--      étendus pour gérer 'preset'
--   5. RPC toggle_post_reaction étendu (vérif owner via presets)
--   6. RPC create_post_comment étendu (vérif owner via presets)
--   7. RPC delete_my_post étendu pour les presets (avec nettoyage assets
--      stocké côté client comme avant pour les covers).
--   8. RPCs get_following_feed et get_user_activity_feed mis à jour pour
--      exposer post_like_count / post_dislike_count / post_comment_count
--      dans le payload preset, et trier par "hot" basé sur ces compteurs.
--
-- À exécuter APRÈS schema_social_v3.sql et schema_feed_v2.sql.
-- ══════════════════════════════════════════════════════════════════════════


-- ─── 1. CHECK post_type étendu + limite body 500 ────────────────────────
ALTER TABLE public.post_reactions
  DROP CONSTRAINT IF EXISTS post_reactions_post_type_check;
ALTER TABLE public.post_reactions
  ADD CONSTRAINT post_reactions_post_type_check
  CHECK (post_type IN ('result', 'preset'));

ALTER TABLE public.post_comments
  DROP CONSTRAINT IF EXISTS post_comments_post_type_check;
ALTER TABLE public.post_comments
  ADD CONSTRAINT post_comments_post_type_check
  CHECK (post_type IN ('result', 'preset'));

-- Limite body : 500 (plus court qu'avant)
ALTER TABLE public.post_comments
  DROP CONSTRAINT IF EXISTS post_comments_body_check;
ALTER TABLE public.post_comments
  ADD CONSTRAINT post_comments_body_check
  CHECK (char_length(body) BETWEEN 1 AND 500);


-- ─── 2. Compteurs sur public.presets ─────────────────────────────────────
ALTER TABLE public.presets
  ADD COLUMN IF NOT EXISTS post_like_count    int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS post_dislike_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS post_comment_count int NOT NULL DEFAULT 0;


-- ─── 3. Trigger réactions étendu ────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_post_reaction_counts()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.post_type = 'result' THEN
      IF NEW.reaction = 'like' THEN
        UPDATE public.game_results SET like_count = like_count + 1 WHERE id = NEW.post_id;
      ELSE
        UPDATE public.game_results SET dislike_count = dislike_count + 1 WHERE id = NEW.post_id;
      END IF;
    ELSIF NEW.post_type = 'preset' THEN
      IF NEW.reaction = 'like' THEN
        UPDATE public.presets SET post_like_count = post_like_count + 1 WHERE id = NEW.post_id;
      ELSE
        UPDATE public.presets SET post_dislike_count = post_dislike_count + 1 WHERE id = NEW.post_id;
      END IF;
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.reaction <> OLD.reaction THEN
      IF NEW.post_type = 'result' THEN
        IF NEW.reaction = 'like' THEN
          UPDATE public.game_results
             SET like_count    = like_count + 1,
                 dislike_count = GREATEST(dislike_count - 1, 0)
           WHERE id = NEW.post_id;
        ELSE
          UPDATE public.game_results
             SET like_count    = GREATEST(like_count - 1, 0),
                 dislike_count = dislike_count + 1
           WHERE id = NEW.post_id;
        END IF;
      ELSIF NEW.post_type = 'preset' THEN
        IF NEW.reaction = 'like' THEN
          UPDATE public.presets
             SET post_like_count    = post_like_count + 1,
                 post_dislike_count = GREATEST(post_dislike_count - 1, 0)
           WHERE id = NEW.post_id;
        ELSE
          UPDATE public.presets
             SET post_like_count    = GREATEST(post_like_count - 1, 0),
                 post_dislike_count = post_dislike_count + 1
           WHERE id = NEW.post_id;
        END IF;
      END IF;
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.post_type = 'result' THEN
      IF OLD.reaction = 'like' THEN
        UPDATE public.game_results SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.post_id;
      ELSE
        UPDATE public.game_results SET dislike_count = GREATEST(dislike_count - 1, 0) WHERE id = OLD.post_id;
      END IF;
    ELSIF OLD.post_type = 'preset' THEN
      IF OLD.reaction = 'like' THEN
        UPDATE public.presets SET post_like_count = GREATEST(post_like_count - 1, 0) WHERE id = OLD.post_id;
      ELSE
        UPDATE public.presets SET post_dislike_count = GREATEST(post_dislike_count - 1, 0) WHERE id = OLD.post_id;
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;


-- ─── 4. Trigger comment_count étendu ────────────────────────────────────
CREATE OR REPLACE FUNCTION update_post_comment_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.post_type = 'result' THEN
      UPDATE public.game_results SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    ELSIF NEW.post_type = 'preset' THEN
      UPDATE public.presets SET post_comment_count = post_comment_count + 1 WHERE id = NEW.post_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.post_type = 'result' THEN
      UPDATE public.game_results SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.post_id;
    ELSIF OLD.post_type = 'preset' THEN
      UPDATE public.presets SET post_comment_count = GREATEST(post_comment_count - 1, 0) WHERE id = OLD.post_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;


-- ─── 5. RPC toggle_post_reaction étendu ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.toggle_post_reaction(
  p_post_type text,
  p_post_id   uuid,
  p_reaction  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  existing text;
  post_author uuid;
  res_like int;
  res_dislike int;
  user_state text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF p_post_type NOT IN ('result', 'preset') THEN
    RAISE EXCEPTION 'invalid_post_type';
  END IF;
  IF p_reaction NOT IN ('like','dislike') THEN
    RAISE EXCEPTION 'invalid_reaction';
  END IF;

  IF p_post_type = 'result' THEN
    SELECT user_id   INTO post_author FROM public.game_results WHERE id = p_post_id;
  ELSE
    SELECT author_id INTO post_author FROM public.presets      WHERE id = p_post_id;
  END IF;
  IF post_author IS NULL THEN
    RAISE EXCEPTION 'post_not_found';
  END IF;

  SELECT reaction INTO existing
    FROM public.post_reactions
   WHERE user_id = uid AND post_type = p_post_type AND post_id = p_post_id;

  IF existing IS NULL THEN
    INSERT INTO public.post_reactions(user_id, post_type, post_id, reaction)
    VALUES (uid, p_post_type, p_post_id, p_reaction);
    user_state := p_reaction;

    IF p_reaction = 'like' AND post_author <> uid THEN
      INSERT INTO public.notifications(user_id, from_user_id, type, payload)
      VALUES (
        post_author,
        uid,
        'post_liked',
        jsonb_build_object('post_type', p_post_type, 'post_id', p_post_id)
      );
    END IF;

  ELSIF existing = p_reaction THEN
    DELETE FROM public.post_reactions
     WHERE user_id = uid AND post_type = p_post_type AND post_id = p_post_id;
    user_state := NULL;

  ELSE
    UPDATE public.post_reactions
       SET reaction = p_reaction, created_at = now()
     WHERE user_id = uid AND post_type = p_post_type AND post_id = p_post_id;
    user_state := p_reaction;
  END IF;

  IF p_post_type = 'result' THEN
    SELECT like_count, dislike_count INTO res_like, res_dislike
      FROM public.game_results WHERE id = p_post_id;
  ELSE
    SELECT post_like_count, post_dislike_count INTO res_like, res_dislike
      FROM public.presets WHERE id = p_post_id;
  END IF;

  RETURN jsonb_build_object(
    'like_count',    COALESCE(res_like, 0),
    'dislike_count', COALESCE(res_dislike, 0),
    'user_reaction', user_state
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_post_reaction(text, uuid, text) TO authenticated;


-- ─── 6. RPC create_post_comment étendu ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_post_comment(
  p_post_type text,
  p_post_id   uuid,
  p_body      text,
  p_parent_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  new_id uuid;
  post_author uuid;
  parent_author uuid;
  parent_post_id uuid;
  parent_post_type text;
  trimmed text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF p_post_type NOT IN ('result', 'preset') THEN
    RAISE EXCEPTION 'invalid_post_type';
  END IF;

  trimmed := btrim(COALESCE(p_body, ''));
  IF char_length(trimmed) = 0 THEN
    RAISE EXCEPTION 'empty_body';
  END IF;
  IF char_length(trimmed) > 500 THEN
    RAISE EXCEPTION 'body_too_long';
  END IF;

  IF p_post_type = 'result' THEN
    SELECT user_id   INTO post_author FROM public.game_results WHERE id = p_post_id;
  ELSE
    SELECT author_id INTO post_author FROM public.presets      WHERE id = p_post_id;
  END IF;
  IF post_author IS NULL THEN
    RAISE EXCEPTION 'post_not_found';
  END IF;

  IF p_parent_id IS NOT NULL THEN
    SELECT author_id, post_id, post_type
      INTO parent_author, parent_post_id, parent_post_type
      FROM public.post_comments WHERE id = p_parent_id;
    IF parent_author IS NULL THEN
      RAISE EXCEPTION 'parent_not_found';
    END IF;
    IF parent_post_id <> p_post_id OR parent_post_type <> p_post_type THEN
      RAISE EXCEPTION 'parent_mismatch';
    END IF;
  END IF;

  INSERT INTO public.post_comments(post_type, post_id, parent_id, author_id, body)
  VALUES (p_post_type, p_post_id, p_parent_id, uid, trimmed)
  RETURNING id INTO new_id;

  IF p_parent_id IS NOT NULL AND parent_author <> uid THEN
    INSERT INTO public.notifications(user_id, from_user_id, type, payload)
    VALUES (
      parent_author,
      uid,
      'comment_replied',
      jsonb_build_object(
        'post_type',  p_post_type,
        'post_id',    p_post_id,
        'comment_id', new_id,
        'parent_id',  p_parent_id
      )
    );
  END IF;

  IF post_author <> uid
     AND (p_parent_id IS NULL OR parent_author <> post_author)
  THEN
    INSERT INTO public.notifications(user_id, from_user_id, type, payload)
    VALUES (
      post_author,
      uid,
      'post_commented',
      jsonb_build_object(
        'post_type',  p_post_type,
        'post_id',    p_post_id,
        'comment_id', new_id
      )
    );
  END IF;

  RETURN jsonb_build_object('id', new_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_post_comment(text, uuid, text, uuid) TO authenticated;


-- ─── 7. RPC delete_my_post étendu (preset) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_my_post(
  p_post_type text,
  p_post_id   uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  owner uuid;
  post_id_text text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF p_post_type NOT IN ('result', 'preset') THEN
    RAISE EXCEPTION 'invalid_post_type';
  END IF;

  IF p_post_type = 'result' THEN
    SELECT user_id   INTO owner FROM public.game_results WHERE id = p_post_id;
  ELSE
    SELECT author_id INTO owner FROM public.presets      WHERE id = p_post_id;
  END IF;
  IF owner IS NULL THEN
    RAISE EXCEPTION 'post_not_found';
  END IF;
  IF owner <> uid THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  post_id_text := p_post_id::text;
  DELETE FROM public.notifications
   WHERE type IN ('post_liked','post_commented','comment_replied','outbid_navi_shared')
     AND payload->>'post_id' = post_id_text;
  DELETE FROM public.notifications
   WHERE type = 'outbid_navi_shared'
     AND payload->>'result_id' = post_id_text;

  -- post_reactions / post_comments / votes : nettoyage manuel (polymorphes)
  DELETE FROM public.post_comment_votes
   WHERE comment_id IN (
     SELECT id FROM public.post_comments
      WHERE post_type = p_post_type AND post_id = p_post_id
   );
  DELETE FROM public.post_comments
   WHERE post_type = p_post_type AND post_id = p_post_id;
  DELETE FROM public.post_reactions
   WHERE post_type = p_post_type AND post_id = p_post_id;

  IF p_post_type = 'result' THEN
    DELETE FROM public.game_results WHERE id = p_post_id;
  ELSE
    -- Pour les presets, on s'appuie sur les FK existantes (preset_likes,
    -- preset_comments, comment_votes, pinned_presets, etc.) qui font
    -- ON DELETE CASCADE depuis schema_social_v2.sql. Les assets storage
    -- (covers, images) ne sont PAS nettoyés ici : c'est laissé au flow
    -- côté client (DeletePresetButton sur la page preset).
    DELETE FROM public.presets WHERE id = p_post_id;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_my_post(text, uuid) TO authenticated;


-- ─── 8. Backfill : recompte initial sur presets existants ───────────────
-- Si tu as déjà des post_reactions/post_comments sur des presets en base
-- (en théorie non, c'est nouveau), on rebuild les compteurs proprement.
-- NB : en Postgres, UPDATE ... FROM ne permet pas de joindre la table cible
-- avec d'autres tables — on passe donc par une sous-requête agrégée unique.
WITH agg AS (
  SELECT
    p.id AS preset_id,
    COALESCE(SUM(CASE WHEN r.reaction = 'like'    THEN 1 ELSE 0 END), 0)::int AS likes,
    COALESCE(SUM(CASE WHEN r.reaction = 'dislike' THEN 1 ELSE 0 END), 0)::int AS dislikes,
    COALESCE((
      SELECT COUNT(*)::int FROM public.post_comments c
       WHERE c.post_type = 'preset' AND c.post_id = p.id
    ), 0) AS comments
  FROM public.presets p
  LEFT JOIN public.post_reactions r
    ON r.post_type = 'preset' AND r.post_id = p.id
  GROUP BY p.id
)
UPDATE public.presets p
   SET post_like_count    = agg.likes,
       post_dislike_count = agg.dislikes,
       post_comment_count = agg.comments
  FROM agg
 WHERE agg.preset_id = p.id;


-- ─── 9. RPC get_following_feed étendu (compteurs preset + tri "hot") ────
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
#variable_conflict use_column
DECLARE
  uid uuid := auth.uid();
  since_at timestamptz := NOW() - INTERVAL '30 days';
BEGIN
  IF uid IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH visible_authors AS (
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
        'id',                 p.id,
        'name',               p.name,
        'description',        p.description,
        'game_type',          p.game_type,
        'cover_url',          p.cover_url,
        'play_count',         p.play_count,
        'like_count',         COALESCE(p.post_like_count, 0),
        'dislike_count',      COALESCE(p.post_dislike_count, 0),
        'comment_count',      COALESCE(p.post_comment_count, 0)
      ) AS payload,
      -- Engagement preset : likes + dislikes + 2*comments + play_count*0.1.
      (
        COALESCE(p.post_like_count,0)
        + COALESCE(p.post_dislike_count,0)
        + 2 * COALESCE(p.post_comment_count,0)
        + COALESCE(p.play_count,0) * 0.1
        + 1
      )::double precision
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
    SELECT * FROM merged m
    WHERE before_at IS NULL OR m.created_at < before_at
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


-- ─── 10. RPC get_user_activity_feed étendu (compteurs preset) ───────────
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
#variable_conflict use_column
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
        'id',            p.id,
        'name',          p.name,
        'description',   p.description,
        'game_type',     p.game_type,
        'cover_url',     p.cover_url,
        'play_count',    p.play_count,
        'like_count',    COALESCE(p.post_like_count, 0),
        'dislike_count', COALESCE(p.post_dislike_count, 0),
        'comment_count', COALESCE(p.post_comment_count, 0)
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
    0.0::double precision
  FROM merged m
  LEFT JOIN public.profiles pr ON pr.id = m.author_id
  WHERE before_at IS NULL OR m.created_at < before_at
  ORDER BY m.created_at DESC
  LIMIT page_size;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_activity_feed(uuid, timestamptz, int) TO authenticated, anon;
