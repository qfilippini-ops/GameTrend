/**
 * Tarifs et coûts fixes des services tiers utilisés par GameTrend.
 *
 * Tous les prix sont en USD (sauf indication contraire) puis convertis en EUR
 * pour l'affichage du dashboard admin. La conversion se fait avec un taux
 * fixe — c'est suffisant pour un dashboard interne (le but n'est pas la
 * compta certifiée).
 *
 * Les valeurs `unit_cost_micros` correspondent à 1 millionième d'unité
 * monétaire (= 0,000001 USD ou EUR). Cette précision est nécessaire pour
 * facturer au token (OpenAI gpt-5-nano à $0.05/M tokens donne 0.00000005 USD
 * par token, soit 0.05 micros).
 */

/** Conversion approximative USD → EUR (rafraîchir manuellement 2-3×/an). */
export const USD_TO_EUR = 0.92;

export function microsToCents(
  micros: number | bigint,
  currency: "USD" | "EUR" = "USD"
): number {
  const m = typeof micros === "bigint" ? Number(micros) : micros;
  // 1 cent = 10 000 micros
  const usdCents = m / 10_000;
  if (currency === "EUR") return Math.round(usdCents);
  return Math.round(usdCents * USD_TO_EUR);
}

export function dollarsToMicros(dollars: number): number {
  return Math.round(dollars * 1_000_000);
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI (Navi)
// ─────────────────────────────────────────────────────────────────────────────
// Tarifs gpt-5-nano (avril 2026) :
//   • Input  : $0.05 / 1M tokens → 0.05 micros / token
//   • Output : $0.40 / 1M tokens → 0.40 micros / token
// Référence : https://openai.com/api/pricing/
//
// Note : si tu changes de modèle dans NAVI_MODEL, mets à jour ces constantes
// (ou ajoute une lookup table par modèle).
export const OPENAI_NANO_INPUT_MICROS_PER_TOKEN = 0.05;
export const OPENAI_NANO_OUTPUT_MICROS_PER_TOKEN = 0.4;

export function computeOpenAINaviCostMicros(
  promptTokens: number,
  completionTokens: number
): number {
  const inputCost = promptTokens * OPENAI_NANO_INPUT_MICROS_PER_TOKEN;
  const outputCost = completionTokens * OPENAI_NANO_OUTPUT_MICROS_PER_TOKEN;
  return Math.round(inputCost + outputCost);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sightengine (modération)
// ─────────────────────────────────────────────────────────────────────────────
// Tarif standard "moderation" : ~$0.001 / image en plan pay-as-you-go.
// Plan freemium = 2000 ops / mois gratuites, ensuite à l'usage.
// On ne distingue pas plan vs hors-plan ici, on utilise le tarif par défaut.
export const SIGHTENGINE_COST_MICROS_PER_CHECK = 1_000; // $0.001

// ─────────────────────────────────────────────────────────────────────────────
// Resend (emails transactionnels)
// ─────────────────────────────────────────────────────────────────────────────
// Plan Free : 3000 emails/mois, $0/mois.
// Plan Pro  : $20/mois pour 50k emails, soit ~$0.0004/email au-delà du free.
// On modélise un coût marginal de $0.0004/email, ce qui est conservateur :
// tant qu'on est dans le free tier, on facture $0 mais on garde un compteur.
export const RESEND_COST_MICROS_PER_EMAIL = 400; // $0.0004

// ─────────────────────────────────────────────────────────────────────────────
// LiveKit auto-hébergé (Hostinger VPS)
// ─────────────────────────────────────────────────────────────────────────────
// Coût marginal par join vocal = 0 (le VPS est déjà payé en fixe). On loggue
// quand même pour avoir un compteur d'usage et calculer un cost-per-call si
// on dépasse la capacité du VPS et qu'il faut upgrader.
export const LIVEKIT_COST_MICROS_PER_TOKEN_MINT = 0; // pas de coût marginal

// ─────────────────────────────────────────────────────────────────────────────
// Coûts fixes mensuels (en EUR)
// ─────────────────────────────────────────────────────────────────────────────
// Ces valeurs sont injectées dans `cost_snapshots` au prorata journalier par
// le cron quotidien (ou à la demande depuis la page admin).

export type FixedCost = {
  /** Identifiant interne, doit matcher cost_snapshots.service */
  service: string;
  /** Libellé affiché dans le dashboard */
  label: string;
  /** Coût en centimes EUR par mois */
  monthly_cents: number;
  /** Notes pour comprendre la valeur */
  note: string;
};

export const FIXED_MONTHLY_COSTS_EUR: FixedCost[] = [
  {
    service: "livekit_vps",
    label: "VPS Hostinger KVM2 (LiveKit)",
    monthly_cents: 1799,
    note: "17,99€/mois (renouvellement, hors promo) pour le serveur LiveKit auto-hébergé",
  },
  {
    service: "domain",
    label: "Domaine gametrend.fr",
    monthly_cents: 100, // ~12€/an / 12
    note: "12€/an au prorata",
  },
  {
    service: "vercel",
    label: "Vercel Pro (estimation)",
    monthly_cents: 2000,
    note: "$20/mois fixe en plan Pro. À automatiser via VERCEL_API_TOKEN.",
  },
  {
    service: "supabase",
    label: "Supabase Pro (estimation)",
    monthly_cents: 2500,
    note: "$25/mois plan Pro si dépassement free tier",
  },
  // À activer après passage SASU :
  // { service: "comptable", label: "Comptable SASU", monthly_cents: 5000, note: "~50€/mois" },
];

export function fixedMonthlyTotalEurCents(): number {
  return FIXED_MONTHLY_COSTS_EUR.reduce(
    (sum, c) => sum + c.monthly_cents,
    0
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lemon Squeezy fees (commission MoR)
// ─────────────────────────────────────────────────────────────────────────────
// 5% + $0.50 par transaction réussie.
// On l'utilise pour estimer les fees lors du recap revenus depuis la table
// `subscriptions` (qui ne contient que le montant brut).
export function estimateLemonFeesCents(
  grossAmountCents: number,
  currency: "EUR" | "USD" = "EUR"
): number {
  const percentage = Math.round(grossAmountCents * 0.05);
  const flatCents = currency === "USD" ? 50 : Math.round(50 * USD_TO_EUR);
  return percentage + flatCents;
}
