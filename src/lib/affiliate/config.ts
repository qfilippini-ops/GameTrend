/**
 * Configuration centrale du programme d'affiliation GameTrend.
 *
 * Source de vérité unique : les composants UI (AffiliateDashboard), le
 * ReferralClaimer et le route handler /r/{code} importent tous ces constantes
 * pour rester cohérents.
 *
 * Côté serveur (RPC SQL), certaines de ces valeurs sont dupliquées
 * (PENDING_DAYS = INTERVAL '30 days' dans schema_affiliate.sql, COMMISSION_RATE
 * sera injecté par le webhook Stripe / Paddle quand on branchera le paiement).
 * En cas de modification, penser à synchroniser la migration SQL associée et
 * la documentation `docs/MONETIZATION.md`.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * MODÈLE D'AFFILIATION
 * ────────────────────────────────────────────────────────────────────────────
 *
 *  - Commission FIXE de 40 % du revenu net (après frais de paiement) généré
 *    par chaque filleul.
 *  - Récurrente : versée chaque mois TANT QUE le filleul paie son abonnement.
 *  - Conditionnelle : aucune commission si désabonnement, remboursement ou
 *    chargeback (les earnings concernés passent en `reversed`).
 *  - Périmètre : abonnements UNIQUEMENT (pas les achats one-shot, pour limiter
 *    le vecteur de fraude par auto-achat).
 *  - Fenêtre de validation : PENDING_DAYS jours en `pending` avant passage en
 *    `paid` (couvre la fenêtre de chargeback Stripe / remboursement client).
 *  - Attribution : first-click wins via cookie `gt_ref`, durée
 *    COOKIE_MAX_AGE_SECONDS (90 jours, standard de l'industrie).
 *
 *  Modèle auto-régulé : l'affilié ne touche jamais d'argent que la plateforme
 *  n'a pas réellement perçu. Pas d'asymétrie défavorable.
 *  Voir `docs/MONETIZATION.md` pour le détail business complet.
 */

export const AFFILIATE_CONFIG = {
  /** Nom du cookie qui stocke le code d'affiliation entre /r/{code} et le signup. */
  COOKIE_NAME: "gt_ref",
  /** Durée de vie du cookie (90 jours). Standard de l'industrie pour first-click attribution. */
  COOKIE_MAX_AGE_SECONDS: 60 * 60 * 24 * 90,
  /**
   * Délai (en jours) avant qu'un earning passe de `pending` à `paid`.
   * Doit être supérieur à la fenêtre de chargeback du PSP (Stripe : 60 jours
   * théoriques, Paddle : variable selon banque). 30 jours = compromis raisonnable
   * pour un MVP, à monter à 60 si on observe des chargebacks tardifs.
   */
  PENDING_DAYS: 30,
  /**
   * Taux de commission appliqué aux abonnements payés par les filleuls.
   * Palier unique fixe : 40 % récurrent tant que le filleul paie.
   * Au-dessus du standard B2C (15-25 %) pour attirer les créateurs gaming.
   * Marge nette plateforme estimée à ~60 % sur la LTV (cf. docs/MONETIZATION.md).
   */
  COMMISSION_RATE: 0.4,
  /** Format autorisé pour un code d'affiliation : 3-30 caractères, [a-z0-9_-]. */
  CODE_REGEX: /^[a-z0-9_-]{3,30}$/,
  /** Clé localStorage pour empêcher le double-claim dans une session navigateur. */
  CLAIMED_FLAG_KEY: "gt_ref_claimed",
} as const;

export type AffiliateConfig = typeof AFFILIATE_CONFIG;

// Exports nommés pour les imports concis (webhook, RPC client, dashboard).
export const COMMISSION_RATE = AFFILIATE_CONFIG.COMMISSION_RATE;
export const AFFILIATE_PENDING_DAYS = AFFILIATE_CONFIG.PENDING_DAYS;
export const AFFILIATE_COOKIE_NAME = AFFILIATE_CONFIG.COOKIE_NAME;
export const AFFILIATE_COOKIE_MAX_AGE = AFFILIATE_CONFIG.COOKIE_MAX_AGE_SECONDS;
