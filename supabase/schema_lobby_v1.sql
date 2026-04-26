-- ══════════════════════════════════════════════════════════════════════════
-- LOBBY V1 — capacité 4/16 (free/premium), atomicité « 1 lobby max »,
-- auto-fermeture après 10 min d'inactivité, fix get_explore_feed.
-- ──────────────────────────────────────────────────────────────────────────
-- À exécuter UNE fois dans Supabase SQL Editor. Idempotent.
--
-- Contexte produit :
--   1. Limite globale du nombre de participants par lobby :
--      - host freemium → 4 max
--      - host premium  → 16 max
--      Outbid (1v1) reste à 2 par sa propre logique de jeu, indépendamment
--      de cette limite.
--
--   2. Garantie « un user ne peut être que dans UN seul lobby à la fois »
--      via :
--      - un index UNIQUE partiel sur room_players(user_id)
--      - une RPC `safe_join_room` atomique qui kick l'autre lobby (en
--        respectant le transfert d'hôte) AVANT d'insérer
--
--   3. Auto-fermeture : on remplace le `expires_at` glissant +2h par un
--      `last_activity_at` rafraîchi par tout événement (heartbeat, message,
--      vote, join, update room) et un cron toutes les minutes qui purge
--      les rooms inactives depuis > 10 min.
--
--   4. Bug : la version "subscription" de get_explore_feed filtrait sur
--      config->>'is_private' (jamais alimenté à la création) au lieu de la
--      colonne is_private. → tous les lobbies sortaient comme « publics ».
-- ══════════════════════════════════════════════════════════════════════════


-- ─── 1. Pre-cleanup : un user ne peut être que dans une seule room ─────────
-- Avant de poser l'index unique partiel, on supprime les éventuels doublons
-- (un même user_id dans plusieurs rooms). On garde la room la plus
-- récemment rejointe.
WITH ranked AS (
  SELECT ctid,
         user_id,
         room_id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id
           ORDER BY joined_at DESC, room_id
         ) AS rn
    FROM public.room_players
   WHERE user_id IS NOT NULL
)
DELETE FROM public.room_players rp
 USING ranked r
 WHERE rp.ctid = r.ctid
   AND r.rn > 1;


-- ─── 2. Nouvelles colonnes sur game_rooms ──────────────────────────────────
-- max_players : capacité (2..16). Validée à l'insert par trigger en fonction
-- du statut du host. Outbid passera 2 explicitement.
ALTER TABLE public.game_rooms
  ADD COLUMN IF NOT EXISTS max_players int NOT NULL DEFAULT 4;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
     WHERE table_name = 'game_rooms' AND column_name = 'max_players'
       AND constraint_name = 'game_rooms_max_players_check'
  ) THEN
    ALTER TABLE public.game_rooms
      ADD CONSTRAINT game_rooms_max_players_check
        CHECK (max_players BETWEEN 2 AND 16);
  END IF;
END $$;

-- last_activity_at : drive l'auto-fermeture pour inactivité.
ALTER TABLE public.game_rooms
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS game_rooms_inactivity_idx
  ON public.game_rooms(last_activity_at);


-- ─── 3. Index unique partiel : 1 user = 1 room ─────────────────────────────
-- On exclut les user_id NULL (joueurs anonymes pré-auth).
DROP INDEX IF EXISTS public.room_players_user_unique_idx;
CREATE UNIQUE INDEX room_players_user_unique_idx
  ON public.room_players(user_id)
  WHERE user_id IS NOT NULL;


-- ─── 4. RPC : compute_max_players(uid) ─────────────────────────────────────
-- 16 si premium (status ∈ trialing/active/lifetime), 4 sinon. Centralisé
-- pour qu'une évolution de pricing ne nécessite qu'une modif ici.
CREATE OR REPLACE FUNCTION public.compute_max_players(p_user_id uuid)
RETURNS int
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 4;
  END IF;
  SELECT subscription_status INTO v_status
    FROM public.profiles
   WHERE id = p_user_id;
  IF v_status IN ('trialing', 'active', 'lifetime') THEN
    RETURN 16;
  END IF;
  RETURN 4;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_max_players(uuid) TO authenticated, anon;


-- ─── 5. Trigger BEFORE INSERT sur game_rooms : valider max_players ─────────
-- - Si une valeur explicite est passée (ex: Outbid passe 2), on la respecte
--   tant qu'elle est ≤ cap du host.
-- - Sinon (DEFAULT 4) on substitue par compute_max_players(host_id), pour
--   qu'un premium ait directement 16 sans avoir à le passer côté client.
CREATE OR REPLACE FUNCTION public.trg_game_rooms_validate_capacity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cap int;
BEGIN
  v_cap := public.compute_max_players(NEW.host_id);

  -- Si la valeur est le DEFAULT 4 et que le user a droit à plus, on
  -- "monte" automatiquement à son cap. Côté front on peut quand même
  -- borner à un nombre choisi (ex. Outbid = 2) en passant la valeur
  -- explicitement, qui sera respectée tant que ≤ cap.
  IF NEW.max_players = 4 AND v_cap > 4 THEN
    NEW.max_players := v_cap;
  ELSIF NEW.max_players > v_cap THEN
    RAISE EXCEPTION 'lobby_capacity_premium_required'
      USING HINT = format('max_players=%s exceeds cap=%s for host', NEW.max_players, v_cap);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_game_rooms_validate_capacity ON public.game_rooms;
CREATE TRIGGER trg_game_rooms_validate_capacity
  BEFORE INSERT ON public.game_rooms
  FOR EACH ROW EXECUTE FUNCTION public.trg_game_rooms_validate_capacity();


-- ─── 6. Trigger BEFORE INSERT sur room_players : capacité ──────────────────
-- L'index unique partiel garantit déjà l'unicité user→room. Ce trigger
-- complète en bornant le nombre de joueurs par room.
CREATE OR REPLACE FUNCTION public.trg_room_players_check_capacity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cap   int;
  v_count int;
BEGIN
  SELECT max_players INTO v_cap
    FROM public.game_rooms
   WHERE id = NEW.room_id;

  IF v_cap IS NULL THEN
    RAISE EXCEPTION 'room_not_found' USING HINT = NEW.room_id;
  END IF;

  SELECT COUNT(*)::int INTO v_count
    FROM public.room_players
   WHERE room_id = NEW.room_id;

  IF v_count >= v_cap THEN
    RAISE EXCEPTION 'lobby_full'
      USING HINT = format('room=%s cap=%s', NEW.room_id, v_cap);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_room_players_check_capacity ON public.room_players;
CREATE TRIGGER trg_room_players_check_capacity
  BEFORE INSERT ON public.room_players
  FOR EACH ROW EXECUTE FUNCTION public.trg_room_players_check_capacity();


-- ─── 7. RPC : safe_join_room(p_room_id, p_display_name) ────────────────────
-- Atomique : kick l'autre lobby si besoin, vérifie pseudo libre, insère.
-- - Si l'utilisateur est déjà dans la room cible → succès idempotent
--   (reconnexion).
-- - Si dans une autre room → quit_room_fn() pour propre transfert d'hôte
--   ou suppression si seul.
-- - Si pseudo déjà pris dans la room cible → erreur explicite.
-- - La capacité est validée par le trigger §6.
CREATE OR REPLACE FUNCTION public.safe_join_room(
  p_room_id      text,
  p_display_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_room_id   text;
  v_phase     text;
  v_existing  text;
  v_other     record;
  v_new_count int;
  v_clean     text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  v_room_id := upper(btrim(p_room_id));
  v_clean   := btrim(p_display_name);
  IF char_length(v_clean) NOT BETWEEN 1 AND 32 THEN
    RAISE EXCEPTION 'invalid_display_name';
  END IF;

  SELECT phase INTO v_phase FROM public.game_rooms WHERE id = v_room_id;
  IF v_phase IS NULL THEN
    RAISE EXCEPTION 'room_not_found' USING HINT = v_room_id;
  END IF;

  -- ① Reconnexion : déjà dans la room cible → on rentre direct.
  SELECT display_name INTO v_existing
    FROM public.room_players
   WHERE room_id = v_room_id AND user_id = v_uid;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'reconnect',
      'display_name', v_existing
    );
  END IF;

  -- ② Si phase ≠ 'lobby' → on n'autorise que la reconnexion (gérée ci-dessus).
  IF v_phase <> 'lobby' THEN
    RAISE EXCEPTION 'game_already_started';
  END IF;

  -- ③ Quitter toute autre room (via quit_room_fn → transfert d'hôte propre).
  --    On ne devrait avoir qu'UNE autre room max grâce à l'index unique.
  FOR v_other IN
    SELECT room_id, display_name
      FROM public.room_players
     WHERE user_id = v_uid AND room_id <> v_room_id
  LOOP
    PERFORM public.quit_room_fn(v_other.room_id, v_other.display_name);
  END LOOP;

  -- ④ Pseudo libre dans la room cible ?
  IF EXISTS (
    SELECT 1 FROM public.room_players
     WHERE room_id = v_room_id AND display_name = v_clean
  ) THEN
    RAISE EXCEPTION 'display_name_taken';
  END IF;

  -- ⑤ Insert (le trigger §6 valide la capacité, l'index unique l'unicité).
  SELECT COUNT(*)::int INTO v_new_count
    FROM public.room_players
   WHERE room_id = v_room_id;

  INSERT INTO public.room_players (
    room_id, user_id, display_name, is_host, join_order
  ) VALUES (
    v_room_id, v_uid, v_clean, false, v_new_count
  );

  RETURN jsonb_build_object(
    'status', 'joined',
    'display_name', v_clean
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.safe_join_room(text, text) TO authenticated;


-- ─── 8. Auto-refresh last_activity_at ──────────────────────────────────────
-- Une seule fonction de bump réutilisée pour tous les triggers. Elle est
-- intentionnellement idempotente : un UPDATE qui ne change que
-- last_activity_at ne déclenche aucun autre trigger métier.
CREATE OR REPLACE FUNCTION public.bump_room_activity(p_room_id text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.game_rooms
     SET last_activity_at = now()
   WHERE id = p_room_id
     AND last_activity_at < now() - interval '5 seconds';
$$;
-- ↑ Le AND last_activity_at < now() - 5s évite un UPDATE à chaque message
-- en cas de spam : on ne refresh que toutes les 5s max. Ça reste largement
-- assez pour ne jamais expirer pendant l'usage.

-- Trigger générique pour les tables qui ont une colonne `room_id`.
CREATE OR REPLACE FUNCTION public.trg_bump_room_activity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.bump_room_activity(NEW.room_id);
  RETURN NEW;
END;
$$;

-- Sur INSERT : un nouveau joueur, message ou vote = activité.
DROP TRIGGER IF EXISTS bump_activity_on_player ON public.room_players;
CREATE TRIGGER bump_activity_on_player
  AFTER INSERT ON public.room_players
  FOR EACH ROW EXECUTE FUNCTION public.trg_bump_room_activity();

DROP TRIGGER IF EXISTS bump_activity_on_message ON public.room_messages;
CREATE TRIGGER bump_activity_on_message
  AFTER INSERT ON public.room_messages
  FOR EACH ROW EXECUTE FUNCTION public.trg_bump_room_activity();

DROP TRIGGER IF EXISTS bump_activity_on_vote ON public.room_votes;
CREATE TRIGGER bump_activity_on_vote
  AFTER INSERT ON public.room_votes
  FOR EACH ROW EXECUTE FUNCTION public.trg_bump_room_activity();

-- Sur UPDATE de room_players (heartbeat last_seen_at toutes les 60s) :
-- on bump aussi pour suivre les utilisateurs simplement présents.
CREATE OR REPLACE FUNCTION public.trg_bump_on_player_heartbeat()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.last_seen_at IS DISTINCT FROM OLD.last_seen_at THEN
    PERFORM public.bump_room_activity(NEW.room_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bump_activity_on_heartbeat ON public.room_players;
CREATE TRIGGER bump_activity_on_heartbeat
  AFTER UPDATE OF last_seen_at ON public.room_players
  FOR EACH ROW EXECUTE FUNCTION public.trg_bump_on_player_heartbeat();


-- ─── 9. Cron : auto-fermeture après 10 min d'inactivité ────────────────────
-- On supprime l'ancien job (qui purgait sur expires_at avec un délai 30 min)
-- et on remplace par un job toutes les minutes basé sur last_activity_at.
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-expired-rooms');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-inactive-rooms');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup-inactive-rooms',
  '* * * * *',  -- toutes les minutes
  $$
  DELETE FROM public.game_rooms
   WHERE last_activity_at < now() - interval '10 minutes';
  $$
);


-- ─── 10. Fix get_explore_feed (filtrage privé/public) ──────────────────────
-- L'override dans schema_subscription.sql utilisait config->>'is_private'
-- (jamais alimenté à la création), au lieu de la colonne is_private.
-- Conséquence : tous les lobbies passaient comme publics.
--
-- On reposte ici la définition correcte (signature et corps identiques à
-- celle de schema_subscription.sql, à l'exception du WHERE).
CREATE OR REPLACE FUNCTION public.get_explore_feed(
  top_presets int DEFAULT 12,
  top_rooms   int DEFAULT 6
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  trending      jsonb;
  rooms         jsonb;
  boost_slots   int;
  boosted       jsonb;
  organic       jsonb;
BEGIN
  -- 1) Slots boostés (premium)
  boost_slots := LEAST(top_presets / 3, 4);

  SELECT COALESCE(jsonb_agg(p ORDER BY random()), '[]'::jsonb)
    INTO boosted
    FROM (
      SELECT
        p.id, p.title, p.cover_url, p.play_count, p.creator_id,
        p.created_at, p.archived,
        jsonb_build_object(
          'username',   pr.username,
          'avatar_url', pr.avatar_url,
          'subscription_status', pr.subscription_status
        ) AS author
      FROM public.presets p
      LEFT JOIN public.profiles pr ON pr.id = p.creator_id
      WHERE p.archived = false
        AND p.created_at > now() - interval '24 hours'
        AND pr.subscription_status IN ('trialing','active','lifetime')
      LIMIT boost_slots
    ) p;

  -- 2) Slots organiques par play_count
  SELECT COALESCE(jsonb_agg(t ORDER BY t.play_count DESC), '[]'::jsonb)
    INTO organic
    FROM (
      SELECT
        p.id, p.title, p.cover_url, p.play_count, p.creator_id,
        p.created_at, p.archived,
        jsonb_build_object(
          'username',   pr.username,
          'avatar_url', pr.avatar_url,
          'subscription_status', pr.subscription_status
        ) AS author
      FROM public.presets p
      LEFT JOIN public.profiles pr ON pr.id = p.creator_id
      WHERE p.archived = false
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(boosted) b
          WHERE (b->>'id')::uuid = p.id
        )
      ORDER BY p.play_count DESC
      LIMIT (top_presets - boost_slots)
    ) t;

  trending := boosted || organic;

  -- 3) Public rooms : utilise la COLONNE is_private (fix bug filtrage)
  SELECT COALESCE(jsonb_agg(r ORDER BY r.created_at DESC), '[]'::jsonb)
    INTO rooms
    FROM (
      SELECT
        r.id, r.game_type, r.phase, r.created_at,
        jsonb_build_object(
          'username',   pr.username,
          'avatar_url', pr.avatar_url
        ) AS host
      FROM public.game_rooms r
      LEFT JOIN public.profiles pr ON pr.id = r.host_id
      WHERE r.phase = 'lobby'
        AND r.is_private = false
      ORDER BY r.created_at DESC
      LIMIT top_rooms
    ) r;

  RETURN jsonb_build_object(
    'trending_presets', trending,
    'public_rooms',     rooms
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_explore_feed(int, int) TO authenticated, anon;


-- ─── 11. (Optionnel) GRANT pour quit_room_fn depuis safe_join_room ─────────
-- safe_join_room est SECURITY DEFINER → l'appel à quit_room_fn passe avec
-- les droits du owner de la fonction (= postgres), donc rien à changer.
-- Documenté ici pour mémoire.
