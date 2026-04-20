/**
 * Configuration centrale du programme d'affiliation.
 *
 * Source de vérité unique : les composants UI, le ReferralClaimer et le route
 * handler /r/{code} importent tous ces constantes pour rester cohérents.
 *
 * Côté serveur (RPC SQL), certaines de ces valeurs sont dupliquées
 * (PENDING_DAYS = INTERVAL '30 days' dans schema_affiliate.sql, COMMISSION_RATE
 * sera injectée par le webhook Stripe). En cas de modification, penser à
 * synchroniser la migration SQL associée.
 */

export const AFFILIATE_CONFIG = {
  /** Nom du cookie qui stocke le code d'affiliation entre /r/{code} et le signup. */
  COOKIE_NAME: "gt_ref",
  /** Durée de vie du cookie (90 jours). Standard de l'industrie pour first-click attribution. */
  COOKIE_MAX_AGE_SECONDS: 60 * 60 * 24 * 90,
  /** Délai avant qu'un earning passe de "pending" à "paid" (fenêtre chargeback Stripe). */
  PENDING_DAYS: 30,
  /** Taux de commission appliqué aux dépenses des filleuls (10% — palier unique). */
  COMMISSION_RATE: 0.1,
  /** Format autorisé pour un code d'affiliation : 3-30 caractères, [a-z0-9_-]. */
  CODE_REGEX: /^[a-z0-9_-]{3,30}$/,
  /** Clé localStorage pour empêcher le double-claim dans une session navigateur. */
  CLAIMED_FLAG_KEY: "gt_ref_claimed",
} as const;

export type AffiliateConfig = typeof AFFILIATE_CONFIG;
