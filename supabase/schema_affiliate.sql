-- ============================================================================
-- AFFILIATION — programme universel
-- ============================================================================
-- À exécuter dans le SQL Editor de Supabase, après schema_social.sql et
-- schema_social_v2.sql (dépendance : table notifications + profiles).
-- ============================================================================


-- ─── 1. Extension de profiles ───────────────────────────────────────────────
-- Le code d'affiliation est généré paresseusement (RPC activate_referral_program)
-- à partir du username de l'utilisateur. Modifiable a posteriori via
-- update_referral_code. Snapshot indépendant du username pour ne pas casser
-- les liens partagés en cas de renommage.
-- Les colonnes gardent le préfixe `affiliate_` (interne, non exposé en URL) ;
-- seuls les noms de RPC ont été neutralisés en `referral_*` pour éviter d'être
-- bloqués par les extensions anti-trackers (uBlock, Brave Shields, etc.).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS affiliate_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS affiliate_activated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS profiles_affiliate_code_idx
  ON public.profiles(affiliate_code) WHERE affiliate_code IS NOT NULL;


-- ─── 2. Table referrals ─────────────────────────────────────────────────────
-- Relation 1-1 immuable : qui a parrainé qui. UNIQUE sur referred_id pour
-- garantir first-click wins et empêcher la double-attribution.

CREATE TABLE IF NOT EXISTS public.referrals (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_id         uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  referral_code_used  text NOT NULL,
  source              text NOT NULL DEFAULT 'link',
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_self_referral CHECK (referrer_id <> referred_id)
);

CREATE INDEX IF NOT EXISTS referrals_referrer_idx
  ON public.referrals(referrer_id, created_at DESC);


-- ─── 3. Table referral_earnings ─────────────────────────────────────────────
-- Ledger append-only des commissions générées par les filleuls.
--
-- MODÈLE :
--   - Commission FIXE de 40 % (cf. AFFILIATE_CONFIG.COMMISSION_RATE côté TS)
--     appliquée au revenu net (après frais de paiement) perçu par GameTrend.
--   - Récurrente : 1 ligne créée chaque mois où le filleul paie son abo,
--     déclenchée par le webhook Stripe/Paddle (à brancher).
--   - Conditionnelle : si le filleul est remboursé/chargeback, la ligne
--     correspondante passe en `reversed`. Si l'abonné se désabonne,
--     simplement plus aucune nouvelle ligne n'est créée (auto-régulation).
--   - Périmètre : abonnements UNIQUEMENT (pas les achats one-shot, pour
--     limiter l'auto-fraude).
--   - eligible_at = created_at + PENDING_DAYS (30 j) pour couvrir la fenêtre
--     de chargeback.
--   - Reste vide tant que Stripe/Paddle n'est pas branché.
--
-- Voir docs/MONETIZATION.md pour le détail business.

CREATE TABLE IF NOT EXISTS public.referral_earnings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id     uuid NOT NULL REFERENCES public.referrals(id) ON DELETE CASCADE,
  amount_cents    int NOT NULL,
  currency        text NOT NULL DEFAULT 'EUR',
  source_type     text NOT NULL,
  source_id       text,
  commission_rate numeric(4,3) NOT NULL,
  status          text NOT NULL DEFAULT 'pending',
  eligible_at     timestamptz NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  created_at      timestamptz NOT NULL DEFAULT now(),
  paid_at         timestamptz,
  CONSTRAINT status_valid CHECK (status IN ('pending', 'paid', 'reversed'))
);

CREATE INDEX IF NOT EXISTS referral_earnings_ref_idx
  ON public.referral_earnings(referral_id);


-- ─── 4. RLS ─────────────────────────────────────────────────────────────────
-- Référenceur voit ses filleuls et ses earnings ; le filleul peut voir SA
-- propre ligne (utile si on affiche un jour "tu as été invité par X").
-- Aucun INSERT/UPDATE/DELETE direct : tout passe par RPC SECURITY DEFINER
-- (claim_referral) ou service role (futur webhook Stripe).

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_earnings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Voir mes filleuls" ON public.referrals;
CREATE POLICY "Voir mes filleuls" ON public.referrals
  FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

DROP POLICY IF EXISTS "Voir mes earnings" ON public.referral_earnings;
CREATE POLICY "Voir mes earnings" ON public.referral_earnings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.referrals r
      WHERE r.id = referral_id AND r.referrer_id = auth.uid()
    )
  );


-- ─── 5. Extension notifications.type ────────────────────────────────────────
-- Ajout du type 'new_referral'. On drop l'ancien CHECK puis on recrée.

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('friend_request', 'friend_accepted', 'new_referral'));


-- ─── 6. Trigger notify_new_referral ─────────────────────────────────────────
-- À chaque nouvelle ligne dans referrals, le referrer reçoit une notif
-- "new_referral" pointant sur le filleul.

CREATE OR REPLACE FUNCTION public.notify_new_referral_fn()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.notifications(user_id, type, from_user_id)
  VALUES (NEW.referrer_id, 'new_referral', NEW.referred_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_new_referral_trg ON public.referrals;
CREATE TRIGGER notify_new_referral_trg
  AFTER INSERT ON public.referrals
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_referral_fn();


-- ─── 7. RPC activate_referral_program() ────────────────────────────────────
-- Génère le code par défaut depuis le username (lowercase, normalisation
-- vers [a-z0-9_-], min 3 caractères, fallback aléatoire si collision ou
-- username trop court). Idempotent : retourne le code existant si déjà actif.
--
-- NOTE : nommé "referral_program" et non "affiliate" pour éviter le blocage
-- par les extensions anti-trackers (uBlock, Brave Shields, EasyPrivacy)
-- qui filtrent agressivement le mot "affiliate" dans les URLs.

DROP FUNCTION IF EXISTS public.activate_affiliate();

CREATE OR REPLACE FUNCTION public.activate_referral_program()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  current_code text;
  candidate text;
  uname text;
  attempt int := 0;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  SELECT affiliate_code, username INTO current_code, uname
  FROM public.profiles WHERE id = uid;

  -- Idempotence : déjà activé
  IF current_code IS NOT NULL THEN
    RETURN current_code;
  END IF;

  -- Normalisation du username : lowercase + remplacement des chars hors
  -- [a-z0-9_-] par '-'. Trim des '-' bordants. Tronqué à 30.
  candidate := lower(coalesce(uname, ''));
  candidate := regexp_replace(candidate, '[^a-z0-9_-]+', '-', 'g');
  candidate := regexp_replace(candidate, '^-+|-+$', '', 'g');
  candidate := substring(candidate, 1, 30);

  -- Si trop court après normalisation, génère aléatoire
  IF candidate IS NULL OR length(candidate) < 3 THEN
    candidate := 'r' || substr(md5(uid::text || clock_timestamp()::text), 1, 7);
  END IF;

  -- Boucle de désambiguïsation en cas de collision (max 10 essais)
  WHILE attempt < 10 LOOP
    BEGIN
      UPDATE public.profiles
      SET affiliate_code = candidate,
          affiliate_activated_at = now()
      WHERE id = uid AND affiliate_code IS NULL;

      IF FOUND THEN
        RETURN candidate;
      ELSE
        -- Quelqu'un d'autre a activé entre temps, ou collision sur unique
        SELECT affiliate_code INTO current_code
        FROM public.profiles WHERE id = uid;
        IF current_code IS NOT NULL THEN
          RETURN current_code;
        END IF;
      END IF;
    EXCEPTION WHEN unique_violation THEN
      -- Code déjà pris → suffix incrémental, puis re-essai
      attempt := attempt + 1;
      candidate := substring(candidate, 1, 28) || attempt::text;
    END;
  END LOOP;

  -- Plafond atteint → fallback aléatoire long
  candidate := 'r' || substr(md5(uid::text || clock_timestamp()::text), 1, 12);
  UPDATE public.profiles
  SET affiliate_code = candidate,
      affiliate_activated_at = now()
  WHERE id = uid AND affiliate_code IS NULL;
  RETURN candidate;
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_referral_program() TO authenticated;


-- ─── 8. RPC update_referral_code(new_code text) ─────────────────────────────
-- Renomme le code d'affiliation. Validation regex + unicité.
-- Erreur typée pour le client : 'invalid_format', 'taken', 'not_activated'.

DROP FUNCTION IF EXISTS public.update_affiliate_code(text);

CREATE OR REPLACE FUNCTION public.update_referral_code(new_code text)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  current_code text;
  normalized text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  normalized := lower(coalesce(new_code, ''));

  IF normalized !~ '^[a-z0-9_-]{3,30}$' THEN
    RAISE EXCEPTION 'invalid_format';
  END IF;

  SELECT affiliate_code INTO current_code
  FROM public.profiles WHERE id = uid;

  IF current_code IS NULL THEN
    RAISE EXCEPTION 'not_activated';
  END IF;

  -- No-op si identique
  IF current_code = normalized THEN
    RETURN current_code;
  END IF;

  BEGIN
    UPDATE public.profiles
    SET affiliate_code = normalized
    WHERE id = uid;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'taken';
  END;

  RETURN normalized;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_referral_code(text) TO authenticated;


-- ─── 9. RPC claim_referral(code text) ───────────────────────────────────────
-- Cœur de l'attribution. Idempotent et silencieux : retourne un jsonb avec
-- { success: bool, reason: text | null }, jamais d'exception bloquante côté
-- client (sauf unauthenticated).

CREATE OR REPLACE FUNCTION public.claim_referral(code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  normalized text;
  ref_id uuid;
  existing uuid;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthenticated');
  END IF;

  normalized := lower(coalesce(code, ''));
  IF normalized = '' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_code');
  END IF;

  -- Filleul déjà attribué (first-click wins)
  SELECT referrer_id INTO existing FROM public.referrals WHERE referred_id = uid;
  IF existing IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_referred');
  END IF;

  -- Résolution du code → referrer
  SELECT id INTO ref_id FROM public.profiles WHERE affiliate_code = normalized;
  IF ref_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'code_not_found');
  END IF;

  IF ref_id = uid THEN
    RETURN jsonb_build_object('success', false, 'reason', 'self_referral');
  END IF;

  INSERT INTO public.referrals(referrer_id, referred_id, referral_code_used, source)
  VALUES (ref_id, uid, normalized, 'link');

  RETURN jsonb_build_object('success', true, 'reason', null);
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_referral(text) TO authenticated;


-- ─── 10. RPC get_referral_dashboard() ───────────────────────────────────────
-- Une seule passe pour toute la page : code, KPIs, funnel des filleuls par
-- statut, liste des derniers filleuls (top 20) avec leur statut + revenu
-- déjà touché.
--
-- Funnel :
--   trialing  → en cours d'essai (potentiel mais non confirmé)
--   active    → abonné payant (commission perçue)
--   lifetime  → achat à vie (commission one-shot perçue)
--   past_due  → paiement échoué (à risque)
--   cancelled → s'est désabonné après avoir payé (perdu)
--   none      → inscrit mais jamais souscrit (lead froid)
--
-- potential_first_payment_cents : somme estimée des commissions à la
-- première facture si tous les filleuls 'trialing' convertissent. Calculé
-- depuis le plan (monthly=6.99, yearly=49, lifetime=99) car
-- subscriptions.amount_cents n'est pas encore rempli pendant le trial.

DROP FUNCTION IF EXISTS public.get_affiliate_dashboard();

CREATE OR REPLACE FUNCTION public.get_referral_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  current_code text;
  activated_at timestamptz;
  count_referrals int;
  total_paid_cents bigint;
  total_pending_cents bigint;
  funnel jsonb;
  potential_cents bigint;
  recent jsonb;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('activated', false, 'code', null);
  END IF;

  SELECT affiliate_code, affiliate_activated_at
  INTO current_code, activated_at
  FROM public.profiles WHERE id = uid;

  IF current_code IS NULL THEN
    RETURN jsonb_build_object(
      'activated', false,
      'code', null,
      'referrals_count', 0,
      'total_earned_cents', 0,
      'pending_earned_cents', 0,
      'currency', 'EUR',
      'funnel', jsonb_build_object(
        'trialing', 0, 'active', 0, 'lifetime', 0,
        'past_due', 0, 'cancelled', 0, 'none', 0
      ),
      'potential_first_payment_cents', 0,
      'recent_referrals', '[]'::jsonb
    );
  END IF;

  SELECT COUNT(*) INTO count_referrals
  FROM public.referrals WHERE referrer_id = uid;

  SELECT COALESCE(SUM(e.amount_cents), 0) INTO total_paid_cents
  FROM public.referral_earnings e
  JOIN public.referrals r ON r.id = e.referral_id
  WHERE r.referrer_id = uid AND e.status = 'paid';

  SELECT COALESCE(SUM(e.amount_cents), 0) INTO total_pending_cents
  FROM public.referral_earnings e
  JOIN public.referrals r ON r.id = e.referral_id
  WHERE r.referrer_id = uid AND e.status = 'pending';

  -- ── Sub par filleul (la plus récente, prioritaire à active > trial > lifetime > cancelled) ──
  WITH refs AS (
    SELECT r.id AS referral_id, r.referred_id
    FROM public.referrals r
    WHERE r.referrer_id = uid
  ),
  latest_subs AS (
    SELECT DISTINCT ON (s.user_id)
      s.user_id, s.plan, s.status, s.amount_cents
    FROM public.subscriptions s
    WHERE s.user_id IN (SELECT referred_id FROM refs)
    ORDER BY s.user_id, s.created_at DESC
  ),
  classified AS (
    SELECT
      refs.referred_id,
      CASE
        WHEN ls.status = 'on_trial'                        THEN 'trialing'
        WHEN ls.plan = 'lifetime' AND ls.status = 'active' THEN 'lifetime'
        WHEN ls.status IN ('active','paused')              THEN 'active'
        WHEN ls.status = 'past_due'                        THEN 'past_due'
        WHEN ls.status IN ('cancelled','expired','refunded') THEN 'cancelled'
        ELSE 'none'
      END AS bucket,
      ls.plan,
      ls.amount_cents
    FROM refs
    LEFT JOIN latest_subs ls ON ls.user_id = refs.referred_id
  )
  SELECT
    jsonb_build_object(
      'trialing',  COALESCE(SUM(CASE WHEN bucket='trialing'  THEN 1 ELSE 0 END), 0),
      'active',    COALESCE(SUM(CASE WHEN bucket='active'    THEN 1 ELSE 0 END), 0),
      'lifetime',  COALESCE(SUM(CASE WHEN bucket='lifetime'  THEN 1 ELSE 0 END), 0),
      'past_due',  COALESCE(SUM(CASE WHEN bucket='past_due'  THEN 1 ELSE 0 END), 0),
      'cancelled', COALESCE(SUM(CASE WHEN bucket='cancelled' THEN 1 ELSE 0 END), 0),
      'none',      COALESCE(SUM(CASE WHEN bucket='none'      THEN 1 ELSE 0 END), 0)
    ),
    -- Potentiel = pour chaque trial, prix prévu * 0.95 (frais LS) * 0.40 (commission)
    -- Prix par défaut depuis le plan, en fallback sur amount_cents si déjà connu.
    COALESCE(SUM(
      CASE
        WHEN bucket = 'trialing' THEN
          ROUND(
            COALESCE(NULLIF(amount_cents, 0),
              CASE plan
                WHEN 'monthly'  THEN 699
                WHEN 'yearly'   THEN 4900
                WHEN 'lifetime' THEN 9900
                ELSE 699
              END
            )::numeric * 0.95 * 0.40
          )
        ELSE 0
      END
    ), 0)::bigint
  INTO funnel, potential_cents
  FROM classified;

  -- ── Liste des 20 derniers filleuls avec statut + earned ──
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.joined_at DESC), '[]'::jsonb)
  INTO recent
  FROM (
    SELECT
      r.referred_id              AS user_id,
      p.username,
      p.avatar_url,
      r.created_at               AS joined_at,
      COALESCE((
        SELECT SUM(e.amount_cents)
        FROM public.referral_earnings e
        WHERE e.referral_id = r.id AND e.status IN ('paid','pending')
      ), 0)::bigint              AS earned_cents,
      CASE
        WHEN ls.status = 'on_trial'                        THEN 'trialing'
        WHEN ls.plan = 'lifetime' AND ls.status = 'active' THEN 'lifetime'
        WHEN ls.status IN ('active','paused')              THEN 'active'
        WHEN ls.status = 'past_due'                        THEN 'past_due'
        WHEN ls.status IN ('cancelled','expired','refunded') THEN 'cancelled'
        ELSE 'none'
      END                        AS status,
      ls.plan                    AS plan
    FROM public.referrals r
    JOIN public.profiles p ON p.id = r.referred_id
    LEFT JOIN LATERAL (
      SELECT s.plan, s.status
      FROM public.subscriptions s
      WHERE s.user_id = r.referred_id
      ORDER BY s.created_at DESC
      LIMIT 1
    ) ls ON true
    WHERE r.referrer_id = uid
    ORDER BY r.created_at DESC
    LIMIT 20
  ) x;

  RETURN jsonb_build_object(
    'activated',                     true,
    'code',                          current_code,
    'activated_at',                  activated_at,
    'referrals_count',               count_referrals,
    'total_earned_cents',            total_paid_cents,
    'pending_earned_cents',          total_pending_cents,
    'currency',                      'EUR',
    'funnel',                        funnel,
    'potential_first_payment_cents', potential_cents,
    'recent_referrals',              recent
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_referral_dashboard() TO authenticated;
