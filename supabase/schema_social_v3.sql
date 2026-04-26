-- ══════════════════════════════════════════════════════════════════════════
-- SOCIAL V3 — réactions, commentaires & threads sur publications du feed
-- ──────────────────────────────────────────────────────────────────────────
-- Étend le schéma social v2 avec :
--   1. Réactions (👍/👎) sur les "publications" du feed (preset OR result)
--   2. Commentaires sur publications, avec réponses (1 niveau de threading)
--   3. Votes (👍/👎) sur les commentaires (en plus des votes preset_comments
--      existants, qui restent inchangés pour la compat des presets)
--   4. Compteurs dénormalisés (like_count, dislike_count, comment_count)
--      sur game_results pour le tri "hot" du feed.
--   5. Extension de la table notifications pour les nouveaux événements.
--
-- À exécuter dans Supabase Dashboard → SQL Editor APRÈS schema_social_v2.sql
-- (et schema_navi.sql qui apporte la colonne `payload` sur notifications).
-- ══════════════════════════════════════════════════════════════════════════


-- ─── 1. Réactions sur posts (presets ou résultats) ────────────────────────
-- Choix : table polymorphe (post_type, post_id) plutôt que deux tables
-- distinctes (preset_likes existe déjà pour les presets, on conserve ; on
-- crée ici post_reactions UNIQUEMENT pour les résultats partagés).
-- Si on voulait unifier presets + results plus tard, il suffirait d'ajouter
-- les rows preset dans post_reactions et de retirer preset_likes.
CREATE TABLE IF NOT EXISTS public.post_reactions (
  user_id    uuid    NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_type  text    NOT NULL CHECK (post_type IN ('result')),
  post_id    uuid    NOT NULL,
  reaction   text    NOT NULL CHECK (reaction IN ('like', 'dislike')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_type, post_id)
);

ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Réactions visibles par tous" ON public.post_reactions
  FOR SELECT USING (true);

CREATE POLICY "Réagir si connecté" ON public.post_reactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Changer sa réaction" ON public.post_reactions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Retirer sa réaction" ON public.post_reactions
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS post_reactions_post_idx
  ON public.post_reactions(post_type, post_id);


-- ─── 2. Compteurs dénormalisés sur game_results ───────────────────────────
ALTER TABLE public.game_results
  ADD COLUMN IF NOT EXISTS like_count    int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dislike_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comment_count int NOT NULL DEFAULT 0;

-- Fonction mise à jour des compteurs réactions sur game_results.
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
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Changement de réaction (like ⇄ dislike) sur la même clé.
    IF NEW.post_type = 'result' AND NEW.reaction <> OLD.reaction THEN
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
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.post_type = 'result' THEN
      IF OLD.reaction = 'like' THEN
        UPDATE public.game_results SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.post_id;
      ELSE
        UPDATE public.game_results SET dislike_count = GREATEST(dislike_count - 1, 0) WHERE id = OLD.post_id;
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_reaction_counts ON public.post_reactions;
CREATE TRIGGER trg_post_reaction_counts
  AFTER INSERT OR UPDATE OR DELETE ON public.post_reactions
  FOR EACH ROW EXECUTE FUNCTION update_post_reaction_counts();


-- ─── 3. Commentaires sur publications (threading 1 niveau) ────────────────
-- post_comments est polymorphe (post_type, post_id) et peut référencer un
-- parent_id pour les réponses. On limite à 1 niveau côté UI mais le schéma
-- supporte plus si besoin futur (pas de récursivité côté DB).
CREATE TABLE IF NOT EXISTS public.post_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_type  text NOT NULL CHECK (post_type IN ('result')),
  post_id    uuid NOT NULL,
  parent_id  uuid REFERENCES public.post_comments(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body       text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  score      int  NOT NULL DEFAULT 0, -- upvotes − downvotes (dénormalisé)
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Commentaires visibles par tous" ON public.post_comments
  FOR SELECT USING (true);

CREATE POLICY "Commenter si connecté" ON public.post_comments
  FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Supprimer son propre commentaire" ON public.post_comments
  FOR DELETE USING (auth.uid() = author_id);

CREATE INDEX IF NOT EXISTS post_comments_post_idx
  ON public.post_comments(post_type, post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS post_comments_parent_idx
  ON public.post_comments(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS post_comments_author_idx
  ON public.post_comments(author_id);


-- Fonction mise à jour du compteur comment_count (game_results uniquement).
-- Ne compte que les commentaires racines + réponses confondus (cohérent avec
-- l'engagement global affiché sur la publication).
CREATE OR REPLACE FUNCTION update_post_comment_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.post_type = 'result' THEN
      UPDATE public.game_results SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.post_type = 'result' THEN
      UPDATE public.game_results SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.post_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_comment_count ON public.post_comments;
CREATE TRIGGER trg_post_comment_count
  AFTER INSERT OR DELETE ON public.post_comments
  FOR EACH ROW EXECUTE FUNCTION update_post_comment_count();


-- ─── 4. Votes sur les commentaires de posts ──────────────────────────────
-- Distinct de comment_votes (qui cible preset_comments) car FK différentes.
CREATE TABLE IF NOT EXISTS public.post_comment_votes (
  comment_id uuid NOT NULL REFERENCES public.post_comments(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vote       smallint NOT NULL CHECK (vote IN (-1, 1)),
  PRIMARY KEY (comment_id, user_id)
);

ALTER TABLE public.post_comment_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Votes commentaires visibles par tous" ON public.post_comment_votes
  FOR SELECT USING (true);
CREATE POLICY "Voter sur commentaire si connecté" ON public.post_comment_votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Changer son vote sur commentaire" ON public.post_comment_votes
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Retirer son vote sur commentaire" ON public.post_comment_votes
  FOR DELETE USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION update_post_comment_score()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.post_comments SET score = score + NEW.vote WHERE id = NEW.comment_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.post_comments SET score = score - OLD.vote WHERE id = OLD.comment_id;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.post_comments SET score = score + (NEW.vote - OLD.vote) WHERE id = NEW.comment_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_post_comment_score ON public.post_comment_votes;
CREATE TRIGGER trg_post_comment_score
  AFTER INSERT OR UPDATE OR DELETE ON public.post_comment_votes
  FOR EACH ROW EXECUTE FUNCTION update_post_comment_score();


-- ─── 5. Notifications : nouveaux types ────────────────────────────────────
-- On étend la contrainte CHECK existante (définie dans schema_social.sql et
-- enrichie dans schema_navi.sql avec outbid_navi_shared).
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'friend_request',
    'friend_accepted',
    'new_referral',
    'subscription_started',
    'outbid_navi_shared',
    'post_liked',
    'post_commented',
    'comment_replied'
  ));


-- ─── 6. RPC : toggle_post_reaction ────────────────────────────────────────
-- Logique idempotente : si l'utilisateur a déjà cliqué la même réaction →
-- on la retire. S'il avait l'autre → on bascule. Sinon on insère.
-- Crée également une notification "post_liked" pour l'auteur du post (si
-- like, et pas auto-réaction).
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
  result_author uuid;
  res_like int;
  res_dislike int;
  user_state text; -- 'like' | 'dislike' | null
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF p_post_type <> 'result' THEN
    RAISE EXCEPTION 'invalid_post_type';
  END IF;
  IF p_reaction NOT IN ('like','dislike') THEN
    RAISE EXCEPTION 'invalid_reaction';
  END IF;

  -- Auteur du post (pour notif). Peut être null si post supprimé entre-temps.
  SELECT user_id INTO result_author FROM public.game_results WHERE id = p_post_id;
  IF result_author IS NULL THEN
    RAISE EXCEPTION 'post_not_found';
  END IF;

  -- Réaction existante de cet utilisateur sur ce post ?
  SELECT reaction INTO existing
    FROM public.post_reactions
   WHERE user_id = uid AND post_type = p_post_type AND post_id = p_post_id;

  IF existing IS NULL THEN
    INSERT INTO public.post_reactions(user_id, post_type, post_id, reaction)
    VALUES (uid, p_post_type, p_post_id, p_reaction);
    user_state := p_reaction;

    -- Notifier l'auteur uniquement pour les LIKES (pas les dislikes).
    IF p_reaction = 'like' AND result_author <> uid THEN
      INSERT INTO public.notifications(user_id, from_user_id, type, payload)
      VALUES (
        result_author,
        uid,
        'post_liked',
        jsonb_build_object('post_type', p_post_type, 'post_id', p_post_id)
      );
    END IF;

  ELSIF existing = p_reaction THEN
    -- Re-clic = retrait
    DELETE FROM public.post_reactions
     WHERE user_id = uid AND post_type = p_post_type AND post_id = p_post_id;
    user_state := NULL;

  ELSE
    -- Bascule like ⇄ dislike
    UPDATE public.post_reactions
       SET reaction = p_reaction, created_at = now()
     WHERE user_id = uid AND post_type = p_post_type AND post_id = p_post_id;
    user_state := p_reaction;
  END IF;

  -- Compteurs frais
  SELECT like_count, dislike_count INTO res_like, res_dislike
    FROM public.game_results WHERE id = p_post_id;

  RETURN jsonb_build_object(
    'like_count',    COALESCE(res_like, 0),
    'dislike_count', COALESCE(res_dislike, 0),
    'user_reaction', user_state
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_post_reaction(text, uuid, text) TO authenticated;


-- ─── 7. RPC : create_post_comment ─────────────────────────────────────────
-- Crée un commentaire (root ou réponse) et notifie :
--   - l'auteur du post  (si commentaire root et pas auto-commentaire)
--   - l'auteur du commentaire parent (si réponse et pas auto-réponse)
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
  IF p_post_type <> 'result' THEN
    RAISE EXCEPTION 'invalid_post_type';
  END IF;

  trimmed := btrim(COALESCE(p_body, ''));
  IF char_length(trimmed) = 0 THEN
    RAISE EXCEPTION 'empty_body';
  END IF;
  IF char_length(trimmed) > 1000 THEN
    RAISE EXCEPTION 'body_too_long';
  END IF;

  SELECT user_id INTO post_author FROM public.game_results WHERE id = p_post_id;
  IF post_author IS NULL THEN
    RAISE EXCEPTION 'post_not_found';
  END IF;

  -- Si réponse, vérifier que le parent appartient au même post.
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

  -- Notif réponse (priorité sur la notif post si auteur post == auteur parent
  -- on n'envoie qu'une seule notif "comment_replied").
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

  -- Notif post commenté (commentaire racine OU réponse, mais on évite la
  -- double-notif si parent_author == post_author == cible déjà notifiée).
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


-- ─── 8. RPC : toggle_post_comment_vote ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.toggle_post_comment_vote(
  p_comment_id uuid,
  p_vote       smallint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  existing smallint;
  new_score int;
  user_state smallint;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF p_vote NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'invalid_vote';
  END IF;

  SELECT vote INTO existing
    FROM public.post_comment_votes
   WHERE comment_id = p_comment_id AND user_id = uid;

  IF existing IS NULL THEN
    INSERT INTO public.post_comment_votes(comment_id, user_id, vote)
    VALUES (p_comment_id, uid, p_vote);
    user_state := p_vote;
  ELSIF existing = p_vote THEN
    DELETE FROM public.post_comment_votes
     WHERE comment_id = p_comment_id AND user_id = uid;
    user_state := NULL;
  ELSE
    UPDATE public.post_comment_votes SET vote = p_vote
     WHERE comment_id = p_comment_id AND user_id = uid;
    user_state := p_vote;
  END IF;

  SELECT score INTO new_score FROM public.post_comments WHERE id = p_comment_id;

  RETURN jsonb_build_object(
    'score',     COALESCE(new_score, 0),
    'user_vote', user_state
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_post_comment_vote(uuid, smallint) TO authenticated;


-- ─── 9. RPC : get_post_comments ───────────────────────────────────────────
-- Retourne tous les commentaires d'un post (root + replies) avec auteur,
-- score et vote courant de l'utilisateur. Le client reconstruit l'arbre
-- à partir de parent_id.
CREATE OR REPLACE FUNCTION public.get_post_comments(
  p_post_type text,
  p_post_id   uuid
)
RETURNS TABLE (
  id                          uuid,
  parent_id                   uuid,
  body                        text,
  score                       int,
  created_at                  timestamptz,
  author_id                   uuid,
  author_username             text,
  author_avatar_url           text,
  author_subscription_status  text,
  user_vote                   smallint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.parent_id,
    c.body,
    c.score,
    c.created_at,
    c.author_id,
    pr.username,
    pr.avatar_url,
    COALESCE(pr.subscription_status, 'free'),
    v.vote
  FROM public.post_comments c
  LEFT JOIN public.profiles pr ON pr.id = c.author_id
  LEFT JOIN public.post_comment_votes v
    ON v.comment_id = c.id AND v.user_id = uid
  WHERE c.post_type = p_post_type AND c.post_id = p_post_id
  ORDER BY
    -- Roots avant replies, puis tri par engagement.
    CASE WHEN c.parent_id IS NULL THEN 0 ELSE 1 END ASC,
    c.score DESC,
    c.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_post_comments(text, uuid) TO authenticated, anon;


-- ─── 10. RPC : delete_my_post ─────────────────────────────────────────────
-- Suppression définitive d'un de ses propres game_results (cascade vers
-- post_reactions / post_comments / notifications associées).
-- Les notifications associées (jointes via payload->>'post_id') ne sont pas
-- liées par FK : on les nettoie explicitement.
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
  IF p_post_type <> 'result' THEN
    RAISE EXCEPTION 'invalid_post_type';
  END IF;

  SELECT user_id INTO owner FROM public.game_results WHERE id = p_post_id;
  IF owner IS NULL THEN
    RAISE EXCEPTION 'post_not_found';
  END IF;
  IF owner <> uid THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Nettoie les notifs liées à ce post (par payload).
  post_id_text := p_post_id::text;
  DELETE FROM public.notifications
   WHERE type IN ('post_liked','post_commented','comment_replied','outbid_navi_shared')
     AND payload->>'post_id' = post_id_text;
  -- outbid notifie via 'result_id' dans certains cas → on tente aussi.
  DELETE FROM public.notifications
   WHERE type = 'outbid_navi_shared'
     AND payload->>'result_id' = post_id_text;

  -- Réactions et commentaires sont supprimés par CASCADE via FK ?  Non :
  -- post_reactions / post_comments référencent post_id sans FK car
  -- polymorphe. On nettoie manuellement.
  DELETE FROM public.post_comment_votes
   WHERE comment_id IN (
     SELECT id FROM public.post_comments
      WHERE post_type = p_post_type AND post_id = p_post_id
   );
  DELETE FROM public.post_comments
   WHERE post_type = p_post_type AND post_id = p_post_id;
  DELETE FROM public.post_reactions
   WHERE post_type = p_post_type AND post_id = p_post_id;

  -- Suppression du post lui-même.
  DELETE FROM public.game_results WHERE id = p_post_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_my_post(text, uuid) TO authenticated;
