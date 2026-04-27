# Stratégie de monétisation GameTrend

> Document de référence interne. À jour : avril 2026.
> Source de vérité unique pour les décisions produit/business autour de l'abonnement et de l'affiliation.

---

## 1. Modèle d'affiliation

### Mécanisme retenu

- **Commission fixe : 40 %** des revenus nets (après frais de paiement) générés par chaque filleul.
- **Récurrente** : versée chaque mois tant que le filleul paie son abonnement.
- **Conditionnelle** : aucune commission si le filleul se désabonne, est remboursé, fait un chargeback ou ne paye plus pour quelque raison que ce soit. Modèle auto-régulé : pas d'argent qui dort, pas d'asymétrie défavorable à la plateforme.
- **Périmètre** : abonnements uniquement (pas les éventuels achats one-shot, pour limiter le vecteur de fraude par auto-achat).
- **Fenêtre de validation** : 30 jours en `pending` avant passage en `paid` (couvre la fenêtre de chargeback Stripe / remboursement client).
- **Seuil de payout** : 25 € cumulés minimum pour déclencher un virement.
- **Plafond mensuel sans review humaine** : 5 000 €/mois/affilié. Au-delà → validation manuelle.

### Pourquoi 40 % et pas 30 %

Notre LTV brute estimée par abonné est ~93 € (mix 5,45 € net × 17 mois). À 40 %, on reverse ~37 € sur la durée de vie, marge nette ~56 € par abonné acquis via affilié. On reste très largement bénéficiaire (marge > 60 %), et le 40 % nous positionne au-dessus du standard B2C (15-25 % récurrent) pour attirer les créateurs gaming sur YouTube/Twitch/TikTok.

### Anti-fraude

- L'auto-fraude est économiquement absurde : un faux compte qui s'abonne paye 6,99 € HT pour récupérer 2,46 € (perte nette ~4,53 €/mois côté fraudeur, après TVA payée par lui). Aucune motivation économique.
- La fraude par carte volée est gérée par Stripe/Paddle (chargeback) → la commission `paid` est révoquée automatiquement (`status = 'reversed'`).
- Pas d'anti-fraude lourd au lancement. À reconsidérer si on observe des patterns suspects sur > 100 affiliés actifs.

---

## 2. Stratégie d'abonnement

### Format unique recommandé

**1 seul palier d'abo** au lancement. Le 2-palier (4,99 / 9,99) crée un paradoxe du choix qui réduit la conversion totale, et il dilue le message marketing.

### Pricing cible

- **Mensuel** : 6,99 € **HT** (hors taxes — prix avant TVA du pays de l'acheteur)
- **Annuel** : 49 € **HT** (équivaut à 4,08 €/mois HT, soit -42 % vs mensuel)
- **Essai gratuit** : 7 jours sans CB (multiplicateur de conversion ×2 à ×3)

> ⚠️ **Tous les prix de cette doc sont HT.** Lemon Squeezy (Merchant of Record) collecte
> automatiquement la TVA du pays de l'acheteur **par-dessus** ce prix. Exemples :
> France 20 % → user paie 8,39 € TTC, plateforme touche 6,99 € HT moins frais LS.
> Allemagne 19 %, Espagne 21 %, Royaume-Uni 20 %, USA 0 % (sales tax variable selon État).
> La TVA n'apparaît jamais comme un coût pour la plateforme, c'est LS qui la reverse.

### Net plateforme par abonné

| Source | Brut HT | Frais Lemon Squeezy (5 % + 0,50 €) | Net après MoR |
|---|---|---|---|
| Mensuel 6,99 € HT | 6,99 € | -0,85 € | **~6,14 €** |
| Annuel 49 € HT | 49 € | -2,95 € | **~46,05 €** (~3,84 €/mois) |
| Mix attendu (~70/30) | — | — | **~5,45 €/mois** |

### Positionnement marketing

**"Fais grandir tes presets et mesure leur impact"**, pas "passe Premium pour enlever les pubs".

Notre segment payant principal = **les créateurs de presets**, pas les consommateurs passifs. Benchmarks : créateurs convertissent à 5-10 %, consommateurs à 0,3-0,8 %. Mix pondéré attendu sur GameTrend : 1,5-2,5 % des MAU.

---

## 3. Fonctionnalités du plan payant ("Creator")

### Visibilité (le pitch principal)

- Boost auto **24h en tête d'Explore** sur chaque nouveau preset publié
- **Badge "Creator" visible** à côté du nom dans le feed, sur le profil et sur les presets
- Apparition prioritaire dans les **suggestions de profils à follow** liées à la thématique
- **URL personnalisée** profil et presets : `/p/quentin/mon-preset` au lieu d'un UUID

### Analytics (le pitch rationnel)

- Stats détaillées par preset : vues, sauvegardes, taux de "follow après vue"
- Évolution temporelle (graphes 7 / 30 / 90 jours)
- Démographie/géo d'audience (anonymisée)
- Comparatif vs moyenne de la catégorie

### Statut & customisation (le pitch émotionnel)

- Bannière de profil custom + couleur d'accent
- **Lien personnalisé dans la description du profil** (nouveauté : exclusivité abonnés, voir §6)
- 5 presets épinglables en tête de profil
- Avatar avec bordure animée
- 3-4 réactions exclusives sur le feed

### Confort (cerise pour convertir aussi les non-créateurs)

- 0 pub
- Aucune limite sur le nombre de presets
- Sauvegarde illimitée des favoris
- Historique de jeu illimité
- Lobbies privés multijoueurs sans limite de joueurs

---

## 4. Limites du plan gratuit

Stratégie : tout ce qui crée la viralité reste **libre et illimité**. Tout ce qui valorise un créateur est **payant**.

| Capacité | Gratuit | Creator |
|---|---|---|
| Voir / chercher / sauvegarder presets | Illimité | Illimité |
| Follow / followers | Illimité | Illimité |
| Jouer aux mini-jeux | Illimité | Illimité |
| Créer des presets actifs | 3-5 simultanés | Illimité |
| Analytics presets | Compteur de vues seul | Complet |
| Boost auto sur publication | ❌ | 24h sur chaque preset |
| Badge & customisation profil | ❌ | ✅ |
| Lien dans description profil | ❌ | ✅ |
| URL personnalisée | ❌ | ✅ |
| Pubs | 1 bannière + 1 interstitiel toutes les ~10 actions | Aucune |

---

## 5. Pas d'UpCoins en MVP

Décision : **pas de monnaie virtuelle au lancement**. Risques :

- Si UpCoins offerts dans l'abo ont une valeur en € visible, on dilue l'argument d'achat de l'abo (ex: "100 UpCoins offerts = 10 €" rend le 9,99 € incohérent).
- Complexité fiscale (cadeaux numériques, TVA spécifique sur certains pays).
- Vecteur de fraude affiliation si on commissionne aussi les achats de UpCoins.

À reconsidérer en V2 (T+6 mois après lancement abo), comme **upsell ponctuel pour non-abonnés** ("Boost ce preset 24h pour 0,99 € sans abo"). Mécanique de monétisation complémentaire, pas centrale.

---

## 6. Nouveauté : lien dans la description profil (réservé abonnés)

### Spec produit

- Champ `profile_link_url` ajouté à `profiles` (TEXT, nullable)
- Visible et éditable **uniquement** par les abonnés actifs (`subscription_status = 'active'`)
- Affiché publiquement sur la page profil sous la bio, comme bouton/lien cliquable
- Validation côté serveur :
  - URL valide (regex http(s)://)
  - Domaine pas dans une blocklist (spam, phishing, contenus interdits CGU)
  - `rel="nofollow ugc noopener noreferrer"` côté front pour limiter SEO juice et risques sécurité
- **Si le user résilie son abo** : le lien reste stocké en DB mais **n'est plus affiché publiquement** (et le champ devient read-only). À la réactivation, le lien réapparaît automatiquement.

### Pourquoi cette feature

- **Argument de conversion fort** : c'est le levier qui pousse le plus les créateurs gaming à passer Premium sur Twitter/Twitch/Linktree-like (avoir un canal de redirection).
- **Coût d'implémentation** : faible (1 colonne + 1 input + validation + affichage conditionnel).
- **Valeur perçue** : élevée pour le segment créateur ciblé.

### Implémentation prévue

1. Migration SQL : `ALTER TABLE profiles ADD COLUMN profile_link_url TEXT`
2. Validation domaine côté RPC `update_profile_link(url text)` qui vérifie l'abo actif
3. UI profil : champ éditable visible si abonné, message "feature Creator" sinon avec CTA upgrade
4. UI publique : affichage conditionnel `if (profile.subscription_status === 'active' && profile.profile_link_url)`

---

## 7. Estimation chiffrée

> Tous les revenus sont **HT, après frais Lemon Squeezy (~10 %)**. La TVA est collectée
> par LS et reversée aux États — elle n'entre ni dans le revenu ni dans les coûts.

### Scénario médian (conversion 1,8 %, 50 % via affiliation)

| MAU | Abonnés | Revenu net | Coût affil (40 % × 50 %) | Coûts infra | **Net plateforme** |
|---|---|---|---|---|---|
| 5 000 | 90 | 491 € | 98 € | ~50 € | **343 €** |
| 20 000 | 360 | 1 962 € | 392 € | ~80 € | **1 490 €** |
| 50 000 | 900 | 4 905 € | 981 € | ~200 € | **3 724 €** |
| 100 000 | 1 800 | 9 810 € | 1 962 € | ~400 € | **7 448 €** |

**Marge nette ~70-76 % à toutes les échelles.** Modèle solidement rentable à partir de ~5 k MAU.

### Scénario pessimiste (conversion 1 %, 100 % via affiliation)

| DAU | MAU | Abonnés | Revenu net (3,68 €) | Coûts infra+vocal | **Marge** |
|---|---|---|---|---|---|
| 1 000 | 3 000 | 10 | 37 € | 53 € | **−16 €** ❌ |
| 1 500 | 4 500 | 15 | 55 € | 53 € | **+2 €** ⚠️ |
| 2 000 | 6 000 | 20 | 74 € | 58 € | **+16 €** ✅ |
| 5 000 | 15 000 | 50 | 184 € | 85 € | **+99 €** ✅ |
| 10 000 | 30 000 | 100 | 368 € | 160 € | **+208 €** ✅ |
| 50 000 | 150 000 | 500 | 1 840 € | 750 € | **+1 090 €** ✅ |
| 100 000 | 300 000 | 1 000 | 3 680 € | 1 700 € | **+1 980 €** ✅ |

**Break-even pessimiste : ~1 500 DAU.** Au-delà, marge stable 40-55 %.

---

## 8. Roadmap

| Étape | Période | Livrable |
|---|---|---|
| 1. MVP affiliation | ✅ avril 2026 | Tableau de bord, claim auto, RPC, notifs |
| 2. Lien profil abonnés | À venir | Migration + RPC + UI |
| 3. Intégration Stripe / Paddle MoR | T+1 mois | Webhook → `referral_earnings` |
| 4. Plan Creator unique 6,99 €/mois | T+1 mois | Paywall + paywall UI + essai 7j |
| 5. Boost auto 24h | T+2 mois | Pondération Explore par `is_subscriber` + ranking signal |
| 6. Analytics créateurs | T+3 mois | Tracking événements + dashboard analytics |
| 7. Re-évaluation données | T+6 mois | Si conversion < 1 %, réajuster pricing/features |
| 8. UpCoins (V2) | T+9 mois | Upsell ponctuel non-abonnés |

---

## 9. Pièges identifiés à éviter

- ❌ Empiler 2 paliers d'abo dès le lancement (paradoxe du choix)
- ❌ Mettre des pubs lourdes en gratuit (augmente le churn → moins de viralité)
- ❌ Bloquer la consultation/partage derrière un paywall (tue l'acquisition organique)
- ❌ Lancer les UpCoins en MVP (complexité, dilution du message)
- ❌ Commissionner l'affiliation sur les achats one-shot (fraude facile)
- ❌ Donner du % lifetime sans condition de paiement (réglé : notre modèle l'évite)
