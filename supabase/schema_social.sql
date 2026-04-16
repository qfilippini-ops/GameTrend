-- =================================================================
-- SYSTÈME SOCIAL : amis, notifications, activités, présence
-- À exécuter dans Supabase SQL Editor
-- =================================================================

-- ── 1. Colonne last_seen_at sur profiles ─────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- ── 2. TABLE friendships ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.friendships (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT no_self_friendship CHECK (requester_id != addressee_id)
);

-- Fonction IMMUTABLE pour normaliser la paire (A,B) = (B,A)
-- Nécessaire pour les index d'expression PostgreSQL
CREATE OR REPLACE FUNCTION public.friendship_canonical_key(a UUID, b UUID)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN a::text < b::text
    THEN a::text || '|' || b::text
    ELSE b::text || '|' || a::text
  END;
$$;

-- Index unique sur la paire non ordonnée (évite les doublons A↔B et B↔A)
CREATE UNIQUE INDEX IF NOT EXISTS friendships_pair_unique
  ON public.friendships (friendship_canonical_key(requester_id, addressee_id));

CREATE INDEX IF NOT EXISTS friendships_requester_idx ON public.friendships(requester_id);
CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON public.friendships(addressee_id);
CREATE INDEX IF NOT EXISTS friendships_status_idx    ON public.friendships(status);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

-- Les deux partis peuvent voir leur lien d'amitié
DROP POLICY IF EXISTS "Membres voient leurs amitiés" ON public.friendships;
CREATE POLICY "Membres voient leurs amitiés" ON public.friendships
  FOR SELECT USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- Les demandes/acceptations/blocages passent par les RPCs SECURITY DEFINER
-- On expose juste un DELETE self-service pour le "supprimer un ami"
DROP POLICY IF EXISTS "Membre supprime son amitié" ON public.friendships;
CREATE POLICY "Membre supprime son amitié" ON public.friendships
  FOR DELETE USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- ── 3. TABLE notifications ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('friend_request', 'friend_accepted')),
  from_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx    ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_unread_idx  ON public.notifications(user_id) WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Utilisateur voit ses notifications" ON public.notifications;
CREATE POLICY "Utilisateur voit ses notifications" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Utilisateur marque lu" ON public.notifications;
CREATE POLICY "Utilisateur marque lu" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- ── 4. TRIGGER notifications sur friendships ──────────────────────
CREATE OR REPLACE FUNCTION public.notify_friendship_fn()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    -- Notifier le destinataire d'une nouvelle demande
    INSERT INTO public.notifications(user_id, type, from_user_id)
    VALUES (NEW.addressee_id, 'friend_request', NEW.requester_id);

  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    -- Notifier le demandeur que sa demande a été acceptée
    INSERT INTO public.notifications(user_id, type, from_user_id)
    VALUES (NEW.requester_id, 'friend_accepted', NEW.addressee_id);
    -- Supprimer la notification de demande en attente côté destinataire
    DELETE FROM public.notifications
    WHERE user_id = NEW.addressee_id
      AND from_user_id = NEW.requester_id
      AND type = 'friend_request';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_friendship ON public.friendships;
CREATE TRIGGER trg_notify_friendship
  AFTER INSERT OR UPDATE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.notify_friendship_fn();

-- ── 5. RPC : send_friend_request ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.send_friend_request(target_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  my_count    INT;
  target_count INT;
  existing    public.friendships%ROWTYPE;
BEGIN
  IF target_id = auth.uid() THEN
    RETURN json_build_object('error', 'Vous ne pouvez pas vous ajouter vous-même');
  END IF;

  -- Vérifier si une amitié existe déjà (dans les deux sens)
  SELECT * INTO existing FROM public.friendships
  WHERE (requester_id = auth.uid() AND addressee_id = target_id)
     OR (requester_id = target_id   AND addressee_id = auth.uid());

  IF FOUND THEN
    IF existing.status = 'blocked' THEN
      RETURN json_build_object('error', 'Impossible d''envoyer une demande');
    ELSIF existing.status = 'pending' THEN
      RETURN json_build_object('error', 'Demande déjà envoyée');
    ELSE
      RETURN json_build_object('error', 'Vous êtes déjà amis');
    END IF;
  END IF;

  -- Vérifier le cap de 10 amis (acceptés) pour les deux partis
  SELECT COUNT(*) INTO my_count FROM public.friendships
  WHERE (requester_id = auth.uid() OR addressee_id = auth.uid()) AND status = 'accepted';

  IF my_count >= 10 THEN
    RETURN json_build_object('error', 'Tu as atteint la limite de 10 amis');
  END IF;

  SELECT COUNT(*) INTO target_count FROM public.friendships
  WHERE (requester_id = target_id OR addressee_id = target_id) AND status = 'accepted';

  IF target_count >= 10 THEN
    RETURN json_build_object('error', 'Ce joueur a atteint sa limite d''amis');
  END IF;

  INSERT INTO public.friendships(requester_id, addressee_id, status)
  VALUES (auth.uid(), target_id, 'pending');

  RETURN json_build_object('success', true);
END;
$$;

-- ── 6. RPC : respond_to_friend_request ───────────────────────────
CREATE OR REPLACE FUNCTION public.respond_to_friend_request(
  p_friendship_id UUID,
  p_response      TEXT  -- 'accept' | 'decline'
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  f          public.friendships%ROWTYPE;
  my_count   INT;
BEGIN
  SELECT * INTO f FROM public.friendships WHERE id = p_friendship_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Demande introuvable');
  END IF;

  IF f.addressee_id != auth.uid() THEN
    RETURN json_build_object('error', 'Non autorisé');
  END IF;

  IF f.status != 'pending' THEN
    RETURN json_build_object('error', 'Cette demande n''est plus en attente');
  END IF;

  IF p_response = 'accept' THEN
    SELECT COUNT(*) INTO my_count FROM public.friendships
    WHERE (requester_id = auth.uid() OR addressee_id = auth.uid()) AND status = 'accepted';

    IF my_count >= 10 THEN
      RETURN json_build_object('error', 'Tu as atteint ta limite de 10 amis');
    END IF;

    UPDATE public.friendships
    SET status = 'accepted', updated_at = now()
    WHERE id = p_friendship_id;

  ELSIF p_response = 'decline' THEN
    DELETE FROM public.friendships WHERE id = p_friendship_id;
  ELSE
    RETURN json_build_object('error', 'Réponse invalide');
  END IF;

  RETURN json_build_object('success', true);
END;
$$;

-- ── 7. RPC : get_friendship_status ────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_friendship_status(target_id UUID)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  f public.friendships%ROWTYPE;
BEGIN
  SELECT * INTO f FROM public.friendships
  WHERE (requester_id = auth.uid() AND addressee_id = target_id)
     OR (requester_id = target_id   AND addressee_id = auth.uid());

  IF NOT FOUND THEN
    RETURN json_build_object('status', 'none');
  END IF;

  RETURN json_build_object(
    'id',           f.id,
    'status',       f.status,
    'is_requester', f.requester_id = auth.uid()
  );
END;
$$;

-- ── 8. RPC : get_friend_activities ───────────────────────────────
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
     p.last_seen_at > NOW() - INTERVAL '2 minutes')          AS is_online,
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
    (p.last_seen_at IS NOT NULL AND p.last_seen_at > NOW() - INTERVAL '2 minutes') DESC,
    active_room.room_id IS NOT NULL DESC,
    p.username ASC;
END;
$$;

-- ── 9. RPC : get_mutual_friends_count ────────────────────────────
CREATE OR REPLACE FUNCTION public.get_mutual_friends_count(target_id UUID)
RETURNS INTEGER LANGUAGE sql SECURITY DEFINER AS $$
  SELECT COUNT(*)::INTEGER
  FROM (
    SELECT CASE WHEN f1.requester_id = auth.uid() THEN f1.addressee_id ELSE f1.requester_id END AS fid
    FROM public.friendships f1
    WHERE (f1.requester_id = auth.uid() OR f1.addressee_id = auth.uid())
      AND f1.status = 'accepted'
  ) my_friends
  WHERE my_friends.fid IN (
    SELECT CASE WHEN f2.requester_id = target_id THEN f2.addressee_id ELSE f2.requester_id END
    FROM public.friendships f2
    WHERE (f2.requester_id = target_id OR f2.addressee_id = target_id)
      AND f2.status = 'accepted'
  );
$$;

-- ── 10. RPC : search_players ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.search_players(query TEXT)
RETURNS TABLE (
  id         UUID,
  username   TEXT,
  avatar_url TEXT,
  bio        TEXT
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT p.id, p.username, p.avatar_url, p.bio
  FROM public.profiles p
  WHERE p.username IS NOT NULL
    AND p.id != auth.uid()
    AND p.username ILIKE '%' || query || '%'
  ORDER BY p.username
  LIMIT 10;
$$;
