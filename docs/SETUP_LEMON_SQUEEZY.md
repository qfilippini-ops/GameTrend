# Setup Lemon Squeezy pour GameTrend Premium

> Guide pas-à-pas pour configurer le compte Lemon Squeezy nécessaire au système Premium.

---

## 1. Création du compte

1. Rendez-vous sur [lemonsqueezy.com](https://www.lemonsqueezy.com) et créez un compte.
2. Lors de l'onboarding, sélectionne :
   - Pays : **France**
   - Type d'entreprise : **Sole proprietorship / Micro-entrepreneur** (ou ce qui correspond à ton statut)
   - Renseigne ton **SIRET** comme identifiant fiscal — LS l'utilisera pour ses déclarations en tant que MoR.
3. Configure le **payout method** : virement SEPA vers ton compte pro français.
4. Crée un **store** :
   - Nom : `GameTrend`
   - URL : `gametrend.lemonsqueezy.com` (auto-générée)
   - Logo : upload le logo GameTrend
   - Brand colors : violet/magenta (matching la palette de l'app)

---

## 2. Création des 3 produits

Va dans **Store → Products → New Product**. Crée 3 produits, chacun avec une **variant unique**.

### 2.0 Réglages communs aux 3 produits

Ces champs sont identiques pour Monthly, Yearly et Lifetime. Configure-les à chaque création.

#### Tax category (catégorie fiscale) — **critique**

- Sélectionne **`Software as a Service (SaaS)`**.
- Pourquoi : c'est cette catégorie qui dit à LS quels taux de TVA / sales tax appliquer dans chaque juridiction. Mauvaise catégorie = mauvaise TVA collectée = LS qui te facture la différence plus tard.
- Pour le Lifetime aussi (même si "one-time"), garde `Software as a Service (SaaS)` : c'est de l'accès à un service numérique, pas un bien tangible.

#### Description produit

LS affiche cette description sur la page checkout et dans le reçu email. Garde-la **courte, factuelle, traduite mentalement en EN** (les acheteurs internationaux verront cette description).

| Produit | Description recommandée |
|---|---|
| Monthly | `GameTrend Premium — monthly subscription. No ads, unlimited presets, creator tools, profile analytics.` |
| Yearly | `GameTrend Premium — yearly subscription (save ~40%). No ads, unlimited presets, creator tools, profile analytics.` |
| Lifetime | `GameTrend Premium Lifetime — one-time payment, lifetime access. Limited to the first 100 supporters.` |

Évite les mentions de prix dans la description (LS l'affiche déjà), évite les emojis (rendu inégal selon clients mail).

#### Confirmation modal / Thank you page

À la fin du checkout LS, deux choix :

- **Option A (recommandée)** : `Redirect customer to a URL` → `https://gametrend.fr/fr/profile?welcome=premium`
  - Le client revient direct dans l'app, déjà loggé, et on peut afficher un toast "Bienvenue en Premium" en lisant `?welcome=premium` côté client.
  - L'app ne dépend pas de cette redirection pour activer le statut : c'est le webhook qui fait foi (déjà branché).
- **Option B (fallback)** : `Show a thank you message` avec le texte `Thanks! Your Premium access is being activated. You can close this window and return to GameTrend.`
  - À utiliser uniquement si tu n'as pas encore mis en prod la route `/profile`.

Choisis A pour les 3 produits, même URL.

#### Receipt email (reçu par courriel)

- Coche **`Send email receipts to customers`** (activé par défaut, vérifie).
- **Custom email content** : laisse vide → LS envoie son template standard avec ton logo de store + description du produit. C'est suffisant et conforme légalement (mention LS = MoR, TVA détaillée, etc.).
- **Reply-to email** : mets `support@gametrend.fr` (ou ton email perso si la boîte support n'est pas encore créée). Indispensable pour que les clients sachent où écrire en cas de souci.
- **Note importante** : ce reçu LS est le **document fiscal officiel** (LS = vendeur de droit). Notre email "welcome" envoyé via Resend depuis le webhook est un **email transactionnel produit** (onboarding), pas un reçu. Les deux sont complémentaires, pas redondants.

#### Statement descriptor (relevé bancaire)

- Mets `GAMETREND` partout (max ~22 caractères, en CAPS, sans accent).
- C'est ce que le client verra sur son relevé CB. Doit être reconnaissable instantanément pour limiter les chargebacks "transaction inconnue".

---

### Produit 1 — `GameTrend Premium Monthly`

- **Name** : `GameTrend Premium Monthly`
- **Description** : voir tableau 2.0
- **Tax category** : `Software as a Service (SaaS)`
- **Type** : Subscription
- **Pricing model** : Recurring
- **Price** : `6.99 EUR`
- **Billing interval** : Monthly
- **Trial** : `7 days` — coche **"Require payment method"** (CB obligatoire pour démarrer le trial)
- **Statement descriptor** : `GAMETREND`
- **Confirmation** : Redirect → `https://gametrend.fr/fr/profile?welcome=premium`
- **Receipt email** : activé, reply-to `support@gametrend.fr`
- **Status** : Published

### Produit 2 — `GameTrend Premium Yearly`

- **Name** : `GameTrend Premium Yearly`
- **Description** : voir tableau 2.0
- **Tax category** : `Software as a Service (SaaS)`
- **Type** : Subscription
- **Pricing model** : Recurring
- **Price** : `49.00 EUR`
- **Billing interval** : Yearly
- **Trial** : `7 days` — coche **"Require payment method"**
- **Statement descriptor** : `GAMETREND`
- **Confirmation** : Redirect → `https://gametrend.fr/fr/profile?welcome=premium`
- **Receipt email** : activé, reply-to `support@gametrend.fr`
- **Status** : Published

### Produit 3 — `GameTrend Premium Lifetime`

- **Name** : `GameTrend Premium Lifetime`
- **Description** : voir tableau 2.0
- **Tax category** : `Software as a Service (SaaS)`
- **Type** : Single payment (one-time, NOT subscription)
- **Price** : `99.00 EUR`
- **Trial** : aucun
- **Statement descriptor** : `GAMETREND`
- **Confirmation** : Redirect → `https://gametrend.fr/fr/profile?welcome=premium`
- **Receipt email** : activé, reply-to `support@gametrend.fr`
- **Status** : Published

Note les **Variant IDs** des 3 (visible dans Variants → ID column, format chiffré). Tu en auras besoin pour les variables d'env.

---

## 3. Multi-devise (optionnel mais recommandé)

Va dans **Settings → Currencies** et active :
- USD (auto-conversion EUR → USD au taux du jour)
- GBP (auto-conversion EUR → GBP)

LS gère automatiquement la conversion au moment du checkout selon la géoloc de l'acheteur.

---

## 4. Webhook

Va dans **Settings → Webhooks → New Webhook**.

- **URL** : `https://gametrend.fr/api/webhooks/lemon` (ou `https://<your-vercel-preview>.vercel.app/api/webhooks/lemon` pour les previews)
- **Signing Secret** : génère un secret aléatoire fort (LS te le proposera). **Copie-le immédiatement**, il ne sera plus affiché.
- **Events à écouter** (coche tout ce qui suit) :
  - `subscription_created`
  - `subscription_updated`
  - `subscription_cancelled`
  - `subscription_resumed`
  - `subscription_expired`
  - `subscription_paused`
  - `subscription_unpaused`
  - `subscription_payment_success`
  - `subscription_payment_failed`
  - `subscription_payment_recovered`
  - `subscription_payment_refunded`
  - `order_created` (pour le lifetime)
  - `order_refunded` (refund lifetime)

---

## 5. Customer Portal (gestion abo côté client)

LS fournit nativement un portail client (changement de CB, annulation, factures). Pour l'activer :

- Va dans **Settings → Customer Portal**.
- Active toutes les options : `Allow customers to update payment methods`, `Allow cancellations`, `Show invoice history`.
- Customise le branding (logo, couleurs).

L'URL du portail pour un abonné donné se génère via l'API : `GET /v1/customers/{id}` retourne un champ `urls.customer_portal`.

---

## 6. API Key

Va dans **Settings → API → Create API key**.

- Nom : `gametrend-prod`
- Scope : full access (ou restreindre à Read/Write subscriptions/orders/customers si dispo)
- **Copie la clé immédiatement**.

---

## 7. Récap des valeurs à mettre dans `.env.local`

```env
LEMON_API_KEY=lemon_squeezy_key_xxxxxxxxxxxxx
LEMON_STORE_ID=12345
LEMON_WEBHOOK_SECRET=ton_secret_long_et_aleatoire
LEMON_VARIANT_ID_MONTHLY=678901
LEMON_VARIANT_ID_YEARLY=678902
LEMON_VARIANT_ID_LIFETIME=678903
```

Pour récupérer le **store ID** : visible dans Settings → Store → URL ou via l'API `GET /v1/stores`.

---

## 8. Mode test

Active le **Test mode** dans le bandeau en haut du dashboard pendant le développement. Tous les events test n'affectent pas la prod.

Les cartes de test fonctionnent comme Stripe :
- Succès : `4242 4242 4242 4242`
- Échec auto : `4000 0000 0000 0002`
- 3DS forcé : `4000 0027 6000 3184`

Pour tester en local sans HTTPS, utilise [ngrok](https://ngrok.com) :

```bash
ngrok http 3000
# Récupère l'URL https://xxxxxx.ngrok-free.app
# Configure-la dans Settings → Webhooks → ton webhook test
```

---

## 9. Checklist de validation

- [ ] Compte LS créé avec SIRET français
- [ ] Store GameTrend brandé
- [ ] Produit Monthly 6,99€ + trial 7j avec CB
- [ ] Produit Yearly 49€ + trial 7j avec CB
- [ ] Produit Lifetime 99€ one-time
- [ ] Tax category `Software as a Service (SaaS)` sur les 3 produits
- [ ] Description renseignée sur les 3 produits (en EN)
- [ ] Confirmation = Redirect vers `gametrend.fr/fr/profile?welcome=premium` sur les 3 produits
- [ ] Receipt email activé + reply-to `support@gametrend.fr` sur les 3 produits
- [ ] Multi-devise EUR/USD/GBP activé
- [ ] Webhook configuré avec les 13 events listés
- [ ] Customer Portal activé
- [ ] API key générée et copiée
- [ ] Toutes les valeurs reportées dans `.env.local`

---

## 10. À faire en prod (avant lancement public)

- Désactiver le Test mode
- Reconfigurer le webhook sur le domaine de prod (https://gametrend.fr/api/webhooks/lemon)
- Reconfigurer l'API key prod si différente du test
- Tester un vrai paiement avec ta carte (et l'annuler dans la fenêtre 14j si tu veux le rembourser)
- Vérifier les emails LS reçus côté client
