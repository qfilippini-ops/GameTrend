# Admin Dashboard — Suivi coûts & revenus

Dashboard interne pour suivre **en temps réel** les coûts et revenus de
GameTrend, sans dépendre exclusivement des APIs externes (Vercel, OpenAI,
AdSense…) qui ont 24-48h de latence.

URL : **`/fr/admin/dashboard`** (ou `/en/admin/dashboard`).

## Itération 1 (livrée)

### Fonctionnalités

- **KPI cards** : MRR, MAU, marge brute du mois, coût par MAU
- **Revenus** du mois : Lemon Squeezy (brut, fees estimés à 5% + 0,46€), revenus
  manuels (AdSense / sponsoring / autre), net total
- **Coûts** du mois : fixes mensuels au prorata journalier (VPS, domaine,
  Vercel, Supabase) + variables consommés (depuis `usage_log`) + snapshots cron
- **Usage** par service : nombre d'appels, unités, coût EUR pour OpenAI Navi,
  Sightengine, Resend, LiveKit
- **Saisie manuelle** : formulaire pour entrer un revenu AdSense (ou autre) à
  une date donnée. Upsert sur `(date, source)`

### Architecture

```
/admin/dashboard (Server Component)
└── requireAdmin() (lib/admin/auth.ts)
    └── ADMIN_USER_IDS (.env, CSV de UUIDs auth.users.id)

GET /api/admin/dashboard/data
└── Agrège : profiles, subscriptions, usage_log, cost_snapshots,
    revenue_snapshots → JSON

POST /api/admin/dashboard/manual-revenue
└── Upsert revenue_snapshots (saisie AdSense)

usage_log (Supabase, append-only)
├── openai_navi          → src/app/api/games/outbid/navi/route.ts
├── sightengine_check    → src/app/actions/moderate.ts
├── resend_email         → src/lib/email/resend.ts
└── livekit_token_mint   → src/app/api/livekit/token/route.ts
```

### Sécurité

- Toutes les tables `usage_log`, `cost_snapshots`, `revenue_snapshots` sont en
  **RLS sans policy** : seul le `service_role` peut lire/écrire.
- Pas de colonne `is_admin` en BD : la liste est dans **`ADMIN_USER_IDS`** (env
  Vercel CSV de UUIDs).
- Si l'utilisateur n'est pas admin → `notFound()` (404 opaque, pas 403, pour
  ne pas révéler que la route existe).

## Mise en place

### 1. Appliquer le schéma

Dans Supabase SQL Editor :

```sql
-- Copier-coller le contenu de supabase/schema_admin_v1.sql
```

### 2. Récupérer ton user_id

Toujours dans Supabase SQL Editor :

```sql
SELECT id FROM auth.users WHERE email = 'ton.email@gametrend.fr';
```

### 3. Configurer les env Vercel

Dans Vercel → Project → Settings → Environment Variables (Production +
Preview) :

```
ADMIN_USER_IDS=<uuid-récupéré-en-2>
SIGHTENGINE_API_USER=<si pas déjà set>
SIGHTENGINE_API_SECRET=<si pas déjà set>
```

Tu peux mettre plusieurs UUIDs séparés par des virgules :
`ADMIN_USER_IDS=uuid1,uuid2`

### 4. Redéployer

```bash
git push
```

Vercel redéploie automatiquement. Une fois en ligne, va sur
`https://gametrend.fr/fr/admin/dashboard` (en étant connecté avec le compte
dont l'UUID est dans `ADMIN_USER_IDS`).

## Itération 2 (à venir)

- **Vercel Cron** quotidien `/api/admin/cron/daily-snapshot` qui :
  - Fetch Vercel REST API → bandwidth + invocations facturables
  - Fetch OpenAI Usage API → cross-check avec `usage_log`
  - Fetch Resend stats → quota restant
  - Reconcile `subscriptions` → `revenue_snapshots`
- Variables d'env : `VERCEL_API_TOKEN`, `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID`
- Suppression du cast `as any` dans `usage-log.ts` et `manual-revenue/route.ts`
  une fois `Database` regénéré (`supabase gen types typescript --linked`)

## Itération 3 (à venir)

- Graph 12 mois revenus vs coûts (lib `recharts`)
- Cost-per-feature : breakdown granulaire par feature (Navi vs vocal vs
  modération…)
- Projections linéaires : "profitable dans X mois si croissance maintenue"
- Saisie manuelle élargie : cash dispo (pour calculer le runway), revenus
  exceptionnels

## Tarifs en config

Les tarifs des services tiers sont centralisés dans
[`src/lib/admin/pricing.ts`](../src/lib/admin/pricing.ts). À mettre à jour
manuellement si :

- Tu changes de modèle OpenAI dans `NAVI_MODEL`
- Lemon Squeezy change ses frais MoR
- Tu passes en SASU et ajoutes les frais comptables (~50€/mois)
- Le taux USD/EUR diverge significativement (`USD_TO_EUR`)

## Précision attendue

| Type           | Précision | Source                             |
|----------------|-----------|-------------------------------------|
| MRR / ARR      | ±0%       | `profiles.subscription_status` live |
| MAU            | ±0%       | `profiles.last_seen_at` (heartbeat) |
| Revenus Lemon  | ±0%       | `subscriptions` (webhook)           |
| Coûts fixes    | exact     | Constantes en config (vérifier 1×/mois) |
| OpenAI         | ±5%       | Tarifs nano peuvent évoluer ; cross-check via Usage API en itération 2 |
| Sightengine    | ±10%      | Tarif exact dépend de ton plan      |
| Resend         | ±0% sous quota | $0 jusqu'à 3000/mois, 0,4 micro$/email au-delà |
| AdSense        | manuel    | Saisie via formulaire admin         |
| Vercel         | ±10%      | Estimation Pro $20/mois, à automatiser via API en itération 2 |
