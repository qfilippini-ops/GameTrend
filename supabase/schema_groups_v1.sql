-- ───────────────────────────────────────────────────────────────────────────
-- schema_groups_v1.sql
--
-- Système de groupes (1 par utilisateur) :
--   - chat realtime entre amis
--   - invitations en attente (notif group_invite)
--   - kick host-only, transfert d'hôte automatique
--   - capacité 4 (freemium) / 16 (premium) — miroir de compute_max_players
--   - auto-purge après 1h d'inactivité ou si vide
--   - partage automatique des lobbies dans le chat (message system)
--
-- Le fichier est idempotent : DROP IF EXISTS sur les contraintes/policies/
-- triggers/cron, CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE pour les fns.
-- ───────────────────────────────────────────────────────────────────────────


-- ─── 1. Tables ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.groups (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  max_members       int  NOT NULL DEFAULT 4 CHECK (max_members BETWEEN 2 AND 16),
  last_activity_at  timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS groups_host_idx           ON public.groups(host_id);
CREATE INDEX IF NOT EXISTS groups_last_activity_idx  ON public.groups(last_activity_at);


CREATE TABLE IF NOT EXISTS public.group_members (
  group_id     uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  is_host      boolean NOT NULL DEFAULT false,
  joined_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

-- Un user = au plus 1 groupe à la fois
CREATE UNIQUE INDEX IF NOT EXISTS group_members_user_unique ON public.group_members(user_id);
CREATE INDEX IF NOT EXISTS group_members_group_idx ON public.group_members(group_id);


CREATE TABLE IF NOT EXISTS public.group_invitations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  inviter_id  uuid NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  invitee_id  uuid NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '15 minutes',
  UNIQUE (group_id, invitee_id)
);

CREATE INDEX IF NOT EXISTS group_invitations_invitee_idx ON public.group_invitations(invitee_id);
CREATE INDEX IF NOT EXISTS group_invitations_expires_idx ON public.group_invitations(expires_at);


CREATE TABLE IF NOT EXISTS public.group_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id    uuid          REFERENCES auth.users(id)    ON DELETE SET NULL,
  type       text NOT NULL DEFAULT 'text'
              CHECK (type IN ('text', 'system', 'lobby_share')),
  content    text NOT NULL,
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS group_messages_group_created_idx
  ON public.group_messages(group_id, created_at);


-- ─── 2. Notifications : ajouter le type 'group_invite' ─────────────────────
-- On reprend la liste exhaustive (cf. schema_subscription.sql) pour ne casser
-- aucune notif existante.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'friend_request',
    'friend_accepted',
    'new_referral',
    'subscription_started',
    'outbid_navi_shared',
    'post_liked',
    'post_commented',
    'comment_replied',
    'group_invite'
  ));


-- ─── 3. RPC compute_max_members ────────────────────────────────────────────
-- Miroir de compute_max_players : 4 freemium, 16 premium.
CREATE OR REPLACE FUNCTION public.compute_max_members(p_user_id uuid)
RETURNS int
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT subscription_status INTO v_status
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_status IN ('trialing', 'active', 'lifetime') THEN
    RETURN 16;
  END IF;
  RETURN 4;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_max_members(uuid) TO authenticated;


-- ─── 4. Triggers de capacité et de cohérence ───────────────────────────────

-- Force max_members ≤ capacité du host. Si max_members par défaut (4) et
-- host premium → bump à 16 automatiquement.
CREATE OR REPLACE FUNCTION public.groups_validate_capacity_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cap int;
BEGIN
  v_cap := public.compute_max_members(NEW.host_id);
  IF NEW.max_members IS NULL OR NEW.max_members = 4 THEN
    NEW.max_members := v_cap;
  END IF;
  IF NEW.max_members > v_cap THEN
    RAISE EXCEPTION 'group_capacity_exceeded' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_groups_validate_capacity ON public.groups;
CREATE TRIGGER trg_groups_validate_capacity
  BEFORE INSERT OR UPDATE ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.groups_validate_capacity_fn();


-- Empêche de rejoindre un groupe plein
CREATE OR REPLACE FUNCTION public.group_members_check_capacity_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max int;
  v_cnt int;
BEGIN
  SELECT max_members INTO v_max FROM public.groups WHERE id = NEW.group_id;
  SELECT COUNT(*) INTO v_cnt FROM public.group_members WHERE group_id = NEW.group_id;
  IF v_cnt >= COALESCE(v_max, 4) THEN
    RAISE EXCEPTION 'group_full' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_group_members_check_capacity ON public.group_members;
CREATE TRIGGER trg_group_members_check_capacity
  BEFORE INSERT ON public.group_members
  FOR EACH ROW EXECUTE FUNCTION public.group_members_check_capacity_fn();


-- Transfert d'hôte automatique : si le membre supprimé est l'hôte, promeut
-- le plus ancien restant. Tourne BEFORE DELETE pour pouvoir UPDATE sans race.
CREATE OR REPLACE FUNCTION public.group_host_transfer_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next uuid;
BEGIN
  IF NOT OLD.is_host THEN
    RETURN OLD;
  END IF;
  -- Cherche le plus ancien membre restant (hors celui qui part)
  SELECT user_id INTO v_next
  FROM public.group_members
  WHERE group_id = OLD.group_id
    AND user_id <> OLD.user_id
  ORDER BY joined_at ASC
  LIMIT 1;

  IF v_next IS NOT NULL THEN
    UPDATE public.group_members
       SET is_host = true
     WHERE group_id = OLD.group_id AND user_id = v_next;
    UPDATE public.groups
       SET host_id = v_next
     WHERE id = OLD.group_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_group_host_transfer ON public.group_members;
CREATE TRIGGER trg_group_host_transfer
  BEFORE DELETE ON public.group_members
  FOR EACH ROW EXECUTE FUNCTION public.group_host_transfer_fn();


-- Purge le groupe quand il devient vide (CASCADE messages + invitations).
CREATE OR REPLACE FUNCTION public.groups_purge_empty_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining int;
BEGIN
  SELECT COUNT(*) INTO v_remaining
    FROM public.group_members
   WHERE group_id = OLD.group_id;
  IF v_remaining = 0 THEN
    DELETE FROM public.groups WHERE id = OLD.group_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_groups_purge_empty ON public.group_members;
CREATE TRIGGER trg_groups_purge_empty
  AFTER DELETE ON public.group_members
  FOR EACH ROW EXECUTE FUNCTION public.groups_purge_empty_fn();


-- Bump last_activity_at sur toute activité (messages, joins, invites).
CREATE OR REPLACE FUNCTION public.bump_group_activity_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.groups
     SET last_activity_at = now()
   WHERE id = NEW.group_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_group_activity_msgs ON public.group_messages;
CREATE TRIGGER trg_bump_group_activity_msgs
  AFTER INSERT ON public.group_messages
  FOR EACH ROW EXECUTE FUNCTION public.bump_group_activity_fn();

DROP TRIGGER IF EXISTS trg_bump_group_activity_members ON public.group_members;
CREATE TRIGGER trg_bump_group_activity_members
  AFTER INSERT ON public.group_members
  FOR EACH ROW EXECUTE FUNCTION public.bump_group_activity_fn();

DROP TRIGGER IF EXISTS trg_bump_group_activity_invites ON public.group_invitations;
CREATE TRIGGER trg_bump_group_activity_invites
  AFTER INSERT ON public.group_invitations
  FOR EACH ROW EXECUTE FUNCTION public.bump_group_activity_fn();


-- ─── 5. RLS ────────────────────────────────────────────────────────────────

ALTER TABLE public.groups            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_messages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_invitations ENABLE ROW LEVEL SECURITY;

-- groups : visible aux membres uniquement
DROP POLICY IF EXISTS "groups_members_read" ON public.groups;
CREATE POLICY "groups_members_read" ON public.groups
  FOR SELECT USING (
    id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );

-- group_members : visible aux membres du même groupe
DROP POLICY IF EXISTS "group_members_read" ON public.group_members;
CREATE POLICY "group_members_read" ON public.group_members
  FOR SELECT USING (
    group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );

-- group_messages : lecture/insert pour membres
DROP POLICY IF EXISTS "group_messages_read" ON public.group_messages;
CREATE POLICY "group_messages_read" ON public.group_messages
  FOR SELECT USING (
    group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "group_messages_insert" ON public.group_messages;
CREATE POLICY "group_messages_insert" ON public.group_messages
  FOR INSERT WITH CHECK (
    -- text : self-authored uniquement, dans son groupe
    (type = 'text' AND user_id = auth.uid()
     AND group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid()))
  );

-- group_invitations : visible à l'invité ou aux membres du groupe
DROP POLICY IF EXISTS "group_invitations_read" ON public.group_invitations;
CREATE POLICY "group_invitations_read" ON public.group_invitations
  FOR SELECT USING (
    invitee_id = auth.uid()
    OR group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );


-- ─── 6. RPCs métier ────────────────────────────────────────────────────────

-- create_group : insère le groupe + ajoute le caller comme host.
-- Erreurs : already_in_group si déjà membre d'un groupe.
CREATE OR REPLACE FUNCTION public.create_group()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  IF EXISTS (SELECT 1 FROM public.group_members WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'already_in_group';
  END IF;

  INSERT INTO public.groups(host_id) VALUES (v_uid) RETURNING id INTO v_id;
  INSERT INTO public.group_members(group_id, user_id, is_host)
    VALUES (v_id, v_uid, true);

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_group() TO authenticated;


-- invite_to_group : invite un AMI dans le groupe du caller.
-- Si le caller n'a pas encore de groupe, en crée un automatiquement.
-- Crée une notification 'group_invite' pour l'invité.
CREATE OR REPLACE FUNCTION public.invite_to_group(p_target_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_group   uuid;
  v_invite  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  IF p_target_id = v_uid THEN
    RAISE EXCEPTION 'cannot_invite_self';
  END IF;

  -- Vérifie l'amitié acceptée (dans les 2 sens)
  IF NOT EXISTS (
    SELECT 1 FROM public.friendships
     WHERE status = 'accepted'
       AND ((requester_id = v_uid AND addressee_id = p_target_id)
         OR (requester_id = p_target_id AND addressee_id = v_uid))
  ) THEN
    RAISE EXCEPTION 'not_friend';
  END IF;

  -- Récupère le groupe du caller (ou en crée un)
  SELECT group_id INTO v_group FROM public.group_members WHERE user_id = v_uid;
  IF v_group IS NULL THEN
    INSERT INTO public.groups(host_id) VALUES (v_uid) RETURNING id INTO v_group;
    INSERT INTO public.group_members(group_id, user_id, is_host)
      VALUES (v_group, v_uid, true);
  END IF;

  -- Cible déjà membre ?
  IF EXISTS (
    SELECT 1 FROM public.group_members
     WHERE group_id = v_group AND user_id = p_target_id
  ) THEN
    RAISE EXCEPTION 'already_member';
  END IF;

  -- Invite déjà en cours ? (UNIQUE évite le doublon mais on remonte un msg propre)
  IF EXISTS (
    SELECT 1 FROM public.group_invitations
     WHERE group_id = v_group AND invitee_id = p_target_id AND expires_at > now()
  ) THEN
    RAISE EXCEPTION 'invite_pending';
  END IF;

  -- Nettoie les anciennes invites expirées sur ce couple pour éviter le UNIQUE
  DELETE FROM public.group_invitations
   WHERE group_id = v_group AND invitee_id = p_target_id;

  INSERT INTO public.group_invitations(group_id, inviter_id, invitee_id)
    VALUES (v_group, v_uid, p_target_id)
  RETURNING id INTO v_invite;

  -- Notification pour l'invité
  INSERT INTO public.notifications(user_id, type, from_user_id, payload)
  VALUES (
    p_target_id,
    'group_invite',
    v_uid,
    jsonb_build_object('group_id', v_group, 'invitation_id', v_invite)
  );

  RETURN v_invite;
END;
$$;

GRANT EXECUTE ON FUNCTION public.invite_to_group(uuid) TO authenticated;


-- accept_group_invite : retire le caller de son éventuel groupe précédent
-- (avec transfert d'hôte automatique), puis l'ajoute au nouveau groupe.
CREATE OR REPLACE FUNCTION public.accept_group_invite(p_invitation_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_inv       public.group_invitations%ROWTYPE;
  v_old_group uuid;
  v_username  text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  SELECT * INTO v_inv FROM public.group_invitations WHERE id = p_invitation_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation_not_found';
  END IF;
  IF v_inv.invitee_id <> v_uid THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF v_inv.expires_at < now() THEN
    DELETE FROM public.group_invitations WHERE id = p_invitation_id;
    RAISE EXCEPTION 'invitation_expired';
  END IF;

  -- Quitte l'éventuel groupe précédent (le trigger gère le transfert d'hôte
  -- et la purge si vide)
  SELECT group_id INTO v_old_group FROM public.group_members WHERE user_id = v_uid;
  IF v_old_group IS NOT NULL AND v_old_group <> v_inv.group_id THEN
    DELETE FROM public.group_members
     WHERE group_id = v_old_group AND user_id = v_uid;
  END IF;

  -- Rejoint le nouveau groupe (le trigger valide la capacité)
  INSERT INTO public.group_members(group_id, user_id, is_host)
    VALUES (v_inv.group_id, v_uid, false)
  ON CONFLICT (group_id, user_id) DO NOTHING;

  -- Supprime l'invitation
  DELETE FROM public.group_invitations WHERE id = p_invitation_id;

  -- Message système "X a rejoint"
  SELECT username INTO v_username FROM public.profiles WHERE id = v_uid;
  INSERT INTO public.group_messages(group_id, user_id, type, content, payload)
    VALUES (
      v_inv.group_id,
      NULL,
      'system',
      'joined',
      jsonb_build_object('user_id', v_uid, 'username', COALESCE(v_username, ''))
    );

  RETURN v_inv.group_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_group_invite(uuid) TO authenticated;


-- decline_group_invite : supprime simplement l'invitation
CREATE OR REPLACE FUNCTION public.decline_group_invite(p_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inv public.group_invitations%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;
  SELECT * INTO v_inv FROM public.group_invitations WHERE id = p_invitation_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_inv.invitee_id <> v_uid THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  DELETE FROM public.group_invitations WHERE id = p_invitation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decline_group_invite(uuid) TO authenticated;


-- leave_group : quitte le groupe du caller. Trigger gère transfer + purge.
CREATE OR REPLACE FUNCTION public.leave_group()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_group    uuid;
  v_username text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  SELECT group_id INTO v_group FROM public.group_members WHERE user_id = v_uid;
  IF v_group IS NULL THEN RETURN; END IF;

  SELECT username INTO v_username FROM public.profiles WHERE id = v_uid;

  -- Message system AVANT suppression (ainsi le user peut signer son départ)
  INSERT INTO public.group_messages(group_id, user_id, type, content, payload)
    VALUES (
      v_group,
      NULL,
      'system',
      'left',
      jsonb_build_object('user_id', v_uid, 'username', COALESCE(v_username, ''))
    );

  DELETE FROM public.group_members WHERE group_id = v_group AND user_id = v_uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.leave_group() TO authenticated;


-- kick_group_member : host-only.
CREATE OR REPLACE FUNCTION public.kick_group_member(p_target_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_group    uuid;
  v_is_host  boolean;
  v_username text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  SELECT group_id, is_host INTO v_group, v_is_host
  FROM public.group_members WHERE user_id = v_uid;

  IF v_group IS NULL THEN
    RAISE EXCEPTION 'not_in_group';
  END IF;
  IF NOT v_is_host THEN
    RAISE EXCEPTION 'not_host';
  END IF;
  IF p_target_id = v_uid THEN
    RAISE EXCEPTION 'cannot_kick_self';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.group_members
     WHERE group_id = v_group AND user_id = p_target_id
  ) THEN
    RAISE EXCEPTION 'target_not_member';
  END IF;

  SELECT username INTO v_username FROM public.profiles WHERE id = p_target_id;

  INSERT INTO public.group_messages(group_id, user_id, type, content, payload)
    VALUES (
      v_group,
      NULL,
      'system',
      'kicked',
      jsonb_build_object('user_id', p_target_id, 'username', COALESCE(v_username, ''))
    );

  DELETE FROM public.group_members
   WHERE group_id = v_group AND user_id = p_target_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.kick_group_member(uuid) TO authenticated;


-- send_group_message : insert sécurisé d'un message texte.
CREATE OR REPLACE FUNCTION public.send_group_message(p_content text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_group uuid;
  v_id    uuid;
  v_clean text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;
  v_clean := btrim(COALESCE(p_content, ''));
  IF length(v_clean) = 0 THEN
    RAISE EXCEPTION 'empty_message';
  END IF;
  IF length(v_clean) > 1000 THEN
    RAISE EXCEPTION 'message_too_long';
  END IF;

  SELECT group_id INTO v_group FROM public.group_members WHERE user_id = v_uid;
  IF v_group IS NULL THEN
    RAISE EXCEPTION 'not_in_group';
  END IF;

  INSERT INTO public.group_messages(group_id, user_id, type, content)
    VALUES (v_group, v_uid, 'text', v_clean)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_group_message(text) TO authenticated;


-- share_lobby_to_group : appelée après création d'une room online.
-- No-op silencieux si le caller n'est pas dans un groupe ou pas hôte de la room.
CREATE OR REPLACE FUNCTION public.share_lobby_to_group(p_room_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_group     uuid;
  v_game_type text;
  v_host_id   uuid;
  v_is_priv   boolean;
  v_username  text;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  SELECT group_id INTO v_group FROM public.group_members WHERE user_id = v_uid;
  IF v_group IS NULL THEN RETURN; END IF;

  SELECT game_type, host_id, COALESCE(is_private, true)
    INTO v_game_type, v_host_id, v_is_priv
  FROM public.game_rooms WHERE id = p_room_id;
  IF NOT FOUND OR v_host_id <> v_uid THEN RETURN; END IF;

  SELECT username INTO v_username FROM public.profiles WHERE id = v_uid;

  INSERT INTO public.group_messages(group_id, user_id, type, content, payload)
    VALUES (
      v_group,
      v_uid,
      'lobby_share',
      'lobby_shared',
      jsonb_build_object(
        'code',       p_room_id,
        'game_type',  v_game_type,
        'is_private', v_is_priv,
        'host_id',    v_uid,
        'host_name',  COALESCE(v_username, '')
      )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.share_lobby_to_group(text) TO authenticated;


-- ─── 7. Cron : nettoyage 1h d'inactivité + invitations expirées ────────────

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-inactive-groups') THEN
      PERFORM cron.unschedule('cleanup-inactive-groups');
    END IF;

    PERFORM cron.schedule(
      'cleanup-inactive-groups',
      '* * * * *',
      $cron$
      DELETE FROM public.groups
       WHERE last_activity_at < now() - interval '1 hour';
      DELETE FROM public.group_invitations
       WHERE expires_at < now();
      $cron$
    );
  END IF;
END
$$;
