-- ============================================================================
-- PREMIUM — Système d'abonnement GameTrend (Lemon Squeezy)
-- ============================================================================
-- Dépendances : schema.sql, schema_social.sql, schema_affiliate.sql
-- À exécuter dans le SQL Editor de Supabase APRÈS les schémas précédents.
-- ============================================================================
--
-- MODÈLE :
--   - 3 plans : monthly (6,99€), yearly (49€), lifetime (99€, 100 premiers comptes)
--   - Trial 7 jours avec CB requise (géré côté Lemon Squeezy)
--   - Status subscription : free, trialing, active, past_due, cancelled, lifetime
--   - Période de grâce paiement échoué : 7 jours (downgrade automatique)
--   - Lifetime éligibilité : trigger automatique sur les 100 premiers profils créés
--   - Boost auto 24h sur Explore pour les nouveaux presets des premium
--   - Limite 5 presets actifs (non archivés) pour les comptes gratuits
--   - Lien profil + bannière custom + couleur d'accent réservés aux premium
--   - 5 presets épinglables sur profil (premium)
--   - Analytics presets (vues, saves, follows) réservés aux premium
--
-- Voir docs/MONETIZATION.md pour le détail business.
-- ============================================================================


-- ─── 1. Extension de profiles ───────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT,
  ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_cancel_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lifetime_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS profile_link_url TEXT,
  ADD COLUMN IF NOT EXISTS profile_banner_url TEXT,
  ADD COLUMN IF NOT EXISTS profile_accent_color TEXT,
  ADD COLUMN IF NOT EXISTS ls_customer_id TEXT;

-- Drop puis recreate pour gérer les évolutions de la contrainte
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_subscription_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_subscription_status_check
  CHECK (subscription_status IN ('free', 'trialing', 'active', 'past_due', 'cancelled', 'lifetime'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_subscription_plan_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_subscription_plan_check
  CHECK (subscription_plan IS NULL OR subscription_plan IN ('monthly', 'yearly', 'lifetime'));

CREATE INDEX IF NOT EXISTS profiles_subscription_status_idx
  ON public.profiles(subscription_status) WHERE subscription_status != 'free';

CREATE INDEX IF NOT EXISTS profiles_ls_customer_idx
  ON public.profiles(ls_customer_id) WHERE ls_customer_id IS NOT NULL;


-- ─── 2. Trigger lifetime_eligible (100 premiers comptes) ────────────────────
-- Marque automatiquement les 100 premiers profils comme éligibles au lifetime.
-- Backfill aussi les comptes existants (utile au lancement).

CREATE OR REPLACE FUNCTION public.mark_lifetime_eligible_fn()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  count_existing int;
BEGIN
  SELECT COUNT(*) INTO count_existing FROM public.profiles;
  IF count_existing < 100 THEN
    NEW.lifetime_eligible := TRUE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mark_lifetime_eligible_trg ON public.profiles;
CREATE TRIGGER mark_lifetime_eligible_trg
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.mark_lifetime_eligible_fn();

-- Backfill des comptes existants : si moins de 100 comptes au moment de la
-- migration, tous deviennent éligibles. Sinon les 100 plus anciens.
DO $$
DECLARE
  total int;
BEGIN
  SELECT COUNT(*) INTO total FROM public.profiles;
  IF total <= 100 THEN
    UPDATE public.profiles SET lifetime_eligible = TRUE WHERE lifetime_eligible = FALSE;
  ELSE
    UPDATE public.profiles SET lifetime_eligible = TRUE
    WHERE id IN (
      SELECT id FROM public.profiles ORDER BY created_at ASC LIMIT 100
    );
  END IF;
END $$;


-- ─── 3. Extension de presets : archivage ────────────────────────────────────
-- Permet de "désactiver" un preset sans le supprimer (compte pour le quota
-- gratuit de 5 presets actifs).

ALTER TABLE public.presets
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS presets_author_active_idx
  ON public.presets(author_id) WHERE archived_at IS NULL;


-- ─── 4. Table subscriptions ─────────────────────────────────────────────────
-- Historique LS. Une ligne par souscription. Conserve raw_event pour debug.

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ls_subscription_id      text UNIQUE,
  ls_order_id             text,
  ls_customer_id          text,
  variant_id              text NOT NULL,
  plan                    text NOT NULL,
  status                  text NOT NULL,
  amount_cents            int NOT NULL,
  currency                text NOT NULL DEFAULT 'EUR',
  trial_ends_at           timestamptz,
  renews_at               timestamptz,
  ends_at                 timestamptz,
  raw_event               jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscriptions_plan_check CHECK (plan IN ('monthly','yearly','lifetime'))
);

CREATE INDEX IF NOT EXISTS subscriptions_user_idx ON public.subscriptions(user_id);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Voir mes abos" ON public.subscriptions;
CREATE POLICY "Voir mes abos" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);


-- ─── 5. Table pinned_presets ────────────────────────────────────────────────
-- 5 presets épinglables sur le profil (premium uniquement).

CREATE TABLE IF NOT EXISTS public.pinned_presets (
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  preset_id  uuid NOT NULL REFERENCES public.presets(id) ON DELETE CASCADE,
  position   int NOT NULL CHECK (position BETWEEN 1 AND 5),
  pinned_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, preset_id),
  UNIQUE (user_id, position)
);

CREATE INDEX IF NOT EXISTS pinned_presets_user_idx ON public.pinned_presets(user_id, position);

ALTER TABLE public.pinned_presets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Voir les pins publics" ON public.pinned_presets;
CREATE POLICY "Voir les pins publics" ON public.pinned_presets FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS "Gérer mes pins" ON public.pinned_presets;
CREATE POLICY "Gérer mes pins" ON public.pinned_presets
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);


-- ─── 6. Table preset_views (analytics) ──────────────────────────────────────
-- Append-only. Insertion via RPC track_preset_event (anti-spam intégré).
-- Pas de RLS de SELECT direct — accès uniquement via RPC get_preset_analytics.

CREATE TABLE IF NOT EXISTS public.preset_views (
  id          bigserial PRIMARY KEY,
  preset_id   uuid NOT NULL REFERENCES public.presets(id) ON DELETE CASCADE,
  viewer_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type  text NOT NULL CHECK (event_type IN ('view','save','share','follow_after_view')),
  country     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS preset_views_preset_idx
  ON public.preset_views(preset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS preset_views_preset_event_idx
  ON public.preset_views(preset_id, event_type, created_at DESC);

ALTER TABLE public.preset_views ENABLE ROW LEVEL SECURITY;
-- Pas de policy SELECT : accès uniquement via RPC SECURITY DEFINER


-- ─── 7. Helper is_premium(uid) ──────────────────────────────────────────────
-- Utilitaire SQL réutilisable dans les RPC et politiques.
-- Considère comme premium : trialing, active, lifetime.

CREATE OR REPLACE FUNCTION public.is_premium(uid uuid)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT subscription_status IN ('trialing', 'active', 'lifetime')
     FROM public.profiles WHERE id = uid),
    FALSE
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_premium(uuid) TO authenticated, anon;


-- ─── 8. RPC get_my_subscription() ───────────────────────────────────────────
-- Retourne le statut complet pour la section "Mon abonnement" du profil.

CREATE OR REPLACE FUNCTION public.get_my_subscription()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  result jsonb;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('status', 'free');
  END IF;

  SELECT jsonb_build_object(
    'status',                  p.subscription_status,
    'plan',                    p.subscription_plan,
    'current_period_end',      p.subscription_current_period_end,
    'cancel_at',               p.subscription_cancel_at,
    'lifetime_eligible',       p.lifetime_eligible,
    'ls_customer_id',          p.ls_customer_id
  ) INTO result
  FROM public.profiles p
  WHERE p.id = uid;

  RETURN COALESCE(result, jsonb_build_object('status', 'free'));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_subscription() TO authenticated;


-- ─── 9. RPC count_lifetime_taken() ──────────────────────────────────────────
-- Pour afficher "X / 100 places lifetime restantes" sur la page pricing.

CREATE OR REPLACE FUNCTION public.count_lifetime_taken()
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int FROM public.profiles WHERE subscription_status = 'lifetime';
$$;

GRANT EXECUTE ON FUNCTION public.count_lifetime_taken() TO authenticated, anon;


-- ─── 10. RPC count_active_presets(uid) ──────────────────────────────────────
-- Compte les presets non archivés. Utilisé pour le paywall sur la 6e création.

CREATE OR REPLACE FUNCTION public.count_active_presets(uid uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int FROM public.presets
  WHERE author_id = uid AND archived_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.count_active_presets(uuid) TO authenticated;


-- ─── 11. RPC update_profile_link(url) ───────────────────────────────────────
-- Validation regex + blocklist domaine. Erreur 'not_premium', 'invalid_url',
-- 'blocked_domain'.

CREATE OR REPLACE FUNCTION public.update_profile_link(new_url text)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  normalized text;
  domain text;
  blocked text[] := ARRAY[
    'pornhub.com', 'xvideos.com', 'xnxx.com', 'redtube.com',
    'bit.ly', 'tinyurl.com', 'goo.gl', 't.co', 'is.gd',
    'phishing.com'
  ];
  b text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF NOT public.is_premium(uid) THEN
    RAISE EXCEPTION 'not_premium';
  END IF;

  -- Effacer le lien
  IF new_url IS NULL OR length(trim(new_url)) = 0 THEN
    UPDATE public.profiles SET profile_link_url = NULL WHERE id = uid;
    RETURN '';
  END IF;

  normalized := trim(new_url);

  -- Force https:// si http:// ou rien
  IF normalized !~ '^https?://' THEN
    normalized := 'https://' || normalized;
  END IF;

  -- Validation format URL stricte
  IF normalized !~ '^https?://[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(/.*)?$' THEN
    RAISE EXCEPTION 'invalid_url';
  END IF;

  -- Limite longueur
  IF length(normalized) > 200 THEN
    RAISE EXCEPTION 'invalid_url';
  END IF;

  -- Extraction du domaine et check blocklist
  domain := lower(regexp_replace(normalized, '^https?://([^/]+).*$', '\1'));
  -- Strip www.
  domain := regexp_replace(domain, '^www\.', '');

  FOREACH b IN ARRAY blocked LOOP
    IF domain = b OR domain LIKE '%.' || b THEN
      RAISE EXCEPTION 'blocked_domain';
    END IF;
  END LOOP;

  UPDATE public.profiles SET profile_link_url = normalized WHERE id = uid;
  RETURN normalized;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_profile_link(text) TO authenticated;


-- ─── 12. RPC update_profile_branding(banner_url, accent_color) ──────────────
-- Validation simple : URL banner doit pointer vers le bucket Supabase Storage,
-- accent_color doit être un HEX valide.

CREATE OR REPLACE FUNCTION public.update_profile_branding(
  new_banner_url text,
  new_accent_color text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF NOT public.is_premium(uid) THEN
    RAISE EXCEPTION 'not_premium';
  END IF;

  -- Validation accent_color (HEX #RRGGBB ou #RGB ou null)
  IF new_accent_color IS NOT NULL AND new_accent_color !~ '^#[0-9a-fA-F]{3,8}$' THEN
    RAISE EXCEPTION 'invalid_color';
  END IF;

  -- Validation banner_url (null ou URL Supabase)
  IF new_banner_url IS NOT NULL AND new_banner_url != '' AND length(new_banner_url) > 500 THEN
    RAISE EXCEPTION 'invalid_url';
  END IF;

  UPDATE public.profiles
  SET profile_banner_url = NULLIF(trim(new_banner_url), ''),
      profile_accent_color = NULLIF(trim(new_accent_color), '')
  WHERE id = uid;

  RETURN jsonb_build_object(
    'banner_url', NULLIF(trim(new_banner_url), ''),
    'accent_color', NULLIF(trim(new_accent_color), '')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_profile_branding(text, text) TO authenticated;


-- ─── 13. RPC set_pinned_presets(preset_ids) ─────────────────────────────────
-- Remplace la liste des pins. Vérifie ownership + premium.

CREATE OR REPLACE FUNCTION public.set_pinned_presets(preset_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  pid uuid;
  pos int := 1;
  ownership_count int;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF NOT public.is_premium(uid) THEN
    RAISE EXCEPTION 'not_premium';
  END IF;

  IF preset_ids IS NULL OR array_length(preset_ids, 1) IS NULL THEN
    DELETE FROM public.pinned_presets WHERE user_id = uid;
    RETURN jsonb_build_object('count', 0);
  END IF;

  IF array_length(preset_ids, 1) > 5 THEN
    RAISE EXCEPTION 'too_many';
  END IF;

  -- Vérifie que tous les presets appartiennent à l'utilisateur
  SELECT COUNT(*) INTO ownership_count FROM public.presets
  WHERE id = ANY(preset_ids) AND author_id = uid;

  IF ownership_count != array_length(preset_ids, 1) THEN
    RAISE EXCEPTION 'not_owner';
  END IF;

  DELETE FROM public.pinned_presets WHERE user_id = uid;

  FOREACH pid IN ARRAY preset_ids LOOP
    INSERT INTO public.pinned_presets(user_id, preset_id, position)
    VALUES (uid, pid, pos);
    pos := pos + 1;
  END LOOP;

  RETURN jsonb_build_object('count', array_length(preset_ids, 1));
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_pinned_presets(uuid[]) TO authenticated;


-- ─── 14. RPC track_preset_event(preset_id, event) ───────────────────────────
-- Insertion silencieuse dans preset_views. Anti-spam : 1 'view' max / 1h /
-- (preset, viewer). Les autres events sont libres (rares par nature).

CREATE OR REPLACE FUNCTION public.track_preset_event(
  p_preset_id uuid,
  p_event text,
  p_country text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  recent_count int;
BEGIN
  IF p_event NOT IN ('view','save','share','follow_after_view') THEN
    RETURN;
  END IF;

  -- Vérifie que le preset existe
  IF NOT EXISTS (SELECT 1 FROM public.presets WHERE id = p_preset_id) THEN
    RETURN;
  END IF;

  -- Anti-spam : 1 view max par heure par (preset, viewer)
  IF p_event = 'view' AND uid IS NOT NULL THEN
    SELECT COUNT(*) INTO recent_count FROM public.preset_views
    WHERE preset_id = p_preset_id
      AND viewer_id = uid
      AND event_type = 'view'
      AND created_at > now() - INTERVAL '1 hour';
    IF recent_count > 0 THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.preset_views(preset_id, viewer_id, event_type, country)
  VALUES (p_preset_id, uid, p_event, p_country);
END;
$$;

GRANT EXECUTE ON FUNCTION public.track_preset_event(uuid, text, text) TO authenticated, anon;


-- ─── 15. RPC get_preset_analytics(preset_id, range_days) ────────────────────
-- Retourne les KPIs et séries temporelles. Vérifie ownership + premium.

CREATE OR REPLACE FUNCTION public.get_preset_analytics(
  p_preset_id uuid,
  p_range_days int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  is_owner bool;
  total_views int;
  total_saves int;
  total_shares int;
  total_follows int;
  series jsonb;
  countries jsonb;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF NOT public.is_premium(uid) THEN
    RAISE EXCEPTION 'not_premium';
  END IF;

  SELECT (author_id = uid) INTO is_owner FROM public.presets WHERE id = p_preset_id;
  IF is_owner IS NULL OR NOT is_owner THEN
    RAISE EXCEPTION 'not_owner';
  END IF;

  IF p_range_days NOT IN (7, 30, 90) THEN
    p_range_days := 30;
  END IF;

  -- KPI globaux sur la fenêtre
  SELECT
    COUNT(*) FILTER (WHERE event_type = 'view'),
    COUNT(*) FILTER (WHERE event_type = 'save'),
    COUNT(*) FILTER (WHERE event_type = 'share'),
    COUNT(*) FILTER (WHERE event_type = 'follow_after_view')
  INTO total_views, total_saves, total_shares, total_follows
  FROM public.preset_views
  WHERE preset_id = p_preset_id
    AND created_at > now() - (p_range_days || ' days')::interval;

  -- Série temporelle quotidienne (vues uniquement, pour graph principal)
  SELECT COALESCE(jsonb_agg(row_to_json(s) ORDER BY s.day), '[]'::jsonb)
  INTO series
  FROM (
    SELECT
      date_trunc('day', created_at)::date AS day,
      COUNT(*) FILTER (WHERE event_type = 'view') AS views,
      COUNT(*) FILTER (WHERE event_type = 'save') AS saves
    FROM public.preset_views
    WHERE preset_id = p_preset_id
      AND created_at > now() - (p_range_days || ' days')::interval
    GROUP BY day
  ) s;

  -- Top countries
  SELECT COALESCE(jsonb_agg(row_to_json(c) ORDER BY c.count DESC), '[]'::jsonb)
  INTO countries
  FROM (
    SELECT country, COUNT(*) AS count
    FROM public.preset_views
    WHERE preset_id = p_preset_id
      AND country IS NOT NULL
      AND created_at > now() - (p_range_days || ' days')::interval
    GROUP BY country
    ORDER BY count DESC
    LIMIT 5
  ) c;

  RETURN jsonb_build_object(
    'range_days',    p_range_days,
    'total_views',   total_views,
    'total_saves',   total_saves,
    'total_shares',  total_shares,
    'total_follows', total_follows,
    'conversion_rate',
      CASE WHEN total_views > 0
        THEN ROUND(total_follows::numeric / total_views * 100, 2)
        ELSE 0
      END,
    'series',        series,
    'top_countries', countries
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_preset_analytics(uuid, int) TO authenticated;


-- ─── 16. RPC archive_preset / unarchive_preset ──────────────────────────────
-- Setter sur archived_at. Côté gratuit, archiver libère un slot du quota de 5.

CREATE OR REPLACE FUNCTION public.archive_preset(p_preset_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  UPDATE public.presets
  SET archived_at = now(), is_public = FALSE
  WHERE id = p_preset_id AND author_id = uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_preset(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.unarchive_preset(p_preset_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  active_count int;
  is_prem bool;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  is_prem := public.is_premium(uid);
  active_count := public.count_active_presets(uid);

  -- Pour les non-premium, vérifie le quota avant de désarchiver
  IF NOT is_prem AND active_count >= 5 THEN
    RAISE EXCEPTION 'quota_exceeded';
  END IF;

  UPDATE public.presets
  SET archived_at = NULL
  WHERE id = p_preset_id AND author_id = uid;

  RETURN jsonb_build_object('active_count', active_count + 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.unarchive_preset(uuid) TO authenticated;


-- ─── 17. Mise à jour de get_explore_feed avec boost premium ─────────────────
-- Override du schema_feed.sql pour intégrer le boost auto 24h sur les
-- nouveaux presets des abonnés premium. Cap à 30% des slots (top_presets * 0.3).

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
  trending     jsonb;
  rooms        jsonb;
  boosted      jsonb;
  organic      jsonb;
  boost_slots  int;
BEGIN
  -- Cap à 30% des slots pour le boost premium (min 1, max top_presets/3)
  boost_slots := GREATEST(1, top_presets / 3);

  -- 1) Slots boostés : presets publics, créés il y a <24h, par un premium
  SELECT COALESCE(jsonb_agg(t ORDER BY t.created_at DESC), '[]'::jsonb)
  INTO boosted
  FROM (
    SELECT
      p.id,
      p.name,
      p.description,
      p.game_type,
      p.cover_url,
      p.play_count,
      p.author_id,
      p.created_at,
      TRUE AS is_boosted,
      jsonb_build_object(
        'username',           pr.username,
        'avatar_url',         pr.avatar_url,
        'subscription_status', pr.subscription_status
      ) AS author
    FROM public.presets p
    JOIN public.profiles pr ON pr.id = p.author_id
    WHERE p.is_public = TRUE
      AND p.archived_at IS NULL
      AND p.created_at > now() - INTERVAL '24 hours'
      AND pr.subscription_status IN ('trialing', 'active', 'lifetime')
    ORDER BY p.created_at DESC
    LIMIT boost_slots
  ) t;

  -- 2) Slots organiques : presets publics, par play_count desc, en excluant
  -- ceux déjà dans boosted
  SELECT COALESCE(jsonb_agg(t ORDER BY t.play_count DESC), '[]'::jsonb)
  INTO organic
  FROM (
    SELECT
      p.id,
      p.name,
      p.description,
      p.game_type,
      p.cover_url,
      p.play_count,
      p.author_id,
      p.created_at,
      FALSE AS is_boosted,
      jsonb_build_object(
        'username',           pr.username,
        'avatar_url',         pr.avatar_url,
        'subscription_status', pr.subscription_status
      ) AS author
    FROM public.presets p
    LEFT JOIN public.profiles pr ON pr.id = p.author_id
    WHERE p.is_public = TRUE
      AND p.archived_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(boosted) b
        WHERE (b->>'id')::uuid = p.id
      )
    ORDER BY p.play_count DESC
    LIMIT (top_presets - boost_slots)
  ) t;

  -- Concat boostés + organiques
  trending := boosted || organic;

  -- 3) Public rooms (inchangé)
  SELECT COALESCE(jsonb_agg(r ORDER BY r.created_at DESC), '[]'::jsonb)
  INTO rooms
  FROM (
    SELECT
      r.id,
      r.game_type,
      r.phase,
      r.created_at,
      jsonb_build_object(
        'username',   pr.username,
        'avatar_url', pr.avatar_url
      ) AS host
    FROM public.game_rooms r
    LEFT JOIN public.profiles pr ON pr.id = r.host_id
    WHERE r.phase = 'lobby'
      AND COALESCE((r.config->>'is_private')::boolean, FALSE) = FALSE
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


-- ─── 17.b. Override get_following_feed (badge créateur + archived) ──────────
-- Étend la signature de retour avec author_subscription_status et exclut les
-- presets archivés. Reste compatible avec le client : nouvelle colonne en fin.

-- Drop préalable : Postgres refuse de modifier le RETURNS TABLE via
-- CREATE OR REPLACE. Idempotent grâce à IF EXISTS.
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
  payload                     jsonb
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
  WITH following AS (
    SELECT f.following_id AS uid
    FROM public.follows f
    WHERE f.follower_id = uid
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
      ) AS payload
    FROM public.presets p
    JOIN following fl ON fl.uid = p.author_id
    WHERE p.is_public = true
      AND p.archived_at IS NULL
      AND p.created_at >= since_at
      AND (before_at IS NULL OR p.created_at < before_at)
    ORDER BY p.created_at DESC
    LIMIT page_size
  ),
  result_items AS (
    SELECT
      'result'::text AS item_type,
      r.id           AS item_id,
      r.created_at,
      r.user_id      AS author_id,
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
    pr.username                    AS author_username,
    pr.avatar_url                  AS author_avatar_url,
    COALESCE(pr.subscription_status, 'free') AS author_subscription_status,
    m.payload
  FROM merged m
  LEFT JOIN public.profiles pr ON pr.id = m.author_id
  ORDER BY m.created_at DESC
  LIMIT page_size;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_following_feed(timestamptz, int) TO authenticated, anon;


-- ─── 18. Storage bucket pour bannières profil ───────────────────────────────
-- À exécuter UNE FOIS dans le SQL Editor. Si le bucket existe déjà, ignorer.

INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-banners', 'profile-banners', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Policies du bucket : tout le monde peut READ, owner peut UPLOAD/UPDATE/DELETE
DROP POLICY IF EXISTS "Banners read public" ON storage.objects;
CREATE POLICY "Banners read public" ON storage.objects
  FOR SELECT USING (bucket_id = 'profile-banners');

DROP POLICY IF EXISTS "Banners upload owner" ON storage.objects;
CREATE POLICY "Banners upload owner" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'profile-banners'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND public.is_premium(auth.uid())
  );

DROP POLICY IF EXISTS "Banners update owner" ON storage.objects;
CREATE POLICY "Banners update owner" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'profile-banners'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Banners delete owner" ON storage.objects;
CREATE POLICY "Banners delete owner" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'profile-banners'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- ─── 19. Notification type 'subscription_started' ───────────────────────────
-- Ajout d'un type de notif pour célébrer la souscription côté abonné.

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('friend_request', 'friend_accepted', 'new_referral', 'subscription_started'));
