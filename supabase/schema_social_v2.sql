-- ══════════════════════════════════════════════════════════════
-- SOCIAL V2 — follows, comments, votes, game_results, is_private
-- À exécuter dans Supabase Dashboard → SQL Editor
-- ══════════════════════════════════════════════════════════════

-- ── 1. Follows (abonnements) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.follows (
  follower_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CONSTRAINT no_self_follow CHECK (follower_id <> following_id)
);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Follows visibles par tous" ON public.follows
  FOR SELECT USING (true);

CREATE POLICY "Suivre quelqu'un si connecté" ON public.follows
  FOR INSERT WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Se désabonner de soi-même" ON public.follows
  FOR DELETE USING (auth.uid() = follower_id);

-- Index pour les requêtes feed (follows de X) et compteurs
CREATE INDEX IF NOT EXISTS follows_follower_idx  ON public.follows(follower_id);
CREATE INDEX IF NOT EXISTS follows_following_idx ON public.follows(following_id);

-- ── 2. Compteurs dénormalisés sur profiles ──────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS followers_count  int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS following_count  int NOT NULL DEFAULT 0;

-- Fonction de mise à jour automatique des compteurs
CREATE OR REPLACE FUNCTION update_follow_counts()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles SET following_count = following_count + 1 WHERE id = NEW.follower_id;
    UPDATE public.profiles SET followers_count = followers_count + 1 WHERE id = NEW.following_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles SET following_count = GREATEST(following_count - 1, 0) WHERE id = OLD.follower_id;
    UPDATE public.profiles SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = OLD.following_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_follow_counts ON public.follows;
CREATE TRIGGER trg_follow_counts
  AFTER INSERT OR DELETE ON public.follows
  FOR EACH ROW EXECUTE FUNCTION update_follow_counts();

-- ── 3. Commentaires sur presets ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.preset_comments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  preset_id  uuid NOT NULL REFERENCES public.presets(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content    text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 300),
  score      int NOT NULL DEFAULT 0,  -- upvotes - downvotes (dénormalisé)
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.preset_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Commentaires visibles par tous" ON public.preset_comments
  FOR SELECT USING (true);

CREATE POLICY "Commenter si connecté" ON public.preset_comments
  FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Supprimer son propre commentaire" ON public.preset_comments
  FOR DELETE USING (auth.uid() = author_id);

CREATE INDEX IF NOT EXISTS preset_comments_preset_idx ON public.preset_comments(preset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS preset_comments_author_idx ON public.preset_comments(author_id);

-- ── 4. Votes sur les commentaires ───────────────────────────
CREATE TABLE IF NOT EXISTS public.comment_votes (
  comment_id uuid NOT NULL REFERENCES public.preset_comments(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vote       smallint NOT NULL CHECK (vote IN (-1, 1)),  -- +1 upvote, -1 downvote
  PRIMARY KEY (comment_id, user_id)
);

ALTER TABLE public.comment_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Votes visibles par tous" ON public.comment_votes
  FOR SELECT USING (true);

CREATE POLICY "Voter si connecté" ON public.comment_votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Changer son vote" ON public.comment_votes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Retirer son vote" ON public.comment_votes
  FOR DELETE USING (auth.uid() = user_id);

-- Fonction de mise à jour du score dénormalisé
CREATE OR REPLACE FUNCTION update_comment_score()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.preset_comments SET score = score + NEW.vote WHERE id = NEW.comment_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.preset_comments SET score = score - OLD.vote WHERE id = OLD.comment_id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Changement de vote (+1 → -1 = -2, ou -1 → +1 = +2)
    UPDATE public.preset_comments SET score = score + (NEW.vote - OLD.vote) WHERE id = NEW.comment_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_comment_score ON public.comment_votes;
CREATE TRIGGER trg_comment_score
  AFTER INSERT OR UPDATE OR DELETE ON public.comment_votes
  FOR EACH ROW EXECUTE FUNCTION update_comment_score();

-- ── 5. Résultats de partie partageables ─────────────────────
CREATE TABLE IF NOT EXISTS public.game_results (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  game_type    text NOT NULL,                          -- 'ghostword' | 'dyp'
  preset_id    uuid REFERENCES public.presets(id) ON DELETE SET NULL,
  preset_name  text,                                   -- copie du nom au moment de la partie
  result_data  jsonb NOT NULL DEFAULT '{}',            -- données spécifiques au jeu
  is_shared    boolean NOT NULL DEFAULT false,         -- affiché sur le profil public
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.game_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Résultats publics visibles" ON public.game_results
  FOR SELECT USING (is_shared = true OR auth.uid() = user_id);

CREATE POLICY "Sauvegarder son propre résultat" ON public.game_results
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Modifier son propre résultat" ON public.game_results
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Supprimer son propre résultat" ON public.game_results
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS game_results_user_idx   ON public.game_results(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS game_results_shared_idx ON public.game_results(is_shared, created_at DESC) WHERE is_shared = true;

-- ── 6. Partie privée / publique sur game_rooms ──────────────
ALTER TABLE public.game_rooms
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT true;

-- Les parties publiques sont visibles dans l'Explorer du feed
CREATE INDEX IF NOT EXISTS game_rooms_public_idx ON public.game_rooms(is_private, created_at DESC)
  WHERE is_private = false;
