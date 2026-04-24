-- ============================================================================
-- NAVI — Arbitre IA premium pour Outbid (1v1)
-- ============================================================================
-- Dépendances : schema_social.sql, schema_subscription.sql,
--               schema_social_v2.sql, schema_outbid_online.sql
--
-- Fournit :
--   1. Colonne `payload jsonb` sur public.notifications (générique)
--   2. Étend la contrainte CHECK type pour accepter 'outbid_navi_shared'
--   3. RPC outbid_save_navi_verdict — stocke le verdict de Navi dans
--      game_rooms.config.outbid.navi (idempotent, premium-only)
--   4. RPC notify_outbid_share — appelée par la server action après
--      partage, notifie tous les participants (sauf l'auteur)
-- ============================================================================


-- ── 1. Notifications : payload + nouveau type ──────────────────────────────

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'friend_request',
    'friend_accepted',
    'new_referral',
    'subscription_started',
    'outbid_navi_shared'
  ));


-- ── 2. RPC outbid_save_navi_verdict ────────────────────────────────────────
-- Stocke le verdict de Navi dans game_rooms.config.outbid.navi.
-- Vérifs : authentifié, premium, est participant de la room, room en
-- phase 'result' et game_type 'outbid'. Idempotent : retourne le
-- verdict existant si déjà set (ne le ré-écrase pas).
--
-- Retourne le sous-objet `navi` complet ({verdict, locale, authorId,
-- authorName, createdAt}).

CREATE OR REPLACE FUNCTION public.outbid_save_navi_verdict(
  p_room_id TEXT,
  p_verdict TEXT,
  p_locale  TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid             UUID := auth.uid();
  v_phase           TEXT;
  v_game_type       TEXT;
  v_config          JSONB;
  v_outbid          JSONB;
  v_existing        JSONB;
  v_user_name       TEXT;
  v_is_participant  BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT public.is_premium(v_uid) THEN
    RAISE EXCEPTION 'not_premium';
  END IF;

  IF p_verdict IS NULL OR length(trim(p_verdict)) = 0 THEN
    RAISE EXCEPTION 'empty_verdict';
  END IF;

  -- Sérialise les appels concurrents sur la même room
  PERFORM pg_advisory_xact_lock(hashtext('navi:' || p_room_id));

  SELECT phase, game_type, config
    INTO v_phase, v_game_type, v_config
    FROM game_rooms WHERE id = p_room_id FOR UPDATE;

  IF v_phase IS NULL THEN RAISE EXCEPTION 'room_not_found'; END IF;
  IF v_game_type != 'outbid' THEN RAISE EXCEPTION 'wrong_game_type'; END IF;
  IF v_phase != 'result' THEN RAISE EXCEPTION 'not_in_result'; END IF;

  SELECT TRUE, display_name
    INTO v_is_participant, v_user_name
    FROM room_players
    WHERE room_id = p_room_id AND user_id = v_uid
    LIMIT 1;
  IF v_is_participant IS NULL THEN
    RAISE EXCEPTION 'not_participant';
  END IF;

  v_outbid := COALESCE(v_config->'outbid', '{}'::jsonb);
  v_existing := v_outbid->'navi';

  -- Idempotent : si déjà set, retourne sans rien changer
  IF v_existing IS NOT NULL AND v_existing != 'null'::jsonb THEN
    RETURN v_existing;
  END IF;

  v_outbid := jsonb_set(v_outbid, '{navi}',
    jsonb_build_object(
      'verdict', p_verdict,
      'locale', COALESCE(p_locale, 'fr'),
      'authorId', v_uid::text,
      'authorName', COALESCE(v_user_name, 'Anonymous'),
      'createdAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )
  );
  v_config := jsonb_set(v_config, '{outbid}', v_outbid);

  UPDATE game_rooms SET config = v_config WHERE id = p_room_id;

  RETURN v_outbid->'navi';
END;
$$;

GRANT EXECUTE ON FUNCTION public.outbid_save_navi_verdict(TEXT, TEXT, TEXT) TO authenticated;


-- ── 3. RPC notify_outbid_share ─────────────────────────────────────────────
-- Insère une notif `outbid_navi_shared` pour chaque participant de la
-- partie partagée (sauf l'auteur du partage). À appeler depuis la
-- server action `shareGameResult` une fois la row marquée is_shared=TRUE.
--
-- Récupère les participants depuis result_data.participants[].user_id.
-- Idempotent : ne crée pas de doublon pour le même couple
-- (user, from_user, result_id).
--
-- Sécurité : appelable uniquement par l'auteur du partage.

CREATE OR REPLACE FUNCTION public.notify_outbid_share(p_result_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_owner_id    UUID;
  v_data        JSONB;
  v_game_type   TEXT;
  v_participant JSONB;
  v_target_id   UUID;
  v_uid_str     TEXT;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  SELECT user_id, game_type, result_data
    INTO v_owner_id, v_game_type, v_data
    FROM game_results
    WHERE id = p_result_id AND is_shared = TRUE;

  IF v_owner_id IS NULL THEN RETURN; END IF;
  IF v_owner_id != v_uid THEN RETURN; END IF;
  IF v_game_type != 'outbid' THEN RETURN; END IF;

  v_uid_str := v_uid::text;

  FOR v_participant IN
    SELECT * FROM jsonb_array_elements(COALESCE(v_data->'participants', '[]'::jsonb))
  LOOP
    v_target_id := NULL;
    BEGIN
      IF v_participant->>'user_id' IS NOT NULL
         AND v_participant->>'user_id' != ''
         AND v_participant->>'user_id' != v_uid_str
      THEN
        v_target_id := (v_participant->>'user_id')::UUID;
      END IF;
    EXCEPTION WHEN others THEN
      v_target_id := NULL;
    END;

    IF v_target_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, from_user_id, payload)
      SELECT v_target_id, 'outbid_navi_shared', v_uid,
             jsonb_build_object('result_id', p_result_id::text)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.notifications
         WHERE user_id = v_target_id
           AND type = 'outbid_navi_shared'
           AND from_user_id = v_uid
           AND payload->>'result_id' = p_result_id::text
      );
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_outbid_share(UUID) TO authenticated;


-- ── 4. Vérifications ───────────────────────────────────────────────────────
--   SELECT proname FROM pg_proc WHERE proname IN (
--     'outbid_save_navi_verdict','notify_outbid_share'
--   );
--   SELECT column_name, data_type, column_default
--     FROM information_schema.columns
--     WHERE table_schema='public' AND table_name='notifications';
