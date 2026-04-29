/**
 * Simulateur de scale GameTrend.
 *
 * Modèle pure-functional (aucun side-effect) pour permettre des recalculs
 * temps réel côté client à chaque changement d'input. Toutes les valeurs
 * monétaires sont en **centimes EUR** sauf indication contraire.
 *
 * Philosophie : l'utilisateur paramètre des **hypothèses d'usage** (combien
 * de calls Navi/premium/mois, combien d'images/MAU/mois, etc.) et le
 * simulateur calcule automatiquement les coûts en multipliant par les
 * tarifs unitaires des fournisseurs (constantes ci-dessous, à jour avril
 * 2026).
 */

import { USD_TO_EUR } from "./pricing";

// ─────────────────────────────────────────────────────────────────────────────
// Constantes de tarification (centimes EUR par unité)
// ─────────────────────────────────────────────────────────────────────────────

/** OpenAI gpt-5-nano : 1 verdict Navi typique = ~2000 reasoning + 500 output
 *  tokens → ~0,025 c. On garde 0,025 c en moyenne par appel. */
const OPENAI_COST_PER_NAVI_CALL_CENTS = 0.025;

/** Sightengine : ~0,001 $ par image (modèles nudity-2.1 + gore). */
const SIGHTENGINE_COST_PER_IMAGE_CENTS = 0.1;

/** Resend : 3000 emails/mois gratuits (Free tier), au-delà ~0,04 c/email. */
const RESEND_FREE_TIER_EMAILS = 3000;
const RESEND_COST_PER_BILLABLE_EMAIL_CENTS = 0.04;

/** Supabase Storage : selon le plan, X GB inclus, puis 0,021 $/GB. */
const SUPABASE_STORAGE_INCLUDED_GB: Record<SupabasePlan, number> = {
  free: 1,
  pro: 100,
  team_estimate: 500,
};
const SUPABASE_EXTRA_STORAGE_USD_PER_GB = 0.021;

/** Vercel Pro : bandwidth supplémentaire ~0,40 $/GB au-delà du 1 TB inclus. */
const VERCEL_EXTRA_BANDWIDTH_USD_PER_GB = 0.4;

/** Estimation : 1 page vue ≈ 50 KB (front Next.js avec PWA + cache). */
const KB_PER_PAGEVIEW = 50;

// ─────────────────────────────────────────────────────────────────────────────
// Inputs
// ─────────────────────────────────────────────────────────────────────────────

export type SimulatorInputs = {
  // ─── Audience ────────────────────────────────────────────────────────────
  totalUsers: number;
  /** % de totalUsers qui sont actifs au moins 1× sur 30 jours */
  mauRatePct: number;

  // ─── Conversion premium ──────────────────────────────────────────────────
  premiumConversionPct: number;
  monthlySharePct: number;
  yearlySharePct: number;
  lifetimeSharePct: number;
  affiliateAcquisitionPct: number;
  affiliateCommissionRatePct: number;
  /** % de comptes achetant un Lifetime CE MOIS (one-shot) */
  lifetimeMonthlyAcquisitionPct: number;

  // ─── Tarifs (en centimes EUR) ────────────────────────────────────────────
  monthlyPriceCents: number;
  yearlyPriceCents: number;
  lifetimePriceCents: number;

  // ─── Usage (paramètres clés, le coût en € est dérivé automatiquement) ───
  /** Nombre moyen d'arbitrages Navi par premium et par mois */
  naviCallsPerPremiumPerMonth: number;
  /** Nombre d'images uploadées (covers, avatars, bannières) par MAU/mois */
  imagesUploadedPerMauPerMonth: number;
  /** Nombre d'emails envoyés par MAU/mois (welcome + lifecycle + notifs) */
  emailsPerMauPerMonth: number;
  /** Minutes de vocal consommées par premium/mois (estimation pour capacity) */
  voiceMinutesPerPremiumPerMonth: number;
  /** Stockage moyen en MB par MAU (avatar + covers + bannière) */
  storageMbPerMau: number;
  /** Pages vues par utilisateur ACTIF (premium ou free) par mois */
  pageViewsPerActiveUser: number;

  // ─── Revenus pub (AdSense) ───────────────────────────────────────────────
  adsenseRpmEur: number;
  adSlotsPerPage: number;
  adsConsentPct: number;

  // ─── Coûts fixes mensuels (paliers) ──────────────────────────────────────
  vercelPlan: VercelPlan;
  supabasePlan: SupabasePlan;
  hostingerVpsPlan: HostingerPlan;
  /** Domaine, comptable, autre. En centimes EUR/mois */
  otherFixedCostsCents: number;
};

export type VercelPlan = "hobby" | "pro" | "enterprise_estimate";
export type SupabasePlan = "free" | "pro" | "team_estimate";
export type HostingerPlan = "kvm2" | "kvm4" | "kvm8" | "cloud";

// ─────────────────────────────────────────────────────────────────────────────
// Outputs
// ─────────────────────────────────────────────────────────────────────────────

export type SimulatorOutputs = {
  // Composition
  mau: number;
  premiumActive: number;
  freeActive: number;
  monthlyCount: number;
  yearlyCount: number;
  lifetimeCount: number;
  newLifetimeThisMonth: number;
  affiliateAcquired: number;

  // Usage agrégé (utile pour debug + capacity planning)
  totalNaviCalls: number;
  totalImagesModerated: number;
  totalEmails: number;
  totalVoiceMinutes: number;
  totalStorageGb: number;
  totalPageViews: number;
  estimatedBandwidthGb: number;

  // Revenus mensuels (centimes EUR)
  mrrFromMonthlyCents: number;
  mrrFromYearlyCents: number;
  lifetimeOneShotCents: number;
  lemonGrossRevenueCents: number;
  lemonFeesCents: number;
  affiliateCommissionsCents: number;
  adsenseRevenueCents: number;
  totalGrossRevenueCents: number;
  totalNetRevenueCents: number;

  // Coûts variables (centimes EUR)
  naviCostCents: number;
  moderationCostCents: number;
  emailCostCents: number;
  voiceBandwidthCostCents: number;
  storageCostCents: number;
  variableCostsTotalCents: number;

  // Coûts fixes (centimes EUR)
  vercelCostCents: number;
  supabaseCostCents: number;
  hostingerCostCents: number;
  otherFixedCostsCents: number;
  fixedCostsTotalCents: number;

  // Synthèse
  totalCostsCents: number;
  grossMarginCents: number;
  marginPct: number;
  costPerMauCents: number;
  costPerPremiumCents: number;
  arpuCents: number;
  arppuCents: number;
  isProfitable: boolean;

  warnings: string[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Paliers d'infrastructure (avril 2026)
// ─────────────────────────────────────────────────────────────────────────────

const VERCEL_PLANS: Record<
  VercelPlan,
  {
    label: string;
    monthlyCents: number;
    maxBandwidthGb: number;
    maxInvocationsM: number;
  }
> = {
  hobby: {
    label: "Hobby (gratuit)",
    monthlyCents: 0,
    maxBandwidthGb: 100,
    maxInvocationsM: 0.1,
  },
  pro: {
    label: "Pro (20 $/mois)",
    monthlyCents: Math.round(2000 * USD_TO_EUR),
    maxBandwidthGb: 1000,
    maxInvocationsM: 1,
  },
  enterprise_estimate: {
    label: "Enterprise (~500 $/mois estimé)",
    monthlyCents: Math.round(50000 * USD_TO_EUR),
    maxBandwidthGb: 10000,
    maxInvocationsM: 10,
  },
};

const SUPABASE_PLANS: Record<
  SupabasePlan,
  { label: string; monthlyCents: number; maxMauAuth: number }
> = {
  free: {
    label: "Free (gratuit)",
    monthlyCents: 0,
    maxMauAuth: 50000,
  },
  pro: {
    label: "Pro (25 $/mois)",
    monthlyCents: Math.round(2500 * USD_TO_EUR),
    maxMauAuth: 100000,
  },
  team_estimate: {
    label: "Team (~599 $/mois estimé)",
    monthlyCents: Math.round(59900 * USD_TO_EUR),
    maxMauAuth: 1000000,
  },
};

const HOSTINGER_PLANS: Record<
  HostingerPlan,
  { label: string; monthlyCents: number; maxVoiceParticipants: number }
> = {
  kvm2: {
    label: "KVM 2 (~17,99 €/mois)",
    monthlyCents: 1799,
    maxVoiceParticipants: 50,
  },
  kvm4: {
    label: "KVM 4 (~27,99 €/mois)",
    monthlyCents: 2799,
    maxVoiceParticipants: 120,
  },
  kvm8: {
    label: "KVM 8 (~47,99 €/mois)",
    monthlyCents: 4799,
    maxVoiceParticipants: 300,
  },
  cloud: {
    label: "Cloud Startup (~79,99 €/mois)",
    monthlyCents: 7999,
    maxVoiceParticipants: 600,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Defaults — valeurs jugées les plus crédibles pour une app gaming sociale
// au lancement
// ─────────────────────────────────────────────────────────────────────────────

export function getDefaultInputs(): SimulatorInputs {
  return {
    // Audience
    totalUsers: 1000,
    mauRatePct: 70,

    // Conversion
    premiumConversionPct: 5,
    monthlySharePct: 60,
    yearlySharePct: 30,
    lifetimeSharePct: 10,
    affiliateAcquisitionPct: 30,
    affiliateCommissionRatePct: 40,
    lifetimeMonthlyAcquisitionPct: 1,

    // Tarifs
    monthlyPriceCents: 699,
    yearlyPriceCents: 4900,
    lifetimePriceCents: 9900,

    // Usage par utilisateur (valeurs crédibles app sociale gaming)
    naviCallsPerPremiumPerMonth: 20, // ~1 arbitrage Outbid tous les 1-2 jours
    imagesUploadedPerMauPerMonth: 5, // covers, avatar, bannière sporadiques
    emailsPerMauPerMonth: 2, // welcome + 1 lifecycle/notif typique
    voiceMinutesPerPremiumPerMonth: 30, // ~1 session de groupe par mois
    storageMbPerMau: 10, // avatar (~200KB) + qq covers
    pageViewsPerActiveUser: 60, // ~2 pages/jour pour un actif

    // AdSense
    adsenseRpmEur: 0.5,
    adSlotsPerPage: 2,
    adsConsentPct: 60,

    // Fixes
    vercelPlan: "hobby",
    supabasePlan: "free",
    hostingerVpsPlan: "kvm2",
    otherFixedCostsCents: 100,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Métadonnées exportées (pour la UI)
// ─────────────────────────────────────────────────────────────────────────────

export function getVercelPlans() {
  return VERCEL_PLANS;
}
export function getSupabasePlans() {
  return SUPABASE_PLANS;
}
export function getHostingerPlans() {
  return HOSTINGER_PLANS;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cœur du simulateur
// ─────────────────────────────────────────────────────────────────────────────

export function simulate(inputs: SimulatorInputs): SimulatorOutputs {
  const warnings: string[] = [];

  // ─── Composition de l'audience ──────────────────────────────────────────
  const mau = Math.round(inputs.totalUsers * (inputs.mauRatePct / 100));
  const premiumActive = Math.round(mau * (inputs.premiumConversionPct / 100));
  const freeActive = Math.max(0, mau - premiumActive);

  const mixSum =
    inputs.monthlySharePct + inputs.yearlySharePct + inputs.lifetimeSharePct;
  const monthlyShare = mixSum > 0 ? inputs.monthlySharePct / mixSum : 0;
  const yearlyShare = mixSum > 0 ? inputs.yearlySharePct / mixSum : 0;
  const lifetimeShare = mixSum > 0 ? inputs.lifetimeSharePct / mixSum : 0;

  const monthlyCount = Math.round(premiumActive * monthlyShare);
  const yearlyCount = Math.round(premiumActive * yearlyShare);
  const lifetimeCount = Math.round(premiumActive * lifetimeShare);

  const newLifetimeThisMonth = Math.round(
    inputs.totalUsers * (inputs.lifetimeMonthlyAcquisitionPct / 100)
  );
  const affiliateAcquired = Math.round(
    premiumActive * (inputs.affiliateAcquisitionPct / 100)
  );

  // ─── Usage agrégé ────────────────────────────────────────────────────────
  const totalNaviCalls =
    premiumActive * inputs.naviCallsPerPremiumPerMonth;
  const totalImagesModerated =
    mau * inputs.imagesUploadedPerMauPerMonth;
  const totalEmails = mau * inputs.emailsPerMauPerMonth;
  const totalVoiceMinutes =
    premiumActive * inputs.voiceMinutesPerPremiumPerMonth;
  const totalStorageGb = (mau * inputs.storageMbPerMau) / 1024;
  const totalPageViews = mau * inputs.pageViewsPerActiveUser;
  const estimatedBandwidthGb =
    (totalPageViews * KB_PER_PAGEVIEW) / (1024 * 1024); // KB → GB

  // ─── Revenus ─────────────────────────────────────────────────────────────
  const mrrFromMonthlyCents = monthlyCount * inputs.monthlyPriceCents;
  const mrrFromYearlyCents = Math.round(
    (yearlyCount * inputs.yearlyPriceCents) / 12
  );
  const lifetimeOneShotCents =
    newLifetimeThisMonth * inputs.lifetimePriceCents;

  const lemonGrossRevenueCents =
    mrrFromMonthlyCents + mrrFromYearlyCents + lifetimeOneShotCents;

  const transactionsPerMonth =
    monthlyCount + Math.round(yearlyCount / 12) + newLifetimeThisMonth;
  const lemonFeesCents =
    Math.round(lemonGrossRevenueCents * 0.05) +
    transactionsPerMonth * Math.round(50 * USD_TO_EUR);

  const grossLemonNet =
    lemonGrossRevenueCents - Math.round(lemonGrossRevenueCents * 0.05);
  const affiliatePart =
    grossLemonNet * (inputs.affiliateAcquisitionPct / 100);
  const affiliateCommissionsCents = Math.round(
    affiliatePart * (inputs.affiliateCommissionRatePct / 100)
  );

  // AdSense : impressions = pages vues × slots × consentement, pour les FREE
  const freePageViews = freeActive * inputs.pageViewsPerActiveUser;
  const monthlyImpressions =
    freePageViews * inputs.adSlotsPerPage * (inputs.adsConsentPct / 100);
  const adsenseRevenueCents = Math.round(
    (monthlyImpressions / 1000) * inputs.adsenseRpmEur * 100
  );

  const totalGrossRevenueCents = lemonGrossRevenueCents + adsenseRevenueCents;
  const totalNetRevenueCents =
    totalGrossRevenueCents - lemonFeesCents - affiliateCommissionsCents;

  // ─── Coûts variables (calculés automatiquement) ──────────────────────────
  const naviCostCents = Math.round(
    totalNaviCalls * OPENAI_COST_PER_NAVI_CALL_CENTS
  );

  const moderationCostCents = Math.round(
    totalImagesModerated * SIGHTENGINE_COST_PER_IMAGE_CENTS
  );

  const billableEmails = Math.max(0, totalEmails - RESEND_FREE_TIER_EMAILS);
  const emailCostCents = Math.round(
    billableEmails * RESEND_COST_PER_BILLABLE_EMAIL_CENTS
  );

  // Voice bandwidth : 0 c tant qu'on ne sature pas le VPS (le forfait fixe
  // couvre tout). On garde le compteur pour les warnings.
  const voiceBandwidthCostCents = 0;

  // Storage : 0 c sous le quota du plan Supabase, sinon $0.021/GB
  const includedStorageGb =
    SUPABASE_STORAGE_INCLUDED_GB[inputs.supabasePlan] ?? 1;
  const billableStorageGb = Math.max(0, totalStorageGb - includedStorageGb);
  const storageCostCents = Math.round(
    billableStorageGb * SUPABASE_EXTRA_STORAGE_USD_PER_GB * 100 * USD_TO_EUR
  );

  const variableCostsTotalCents =
    naviCostCents +
    moderationCostCents +
    emailCostCents +
    voiceBandwidthCostCents +
    storageCostCents;

  // ─── Coûts fixes ─────────────────────────────────────────────────────────
  const vercelPlan = VERCEL_PLANS[inputs.vercelPlan];
  const supabasePlan = SUPABASE_PLANS[inputs.supabasePlan];
  const hostingerPlan = HOSTINGER_PLANS[inputs.hostingerVpsPlan];

  const vercelCostCents = vercelPlan.monthlyCents;
  const supabaseCostCents = supabasePlan.monthlyCents;
  const hostingerCostCents = hostingerPlan.monthlyCents;

  // Vercel : surcoût bandwidth si dépassement du quota inclus
  let vercelExtraBandwidthCents = 0;
  if (estimatedBandwidthGb > vercelPlan.maxBandwidthGb) {
    const extraGb = estimatedBandwidthGb - vercelPlan.maxBandwidthGb;
    vercelExtraBandwidthCents = Math.round(
      extraGb * VERCEL_EXTRA_BANDWIDTH_USD_PER_GB * 100 * USD_TO_EUR
    );
  }

  const fixedCostsTotalCents =
    vercelCostCents +
    vercelExtraBandwidthCents +
    supabaseCostCents +
    hostingerCostCents +
    inputs.otherFixedCostsCents;

  // ─── Warnings paliers ────────────────────────────────────────────────────
  if (mau > supabasePlan.maxMauAuth) {
    warnings.push(
      `Supabase : ${mau.toLocaleString("fr-FR")} MAU dépasse la limite ${supabasePlan.maxMauAuth.toLocaleString("fr-FR")} du plan ${supabasePlan.label}. Upgrade obligatoire.`
    );
  }
  if (estimatedBandwidthGb > vercelPlan.maxBandwidthGb) {
    warnings.push(
      `Vercel : ~${Math.round(estimatedBandwidthGb)} GB bandwidth dépasse les ${vercelPlan.maxBandwidthGb} GB du ${vercelPlan.label}. Surcoût ajouté : ${(vercelExtraBandwidthCents / 100).toFixed(2)} €.`
    );
  }
  // Estimation : 10% des premium en vocal aux pics, 1 personne = 1 participant
  const peakVoiceParticipants = Math.round(premiumActive * 0.1);
  if (peakVoiceParticipants > hostingerPlan.maxVoiceParticipants) {
    warnings.push(
      `LiveKit (${hostingerPlan.label}) : ~${peakVoiceParticipants} participants vocal au pic dépasse la capacité ${hostingerPlan.maxVoiceParticipants}. Upgrade VPS recommandé.`
    );
  }
  if (totalStorageGb > includedStorageGb) {
    warnings.push(
      `Supabase Storage : ${totalStorageGb.toFixed(1)} GB dépasse les ${includedStorageGb} GB inclus dans ${supabasePlan.label}. Surcoût : ${(storageCostCents / 100).toFixed(2)} €.`
    );
  }
  if (
    inputs.vercelPlan === "hobby" &&
    (mrrFromMonthlyCents > 0 || mrrFromYearlyCents > 0)
  ) {
    warnings.push(
      `Vercel Hobby interdit l'usage commercial. Tu monétises (MRR > 0) → upgrade Pro obligatoire (TOS).`
    );
  }
  if (inputs.supabasePlan === "free" && mau > 1000) {
    warnings.push(
      `Supabase Free se met en pause après 7j sans activité. À ${mau.toLocaleString("fr-FR")} MAU, ce risque est inacceptable → upgrade Pro recommandé.`
    );
  }

  // ─── Synthèse ────────────────────────────────────────────────────────────
  const totalCostsCents = variableCostsTotalCents + fixedCostsTotalCents;
  const grossMarginCents = totalNetRevenueCents - totalCostsCents;
  const marginPct =
    totalNetRevenueCents > 0
      ? (grossMarginCents / totalNetRevenueCents) * 100
      : 0;

  const costPerMauCents = mau > 0 ? Math.round(totalCostsCents / mau) : 0;
  const costPerPremiumCents =
    premiumActive > 0 ? Math.round(totalCostsCents / premiumActive) : 0;

  const arpuCents = mau > 0 ? Math.round(totalGrossRevenueCents / mau) : 0;
  const arppuCents =
    premiumActive > 0
      ? Math.round(lemonGrossRevenueCents / premiumActive)
      : 0;

  return {
    mau,
    premiumActive,
    freeActive,
    monthlyCount,
    yearlyCount,
    lifetimeCount,
    newLifetimeThisMonth,
    affiliateAcquired,

    totalNaviCalls,
    totalImagesModerated,
    totalEmails,
    totalVoiceMinutes,
    totalStorageGb,
    totalPageViews,
    estimatedBandwidthGb,

    mrrFromMonthlyCents,
    mrrFromYearlyCents,
    lifetimeOneShotCents,
    lemonGrossRevenueCents,
    lemonFeesCents,
    affiliateCommissionsCents,
    adsenseRevenueCents,
    totalGrossRevenueCents,
    totalNetRevenueCents,

    naviCostCents,
    moderationCostCents,
    emailCostCents,
    voiceBandwidthCostCents,
    storageCostCents,
    variableCostsTotalCents,

    vercelCostCents: vercelCostCents + vercelExtraBandwidthCents,
    supabaseCostCents,
    hostingerCostCents,
    otherFixedCostsCents: inputs.otherFixedCostsCents,
    fixedCostsTotalCents,

    totalCostsCents,
    grossMarginCents,
    marginPct,
    costPerMauCents,
    costPerPremiumCents,
    arpuCents,
    arppuCents,
    isProfitable: grossMarginCents > 0,
    warnings,
  };
}
