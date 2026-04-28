-- ============================================================================
-- ADMIN — Suivi des coûts, revenus et usage (dashboard interne)
-- ============================================================================
-- Dépendances : schema.sql (profiles), schema_subscription.sql
-- À exécuter dans le SQL Editor de Supabase APRÈS les schémas précédents.
-- ============================================================================
--
-- MODÈLE :
--   - usage_log         : append-only, 1 ligne par appel d'un service tiers
--                         (OpenAI, Sightengine, Resend, LiveKit). Permet de
--                         calculer un cost-per-feature précis.
--   - cost_snapshots    : agrégats de coûts par jour et par service (alimenté
--                         par cron quotidien depuis APIs externes Vercel/
--                         OpenAI). Évite de re-fetcher les APIs à chaque load.
--   - revenue_snapshots : agrégats de revenus par jour et par source (Lemon,
--                         AdSense). Lemon est rempli en temps réel par le
--                         webhook ; AdSense en saisie manuelle ou cron.
--
-- AUCUN role applicatif "admin" en base : l'autorisation se fait côté Next.js
-- via la variable d'env ADMIN_USER_IDS (CSV de UUIDs auth.users.id). Toutes
-- les tables ci-dessous sont en RLS DENY pour les rôles `authenticated` et
-- `anon` ; seules les routes API server-side avec `createAdminClient()`
-- (service_role) peuvent les lire/écrire.
-- ============================================================================


-- ─── 1. Table usage_log ─────────────────────────────────────────────────────
-- Append-only. 1 ligne par appel à un service tiers facturable. Permet de
-- savoir QUELLE feature consomme QUOI au centime près, indépendamment des
-- APIs de billing externes (qui ont 24-48h de latence).
--
-- event_type :
--   • openai_navi          → 1 appel Navi (Outbid)
--   • sightengine_check    → 1 image modérée
--   • resend_email         → 1 email envoyé
--   • livekit_token_mint   → 1 join vocal (proxy minutes audio)
--
-- units / unit_cost_micros :
--   • Pour openai_navi  : units = total tokens, unit_cost_micros = $/M tokens
--                         calculé d'après pricing.ts puis converti micro-USD.
--   • Pour les autres   : units = 1, unit_cost_micros = coût unitaire.
--
-- estimated_cost_micros : units × unit_cost_micros (snapshot du tarif au
-- moment de l'appel, pour ne pas dépendre des fluctuations futures).

CREATE TABLE IF NOT EXISTS public.usage_log (
  id                      bigserial PRIMARY KEY,
  event_type              text NOT NULL,
  user_id                 uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  units                   numeric NOT NULL DEFAULT 1,
  unit_cost_micros        bigint  NOT NULL DEFAULT 0,
  estimated_cost_micros   bigint  NOT NULL DEFAULT 0,
  currency                text    NOT NULL DEFAULT 'USD',
  metadata                jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT usage_log_event_type_check CHECK (event_type IN (
    'openai_navi',
    'sightengine_check',
    'resend_email',
    'livekit_token_mint'
  ))
);

CREATE INDEX IF NOT EXISTS usage_log_event_created_idx
  ON public.usage_log(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS usage_log_created_idx
  ON public.usage_log(created_at DESC);
CREATE INDEX IF NOT EXISTS usage_log_user_idx
  ON public.usage_log(user_id) WHERE user_id IS NOT NULL;

ALTER TABLE public.usage_log ENABLE ROW LEVEL SECURITY;
-- Pas de policy : seul service_role peut lire/écrire.


-- ─── 2. Table cost_snapshots ────────────────────────────────────────────────
-- Agrégats quotidiens de coûts par service. Alimenté par cron quotidien
-- (`/api/admin/cron/daily-snapshot`) qui :
--   • interroge les APIs Vercel / OpenAI / Resend pour le jour J-1
--   • ajoute les coûts fixes mensuels au prorata journalier (Hostinger,
--     domaine, frais comptable…)
--   • aggrège usage_log pour cross-check
--
-- service : vercel, supabase, openai, sightengine, resend, livekit_vps,
--           hostinger_domain, comptable, autre
-- amount_cents : coût en centimes de la devise (généralement EUR)
-- source       : "api" (récupéré automatiquement) ou "manual" (saisie)

CREATE TABLE IF NOT EXISTS public.cost_snapshots (
  id              bigserial PRIMARY KEY,
  snapshot_date   date    NOT NULL,
  service         text    NOT NULL,
  amount_cents    bigint  NOT NULL DEFAULT 0,
  currency        text    NOT NULL DEFAULT 'EUR',
  source          text    NOT NULL DEFAULT 'manual',
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cost_snapshots_source_check CHECK (source IN ('api', 'manual', 'cron', 'fixed')),
  UNIQUE (snapshot_date, service)
);

CREATE INDEX IF NOT EXISTS cost_snapshots_date_idx
  ON public.cost_snapshots(snapshot_date DESC);

ALTER TABLE public.cost_snapshots ENABLE ROW LEVEL SECURITY;
-- Pas de policy : seul service_role peut lire/écrire.


-- ─── 3. Table revenue_snapshots ─────────────────────────────────────────────
-- Agrégats quotidiens de revenus par source.
--   • lemon_squeezy : alimenté par cron qui agrège la table `subscriptions`
--   • adsense       : saisie manuelle dans /admin/dashboard (Google a 24-48h
--                     de latence et l'API OAuth est lourde, on saisit le
--                     chiffre du mois précédent une fois par mois)
--   • autre         : revenus annexes éventuels (sponsoring, etc.)

CREATE TABLE IF NOT EXISTS public.revenue_snapshots (
  id              bigserial PRIMARY KEY,
  snapshot_date   date    NOT NULL,
  source          text    NOT NULL,
  amount_cents    bigint  NOT NULL DEFAULT 0,
  currency        text    NOT NULL DEFAULT 'EUR',
  fees_cents      bigint  NOT NULL DEFAULT 0,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT revenue_snapshots_source_check CHECK (source IN (
    'lemon_squeezy', 'adsense', 'sponsoring', 'autre'
  )),
  UNIQUE (snapshot_date, source)
);

CREATE INDEX IF NOT EXISTS revenue_snapshots_date_idx
  ON public.revenue_snapshots(snapshot_date DESC);

ALTER TABLE public.revenue_snapshots ENABLE ROW LEVEL SECURITY;
-- Pas de policy : seul service_role peut lire/écrire.


-- ─── 4. Helper agrégat usage_log par mois et par event_type ─────────────────
-- Utilisé par le dashboard pour afficher le compteur d'usage du mois courant
-- sans avoir à scanner la table à la main côté Next.js.

CREATE OR REPLACE FUNCTION public.admin_usage_summary(
  p_start  timestamptz,
  p_end    timestamptz
)
RETURNS TABLE (
  event_type            text,
  total_units           numeric,
  total_cost_micros     bigint,
  call_count            bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    event_type,
    COALESCE(SUM(units), 0)                 AS total_units,
    COALESCE(SUM(estimated_cost_micros), 0) AS total_cost_micros,
    COUNT(*)                                AS call_count
  FROM public.usage_log
  WHERE created_at >= p_start AND created_at < p_end
  GROUP BY event_type;
$$;

-- Pas d'EXEC GRANT à authenticated/anon : appelée uniquement via service_role
-- depuis les routes admin.
REVOKE ALL ON FUNCTION public.admin_usage_summary(timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;


-- ─── 5. Helper agrégat revenus + coûts par mois ─────────────────────────────
-- Renvoie {revenus, coûts, marge} agrégés sur la fenêtre temporelle.

CREATE OR REPLACE FUNCTION public.admin_pnl_summary(
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
  total_revenue_cents bigint;
  total_fees_cents    bigint;
  total_cost_cents    bigint;
  by_revenue          jsonb;
  by_cost             jsonb;
BEGIN
  SELECT
    COALESCE(SUM(amount_cents), 0),
    COALESCE(SUM(fees_cents), 0)
  INTO total_revenue_cents, total_fees_cents
  FROM public.revenue_snapshots
  WHERE snapshot_date >= p_start::date AND snapshot_date < p_end::date;

  SELECT COALESCE(SUM(amount_cents), 0)
  INTO total_cost_cents
  FROM public.cost_snapshots
  WHERE snapshot_date >= p_start::date AND snapshot_date < p_end::date;

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.amount_cents DESC), '[]'::jsonb)
  INTO by_revenue
  FROM (
    SELECT
      source,
      SUM(amount_cents) AS amount_cents,
      SUM(fees_cents)   AS fees_cents
    FROM public.revenue_snapshots
    WHERE snapshot_date >= p_start::date AND snapshot_date < p_end::date
    GROUP BY source
  ) r;

  SELECT COALESCE(jsonb_agg(row_to_json(c) ORDER BY c.amount_cents DESC), '[]'::jsonb)
  INTO by_cost
  FROM (
    SELECT service, SUM(amount_cents) AS amount_cents
    FROM public.cost_snapshots
    WHERE snapshot_date >= p_start::date AND snapshot_date < p_end::date
    GROUP BY service
  ) c;

  RETURN jsonb_build_object(
    'total_revenue_cents', total_revenue_cents,
    'total_fees_cents',    total_fees_cents,
    'total_cost_cents',    total_cost_cents,
    'gross_margin_cents',  total_revenue_cents - total_fees_cents - total_cost_cents,
    'by_revenue',          by_revenue,
    'by_cost',             by_cost
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_pnl_summary(timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
