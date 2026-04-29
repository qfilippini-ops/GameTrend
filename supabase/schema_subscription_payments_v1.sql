-- ============================================================================
-- SUBSCRIPTION PAYMENTS — Historique fiable des paiements Lemon Squeezy
-- ============================================================================
-- Dépendances : schema.sql, schema_subscription.sql
-- À exécuter dans le SQL Editor de Supabase APRÈS les schémas précédents.
-- ============================================================================
--
-- POURQUOI :
--   La table `subscriptions` actuelle utilise un upsert sur ls_subscription_id
--   (UNIQUE) : chaque sub Lemon = 1 row, mise à jour à chaque event. C'est
--   parfait pour conserver l'état courant, mais ça **perd l'historique des
--   paiements** :
--     • Une sub monthly créée en janvier qui paie chaque mois → la row est
--       mise à jour, on ne voit que le DERNIER paiement (et toujours avec
--       le created_at de janvier).
--     • Le compteur "transactions du mois" basé sur subscriptions.created_at
--       inclut aussi les subs créées mais jamais payées (trial annulé,
--       checkout abandonné), avec amount_cents = 0.
--
--   Cette table résout les deux problèmes : 1 row par paiement effectif,
--   immuable, idempotente via ls_invoice_id UNIQUE.
--
-- INVARIANT :
--   Pour calculer un revenu mensuel correct :
--     SELECT SUM(amount_cents) FROM subscription_payments
--     WHERE paid_at >= '2026-04-01' AND paid_at < '2026-05-01';
--
-- ============================================================================


CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id                  bigserial PRIMARY KEY,
  user_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription_id     uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  ls_invoice_id       text UNIQUE NOT NULL,
  ls_subscription_id  text,
  ls_order_id         text,
  plan                text NOT NULL,
  amount_cents        bigint NOT NULL DEFAULT 0,
  currency            text NOT NULL DEFAULT 'EUR',
  paid_at             timestamptz NOT NULL DEFAULT now(),
  raw_event           jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscription_payments_plan_check
    CHECK (plan IN ('monthly', 'yearly', 'lifetime'))
);

CREATE INDEX IF NOT EXISTS subscription_payments_user_idx
  ON public.subscription_payments(user_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS subscription_payments_paid_idx
  ON public.subscription_payments(paid_at DESC);
CREATE INDEX IF NOT EXISTS subscription_payments_plan_paid_idx
  ON public.subscription_payments(plan, paid_at DESC);

ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Voir mes paiements" ON public.subscription_payments;
CREATE POLICY "Voir mes paiements" ON public.subscription_payments
  FOR SELECT USING (auth.uid() = user_id);

-- Pas de policy INSERT/UPDATE/DELETE : toutes les écritures se font via
-- service_role depuis le webhook Lemon.


-- ─── Helper agrégat revenus par mois ────────────────────────────────────────
-- Utilisé par le dashboard admin pour ne pas devoir refaire la GROUP BY
-- côté Next.js. Retourne le breakdown par plan sur la fenêtre temporelle.

CREATE OR REPLACE FUNCTION public.admin_payments_summary(
  p_start  timestamptz,
  p_end    timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_cents       bigint;
  payment_count     bigint;
  by_plan           jsonb;
BEGIN
  SELECT
    COALESCE(SUM(amount_cents), 0),
    COUNT(*)
  INTO total_cents, payment_count
  FROM public.subscription_payments
  WHERE paid_at >= p_start AND paid_at < p_end;

  SELECT COALESCE(jsonb_object_agg(plan, amount_cents), '{}'::jsonb)
  INTO by_plan
  FROM (
    SELECT plan, SUM(amount_cents)::bigint AS amount_cents
    FROM public.subscription_payments
    WHERE paid_at >= p_start AND paid_at < p_end
    GROUP BY plan
  ) p;

  RETURN jsonb_build_object(
    'total_cents',   total_cents,
    'payment_count', payment_count,
    'by_plan',       by_plan
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_payments_summary(timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
