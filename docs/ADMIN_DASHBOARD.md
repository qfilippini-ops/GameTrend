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

## Itération 2 (livrée) — Cron quotidien + APIs externes

### Fonctionnalités

- **Vercel Cron** `/api/admin/cron/daily-snapshot` qui tourne **chaque jour à
  03:00 UTC** (`vercel.json`). Snapshot J-1 (la veille en UTC).
- **Bouton "Lancer le snapshot"** dans `/admin/dashboard` pour
  déclencher manuellement (backfill, test, force re-run après changement de
  tarifs).
- **4 sources persistées en parallèle** :
  - `integrations/vercel.ts` → `cost_snapshots(service='vercel')` via Vercel
    REST API si `VERCEL_API_TOKEN` est set, sinon fallback sur le tarif fixe.
  - `integrations/openai.ts` → `cost_snapshots(service='openai')` via Usage
    API. Utilise `OPENAI_ADMIN_KEY` si défini (granularité par modèle), sinon
    fallback `OPENAI_API_KEY` sur le legacy `/v1/usage?date=`.
  - `integrations/lemon.ts` → `revenue_snapshots(source='lemon_squeezy')`
    en agrégeant la table `subscriptions` du jour (source de vérité = BD
    locale, pas l'API Lemon).
  - `integrations/fixed-costs.ts` → `cost_snapshots` pour chaque service de
    `FIXED_MONTHLY_COSTS_EUR`, valeur = `monthly_cents / daysInMonth`.
- **Pas de double-comptage** : la route `/api/admin/dashboard/data` privilégie
  les snapshots quand ils existent et utilise un "filler prorata" uniquement
  pour les jours non encore snapshotés (typiquement la journée en cours, le
  cron ne tournant que pour J-1).

### Sécurité du cron

- Vercel Cron envoie automatiquement `Authorization: Bearer ${CRON_SECRET}`
  si la variable est définie au niveau du projet Vercel.
- En production, l'absence du header → **404 opaque** (pas 401/403, pour ne
  pas révéler que la route existe).
- En preview/dev local sans `CRON_SECRET` → l'endpoint est accessible (pour
  faciliter les tests).
- Le déclenchement manuel `/api/admin/cron/run` requiert `requireAdmin()`
  (ADMIN_USER_IDS), 404 sinon.

### Variables d'env à ajouter (Vercel Production + Preview)

```
CRON_SECRET=<openssl rand -hex 32>
VERCEL_API_TOKEN=<si tu veux le suivi auto Vercel>
VERCEL_TEAM_ID=<si compte team>
VERCEL_PROJECT_ID=<id du projet GameTrend>
OPENAI_ADMIN_KEY=<sk-admin-... si tu veux la granularité par modèle>
```

Tu peux activer le cron sans `VERCEL_API_TOKEN` ni `OPENAI_ADMIN_KEY` : les
snapshots de fixes + la reconciliation Lemon fonctionnent toujours, et les
chiffres OpenAI continuent d'être tracés via `usage_log` (logging maison).

### Activation

1. Push le code sur main
2. Vercel détecte automatiquement `vercel.json` et configure le cron
3. Vérifier dans Vercel → Project → Settings → Cron Jobs que la tâche est
   listée comme "Enabled"
4. Tester immédiatement via le bouton "Lancer le snapshot" dans
   `/admin/dashboard` → vérifier que `cost_snapshots` se remplit

### Limitations connues

- **Vercel API** : l'endpoint d'usage par jour n'est pas publiquement
  documenté de façon stable. Le code fait un best-effort et fallback proprement
  si l'API change. Les chiffres exacts restent dans le dashboard Vercel.
- **OpenAI Usage API legacy** : le coût exact n'est pas renvoyé, on le
  recalcule d'après les tarifs gpt-5-nano hardcodés dans `pricing.ts`. Si
  tu utilises plusieurs modèles, divergence possible (±5%). L'admin key
  contourne ce problème.
- **Cast `as any`** dans `usage-log.ts`, `manual-revenue/route.ts`,
  `lemon.ts`, `fixed-costs.ts` parce que les nouvelles tables ne sont pas
  dans `Database`. À supprimer après `supabase gen types typescript --linked`.

## Itération 3 (à venir)

- Graph 12 mois revenus vs coûts (lib `recharts`)
- Cost-per-feature : breakdown granulaire par feature (Navi vs vocal vs
  modération…)
- Projections linéaires : "profitable dans X mois si croissance maintenue"
- Saisie manuelle élargie : cash dispo (pour calculer le runway), revenus
  exceptionnels


## Simulateur de scale

URL : **`/fr/admin/simulator`** (lien depuis le dashboard).

### Objectif

Permettre de jouer sur les paramètres (audience, conversion, mix, tarifs,
coûts) pour anticiper la rentabilité à différentes échelles. Tous les
calculs sont réalisés côté client en pure-functional, recalcul en temps réel
à chaque changement.

### Variables paramétrables

- **Audience** : total comptes, % MAU
- **Conversion premium** : % MAU → premium, % via affilié, taux de
  commission affilié
- **Mix** : monthly / yearly / lifetime (somme normalisée à 100%) +
  taux d'acquisition lifetime mensuel
- **Tarifs** : prix monthly/yearly/lifetime
- **Coûts variables** : coût Navi par premium, modération par MAU, emails,
  voice bandwidth, storage
- **Pub** : RPM AdSense, pages vues par free, slots par page, taux de
  consentement RGPD
- **Coûts fixes** : paliers Vercel (Hobby/Pro/Enterprise), Supabase
  (Free/Pro/Team), Hostinger (KVM2/4/8/Cloud), autres

### Sorties calculées

- Composition (MAU, premium par plan, acquis via affilié)
- Revenus : MRR monthly, MRR yearly (annualisé), lifetime ce mois, AdSense,
  fees Lemon, commissions affiliés, net total
- Coûts variables détaillés
- Coûts fixes détaillés
- Synthèse : marge brute (€ et %), ARPU, ARPPU, coût/MAU, coût/premium
- **Warnings de paliers** : si un plan d'infra va saturer (ex: MAU dépasse
  100k sur Supabase Pro), le simulateur l'indique en jaune

### Persistance

Les paramètres sont **sauvegardés automatiquement dans le localStorage**
(`gt_admin_simulator_v1`) pour persister entre les sessions. Bouton
"Réinitialiser" pour revenir aux valeurs par défaut.

### Pré-remplissage avec valeurs réelles

Bouton **"Charger valeurs actuelles"** → fetch `/api/admin/simulator/baseline`
qui calcule depuis Supabase :
- Total comptes, MAU, % conversion réels
- Mix monthly/yearly/lifetime des premium actifs
- Coûts variables effectifs sur les 30 derniers jours (depuis `usage_log`),
  divisés par MAU/premium pour avoir des ratios par utilisateur

Ça permet de partir d'une baseline 100% fidèle puis de jouer "et si j'avais
10× plus d'utilisateurs ?".

### Hypothèses simplificatrices

- Le **MRR yearly** est annualisé / 12 (lissé sur 12 mois, ne reflète pas
  le pic encaissement à la souscription)
- Les **commissions affiliés** sont calculées sur le NET (gross - 5% Lemon),
  comme dans `webhooks/lemon/route.ts`
- Les **paliers Hostinger** ont une capacité voice estimée (50/120/300/600
  participants simultanés) à ajuster selon tes mesures réelles
- Les **bandwidth Vercel** sont estimés à 50 KB/page vue (front simple),
  6 invocations/page (1 Next page + 5 API)
- Les **lifetime cumulés** sont supposés rester actifs ad vitam (pas de
  churn modélisé)

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
