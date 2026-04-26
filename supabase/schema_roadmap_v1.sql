-- ══════════════════════════════════════════════════════════════════════════
-- ROADMAP V1 — votes "Avenir" + tickets utilisateur
-- ──────────────────────────────────────────────────────────────────────────
-- Cette section drive la card "Avenir" sur la landing page, où les
-- utilisateurs upvotent des jeux ou fonctionnalités à venir, et peuvent
-- soumettre des tickets (bug / idée / autre).
--
-- Choix de design :
--   - Les ITEMS de roadmap sont définis statiquement dans le code (slug,
--     icône, i18n) plutôt qu'en base. Ça évite une table d'admin / un CMS,
--     et permet de modifier le label / supprimer un item simplement par
--     déploiement. Seuls les VOTES sont en base, indexés par slug texte.
--   - Les TICKETS utilisateurs sont privés (visible auteur uniquement, +
--     admin via le service_role hors RLS). On garde un schéma simple
--     bug/idea/other + un statut côté admin pour le triage.
-- ══════════════════════════════════════════════════════════════════════════


-- ─── 1. Votes roadmap ────────────────────────────────────────────────────
-- Polymorphe via slug texte. Exemples : 'game.myteam', 'feature.voice'.
-- Pas de FK vers une table de référence : on accepte que le code soit la
-- source de vérité des slugs valides. Côté front on filtre les votes
-- orphelins. RPC get_roadmap_state filtre sur la liste des slugs valides
-- passée en paramètre, donc aucun risque de polluer l'UI.
CREATE TABLE IF NOT EXISTS public.roadmap_votes (
  slug       text NOT NULL CHECK (char_length(slug) BETWEEN 3 AND 80),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (slug, user_id)
);

ALTER TABLE public.roadmap_votes ENABLE ROW LEVEL SECURITY;

-- Drop pour rester idempotent (re-runs du script). PostgreSQL n'a pas de
-- "CREATE POLICY IF NOT EXISTS".
DROP POLICY IF EXISTS "Roadmap votes visibles par tous" ON public.roadmap_votes;
DROP POLICY IF EXISTS "Roadmap voter si connecté"      ON public.roadmap_votes;
DROP POLICY IF EXISTS "Roadmap retirer son vote"       ON public.roadmap_votes;

CREATE POLICY "Roadmap votes visibles par tous" ON public.roadmap_votes
  FOR SELECT USING (true);
CREATE POLICY "Roadmap voter si connecté" ON public.roadmap_votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Roadmap retirer son vote" ON public.roadmap_votes
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS roadmap_votes_slug_idx
  ON public.roadmap_votes(slug);


-- ─── 2. Tickets support ──────────────────────────────────────────────────
-- attachments : tableau de chemins relatifs dans le bucket privé
-- 'ticket-attachments'. L'admin génère des signed URLs pour les visualiser.
-- Limite 5 pièces jointes par ticket pour borner le stockage.
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  type        text NOT NULL CHECK (type IN ('bug', 'idea', 'other')),
  title       text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  body        text NOT NULL CHECK (char_length(body) BETWEEN 10 AND 2000),
  attachments text[] NOT NULL DEFAULT '{}'
                  CHECK (cardinality(attachments) <= 5),
  status      text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','planned','in_progress','done','closed')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Si la table existait déjà sans la colonne (déploiement v1 précédent),
-- on l'ajoute en migration safe.
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS attachments text[] NOT NULL DEFAULT '{}';

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Voir ses propres tickets"     ON public.support_tickets;
DROP POLICY IF EXISTS "Créer un ticket si connecté" ON public.support_tickets;

-- Tickets : privés à l'auteur. L'admin lit via service_role (hors RLS).
CREATE POLICY "Voir ses propres tickets" ON public.support_tickets
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Créer un ticket si connecté" ON public.support_tickets
  FOR INSERT WITH CHECK (auth.uid() = user_id);
-- Pas de UPDATE / DELETE côté user : un ticket est immuable une fois soumis.

CREATE INDEX IF NOT EXISTS support_tickets_user_idx
  ON public.support_tickets(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx
  ON public.support_tickets(status, created_at DESC);


-- ─── 3. RPC : get_roadmap_state ──────────────────────────────────────────
-- Pour une liste de slugs donnée (issue du registry front), retourne pour
-- chacun :
--   - vote_count : nombre de votes total
--   - voted      : true si l'utilisateur courant a voté
-- Ainsi un seul aller-retour réseau, et le tri est fait côté client.
CREATE OR REPLACE FUNCTION public.get_roadmap_state(p_slugs text[])
RETURNS TABLE (
  slug       text,
  vote_count int,
  voted      boolean
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
    s                                                    AS slug,
    COALESCE((
      SELECT COUNT(*)::int FROM public.roadmap_votes v
       WHERE v.slug = s
    ), 0)                                                AS vote_count,
    EXISTS (
      SELECT 1 FROM public.roadmap_votes v
       WHERE v.slug = s AND v.user_id = uid
    )                                                    AS voted
  FROM unnest(p_slugs) AS s;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_roadmap_state(text[]) TO authenticated, anon;


-- ─── 4. RPC : toggle_roadmap_vote ────────────────────────────────────────
-- Idempotent : ajoute le vote s'il n'existe pas, le retire sinon.
-- Retourne le nouveau count + l'état de vote courant.
CREATE OR REPLACE FUNCTION public.toggle_roadmap_vote(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  has_voted boolean;
  new_count int;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF char_length(p_slug) NOT BETWEEN 3 AND 80 THEN
    RAISE EXCEPTION 'invalid_slug';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.roadmap_votes
     WHERE slug = p_slug AND user_id = uid
  ) INTO has_voted;

  IF has_voted THEN
    DELETE FROM public.roadmap_votes
     WHERE slug = p_slug AND user_id = uid;
    has_voted := false;
  ELSE
    INSERT INTO public.roadmap_votes(slug, user_id)
    VALUES (p_slug, uid);
    has_voted := true;
  END IF;

  SELECT COUNT(*)::int INTO new_count
    FROM public.roadmap_votes
   WHERE slug = p_slug;

  RETURN jsonb_build_object(
    'slug',       p_slug,
    'vote_count', new_count,
    'voted',      has_voted
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_roadmap_vote(text) TO authenticated;


-- ─── 5. RPC : create_ticket ──────────────────────────────────────────────
-- Validation centralisée + retour de l'id créé.
-- p_attachments : tableau de chemins relatifs dans le bucket privé
-- 'ticket-attachments' (les fichiers ont été uploadés en amont par le
-- client). On vérifie juste la cardinalité, le contenu/MIME est validé par
-- les policies du bucket.
DROP FUNCTION IF EXISTS public.create_ticket(text, text, text);

CREATE OR REPLACE FUNCTION public.create_ticket(
  p_type        text,
  p_title       text,
  p_body        text,
  p_attachments text[] DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  new_id uuid;
  trimmed_title text;
  trimmed_body text;
  cleaned_attachments text[];
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  IF p_type NOT IN ('bug','idea','other') THEN
    RAISE EXCEPTION 'invalid_type';
  END IF;
  trimmed_title := btrim(COALESCE(p_title, ''));
  trimmed_body  := btrim(COALESCE(p_body, ''));
  IF char_length(trimmed_title) NOT BETWEEN 3 AND 120 THEN
    RAISE EXCEPTION 'invalid_title';
  END IF;
  IF char_length(trimmed_body) NOT BETWEEN 10 AND 2000 THEN
    RAISE EXCEPTION 'invalid_body';
  END IF;

  cleaned_attachments := COALESCE(p_attachments, '{}');
  IF cardinality(cleaned_attachments) > 5 THEN
    RAISE EXCEPTION 'too_many_attachments';
  END IF;

  INSERT INTO public.support_tickets(user_id, type, title, body, attachments)
  VALUES (uid, p_type, trimmed_title, trimmed_body, cleaned_attachments)
  RETURNING id INTO new_id;

  RETURN jsonb_build_object('ok', true, 'id', new_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_ticket(text, text, text, text[]) TO authenticated;


-- ─── 6. Storage bucket : ticket-attachments ──────────────────────────────
-- Bucket privé pour les screenshots de tickets. Les fichiers sont rangés
-- sous `<user_id>/<ticket_uuid_or_temp>/<filename>.webp`.
-- Le client compresse les images en WebP (≤ 0.5 MB) avant upload, donc
-- pas de limite de taille extrême ici.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ticket-attachments',
  'ticket-attachments',
  false,
  1048576, -- 1 MB hard cap (largement assez après compression WebP)
  ARRAY['image/webp', 'image/jpeg', 'image/png', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Policies : un user peut uploader / lire / supprimer SES propres fichiers.
-- L'admin (service_role) bypass RLS automatiquement pour la modération.
DROP POLICY IF EXISTS "ticket-attachments insert own"   ON storage.objects;
DROP POLICY IF EXISTS "ticket-attachments select own"   ON storage.objects;
DROP POLICY IF EXISTS "ticket-attachments delete own"   ON storage.objects;

CREATE POLICY "ticket-attachments insert own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ticket-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "ticket-attachments select own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'ticket-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "ticket-attachments delete own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'ticket-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
