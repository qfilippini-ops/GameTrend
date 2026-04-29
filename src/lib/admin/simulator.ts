/**
 * Simulateur de scale GameTrend.
 *
 * Modèle pure-functional (aucun side-effect) pour permettre des recalculs
 * temps réel côté client à chaque changement d'input. Toutes les valeurs
 * monétaires sont en **centimes EUR** sauf indication contraire.
 *
 * Hypothèses simplificatrices documentées dans `getDefaultInputs()`. Les
 * paliers d'infra (Vercel, Supabase, Hostinger) sont des modèles publics
 * d'avril 2026, à ajuster si les fournisseurs changent leurs grilles.
 */

import { estimateLemonFeesCents, USD_TO_EUR } from "./pricing";

// ─────────────────────────────────────────────────────────────────────────────
// Inputs
// ─────────────────────────────────────────────────────────────────────────────

export type SimulatorInputs = {
  // ─── Audience ────────────────────────────────────────────────────────────
  /** Total comptes inscrits */
  totalUsers: number;
  /** % de totalUsers qui sont actifs au moins 1× sur 30 jours */
  mauRatePct: number;

  // ─── Conversion premium ──────────────────────────────────────────────────
  /** % de MAU qui sont premium actifs (trialing+active+lifetime) */
  premiumConversionPct: number;
  /** Mix premium en % (somme = 100, normalisé automatiquement) */
  monthlySharePct: number;
  yearlySharePct: number;
  lifetimeSharePct: number;

  // ─── Affiliation ─────────────────────────────────────────────────────────
  /** % de premium acquis via lien d'affiliation (génère commission) */
  affiliateAcquisitionPct: number;
  /** Taux de commission affilié sur le NET (après fees Lemon) */
  affiliateCommissionRatePct: number;

  // ─── Tarifs (en centimes EUR) ────────────────────────────────────────────
  monthlyPriceCents: number;
  yearlyPriceCents: number;
  lifetimePriceCents: number;

  /** % des nouveaux lifetime achetés CE MOIS (one-shot, pas récurrent) */
  lifetimeMonthlyAcquisitionPct: number;

  // ─── Coûts variables (par utilisateur, par mois, en centimes EUR) ───────
  /** Coût Navi par premium actif/mois (les non-premium n'ont pas accès Navi) */
  naviCostPerPremiumCents: number;
  /** Coût modération images par MAU/mois (covers, avatars, bannières) */
  moderationCostPerMauCents: number;
  /** Coût emails Resend par MAU/mois (welcome + lifecycle abos) */
  emailCostPerMauCents: number;
  /** Coût bandwidth voice par premium/mois (le voice est premium-only) */
  voiceBandwidthCostPerPremiumCents: number;
  /** Coût storage par MAU/mois (covers stockés, avatars) */
  storageCostPerMauCents: number;

  // ─── Revenus pub (AdSense) ───────────────────────────────────────────────
  /** RPM = revenu en EUR pour 1000 impressions */
  adsenseRpmEur: number;
  /** Pages vues par utilisateur FREE actif par mois */
  pageViewsPerFreeUser: number;
  /** Slots pub affichés par page (en moyenne) */
  adSlotsPerPage: number;
  /** % de l'audience free qui voit la pub (consentement RGPD) */
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
  lifetimeCount: number; // total cumulé (pas one-shot)
  newLifetimeThisMonth: number;
  affiliateAcquired: number;

  // Revenus mensuels (centimes EUR)
  mrrFromMonthlyCents: number;
  mrrFromYearlyCents: number;
  lifetimeOneShotCents: number;
  lemonGrossRevenueCents: number;
  lemonFeesCents: number;
  affiliateCommissionsCents: number;
  adsenseRevenueCents: number;
  totalGrossRevenueCents: number;
  totalNetRevenueCents: number; // gross - lemonFees - affiliateCommissions

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
  arpuCents: number; // average revenue per ACTIVE user (MAU)
  arppuCents: number; // average revenue per PAYING user
  isProfitable: boolean;

  // Warnings (paliers à upgrader)
  warnings: string[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Paliers d'infrastructure (avril 2026)
// ─────────────────────────────────────────────────────────────────────────────

/** Vercel : prix mensuel + capacités (tarifs sans dépassement). */
const VERCEL_PLANS: Record<
  VercelPlan,
  { label: string; monthlyCents: number; maxBandwidthGb: number; maxInvocationsM: number }
> = {
  hobby: {
    label: "Hobby (gratuit)",
    monthlyCents: 0,
    maxBandwidthGb: 100,
    maxInvocationsM: 0.1, // 100k function invocations
  },
  pro: {
    label: "Pro (20 $/mois)",
    monthlyCents: Math.round(2000 * USD_TO_EUR),
    maxBandwidthGb: 1000, // 1TB
    maxInvocationsM: 1,
  },
  enterprise_estimate: {
    label: "Enterprise (~500 $/mois estimé)",
    monthlyCents: Math.round(50000 * USD_TO_EUR),
    maxBandwidthGb: 10000,
    maxInvocationsM: 10,
  },
};

/** Supabase : prix + capacités principales. */
const SUPABASE_PLANS: Record<
  SupabasePlan,
  { label: string; monthlyCents: number; maxMauAuth: number; maxStorageGb: number }
> = {
  free: {
    label: "Free (gratuit)",
    monthlyCents: 0,
    maxMauAuth: 50000,
    maxStorageGb: 1,
  },
  pro: {
    label: "Pro (25 $/mois)",
    monthlyCents: Math.round(2500 * USD_TO_EUR),
    maxMauAuth: 100000,
    maxStorageGb: 100,
  },
  team_estimate: {
    label: "Team (~599 $/mois estimé)",
    monthlyCents: Math.round(59900 * USD_TO_EUR),
    maxMauAuth: 1000000,
    maxStorageGb: 500,
  },
};

/** Hostinger VPS : capacité voice estimée (participants simultanés LiveKit). */
const HOSTINGER_PLANS: Record<
  HostingerPlan,
  { label: string; monthlyCents: number; maxVoiceParticipants: number }
> = {
  kvm2: {
    label: "KVM 2 (~7 €/mois)",
    monthlyCents: 700,
    maxVoiceParticipants: 50, // ordre de grandeur LiveKit single-node
  },
  kvm4: {
    label: "KVM 4 (~14 €/mois)",
    monthlyCents: 1400,
    maxVoiceParticipants: 120,
  },
  kvm8: {
    label: "KVM 8 (~28 €/mois)",
    monthlyCents: 2800,
    maxVoiceParticipants: 300,
  },
  cloud: {
    label: "Cloud Pro (~45 €/mois)",
    monthlyCents: 4500,
    maxVoiceParticipants: 600,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Defaults (utilisés au premier load)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Valeurs par défaut "raisonnables" pour un démarrage GameTrend.
 *
 * Hypothèses :
 *   - 70% des inscrits restent actifs (MAU rate généreux mais réaliste pour
 *     une app sociale gaming)
 *   - 5% conversion en premium (standard freemium)
 *   - Mix : 60% monthly, 30% yearly, 10% lifetime (les early adopters
 *     préfèrent le lifetime tant qu'il est dispo)
 *   - 30% des premium acquis via affilié (à augmenter si tu pushes le
 *     programme)
 *   - 1% des comptes achètent un lifetime ce mois (modérément optimiste)
 *
 * Coûts variables : extrapolés depuis les patterns observés (Navi gpt-5-nano
 * à ~0,005 €/appel, modération à 0,001 $/image, etc.). À ajuster si tes
 * données réelles divergent (bouton "Charger valeurs actuelles").
 */
export function getDefaultInputs(): SimulatorInputs {
  return {
    totalUsers: 1000,
    mauRatePct: 70,

    premiumConversionPct: 5,
    monthlySharePct: 60,
    yearlySharePct: 30,
    lifetimeSharePct: 10,

    affiliateAcquisitionPct: 30,
    affiliateCommissionRatePct: 40,

    monthlyPriceCents: 699,
    yearlyPriceCents: 4900,
    lifetimePriceCents: 9900,

    lifetimeMonthlyAcquisitionPct: 1,

    // Estimations conservatrices (en centimes EUR par mois)
    naviCostPerPremiumCents: 5, // ~5c/mois si 10 calls Navi/mois × 0,5c
    moderationCostPerMauCents: 1, // ~1 image modérée/MAU/mois × 0,1c
    emailCostPerMauCents: 0, // free tier Resend (3000/mois inclus)
    voiceBandwidthCostPerPremiumCents: 2, // bande passante VPS marginale
    storageCostPerMauCents: 0, // inclus dans Supabase Pro

    adsenseRpmEur: 0.5, // RPM gaming/social en France ~0.30-1€
    pageViewsPerFreeUser: 30, // ~1 page/jour
    adSlotsPerPage: 2,
    adsConsentPct: 60, // typique RGPD (40% refusent)

    vercelPlan: "hobby",
    supabasePlan: "free",
    hostingerVpsPlan: "kvm2",
    otherFixedCostsCents: 100, // domaine .fr ~1€/mois
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

  // Normalisation du mix premium pour totaliser 100% (évite les NaN si user
  // saisit 30/30/30 = 90)
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

  // ─── Revenus ─────────────────────────────────────────────────────────────
  // MRR = revenus mensuels récurrents
  const mrrFromMonthlyCents = monthlyCount * inputs.monthlyPriceCents;
  // Yearly contribue 1/12 par mois
  const mrrFromYearlyCents = Math.round(
    (yearlyCount * inputs.yearlyPriceCents) / 12
  );
  // Lifetime = uniquement les NOUVEAUX lifetime du mois (one-shot)
  const lifetimeOneShotCents =
    newLifetimeThisMonth * inputs.lifetimePriceCents;

  const lemonGrossRevenueCents =
    mrrFromMonthlyCents + mrrFromYearlyCents + lifetimeOneShotCents;

  // Frais Lemon : 5% + 0,46 € par transaction (estimé)
  // Nombre de transactions/mois ≈ monthlyCount + yearlyCount/12 + nouveaux lifetime
  const transactionsPerMonth =
    monthlyCount + Math.round(yearlyCount / 12) + newLifetimeThisMonth;
  // Calcul approximatif des fees globaux (pas par transaction pour simplifier)
  const lemonFeesCents =
    Math.round(lemonGrossRevenueCents * 0.05) +
    transactionsPerMonth * Math.round(50 * USD_TO_EUR);

  // Commissions affiliés : 40% du net (gross - 5%) sur la part premium
  // acquise via affilié, applicable sur monthly + yearly + lifetime du mois
  const grossLemonNet = lemonGrossRevenueCents - Math.round(lemonGrossRevenueCents * 0.05);
  const affiliatePart = grossLemonNet * (inputs.affiliateAcquisitionPct / 100);
  const affiliateCommissionsCents = Math.round(
    affiliatePart * (inputs.affiliateCommissionRatePct / 100)
  );

  // AdSense : impressions × RPM. Les premium n'ont pas de pub.
  const monthlyImpressions =
    freeActive *
    inputs.pageViewsPerFreeUser *
    inputs.adSlotsPerPage *
    (inputs.adsConsentPct / 100);
  const adsenseRevenueCents = Math.round(
    (monthlyImpressions / 1000) * inputs.adsenseRpmEur * 100
  );

  const totalGrossRevenueCents = lemonGrossRevenueCents + adsenseRevenueCents;
  const totalNetRevenueCents =
    totalGrossRevenueCents - lemonFeesCents - affiliateCommissionsCents;

  // ─── Coûts variables ─────────────────────────────────────────────────────
  const naviCostCents = premiumActive * inputs.naviCostPerPremiumCents;
  const moderationCostCents = mau * inputs.moderationCostPerMauCents;
  const emailCostCents = mau * inputs.emailCostPerMauCents;
  const voiceBandwidthCostCents =
    premiumActive * inputs.voiceBandwidthCostPerPremiumCents;
  const storageCostCents = mau * inputs.storageCostPerMauCents;

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

  const fixedCostsTotalCents =
    vercelCostCents +
    supabaseCostCents +
    hostingerCostCents +
    inputs.otherFixedCostsCents;

  // ─── Warnings paliers ────────────────────────────────────────────────────
  if (mau > supabasePlan.maxMauAuth) {
    warnings.push(
      `Supabase : ${mau.toLocaleString("fr-FR")} MAU dépasse la limite ${supabasePlan.maxMauAuth.toLocaleString("fr-FR")} du plan ${supabasePlan.label}. Upgrade nécessaire.`
    );
  }

  // Bandwidth Vercel estimé (très approximatif) : 50 KB par page vue × pages
  const estimatedBandwidthGb =
    (mau * inputs.pageViewsPerFreeUser * 50) / (1024 * 1024); // 50KB → GB
  if (estimatedBandwidthGb > vercelPlan.maxBandwidthGb) {
    warnings.push(
      `Vercel : ~${Math.round(estimatedBandwidthGb)} GB bandwidth estimés dépasse les ${vercelPlan.maxBandwidthGb} GB inclus dans ${vercelPlan.label}. Coût supplémentaire à prévoir (~40 $/100 GB).`
    );
  }

  // Function invocations Vercel : 1 invocation par page vue + 5 pour API
  const estimatedInvocationsM = (mau * inputs.pageViewsPerFreeUser * 6) / 1_000_000;
  if (estimatedInvocationsM > vercelPlan.maxInvocationsM) {
    warnings.push(
      `Vercel : ~${estimatedInvocationsM.toFixed(2)} M invocations estimées dépasse ${vercelPlan.maxInvocationsM} M inclus.`
    );
  }

  // Voice : LiveKit single-node sature autour de X participants simultanés
  // Estimation : si 10% des premium sont en vocal en moyenne aux pics
  const peakVoiceParticipants = Math.round(premiumActive * 0.1);
  if (peakVoiceParticipants > hostingerPlan.maxVoiceParticipants) {
    warnings.push(
      `LiveKit (${hostingerPlan.label}) : ~${peakVoiceParticipants} participants vocal simultanés au pic dépasse la capacité ${hostingerPlan.maxVoiceParticipants}. Upgrade VPS ou clustering.`
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
    premiumActive > 0
      ? Math.round(
          (variableCostsTotalCents + fixedCostsTotalCents) / premiumActive
        )
      : 0;

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
    vercelCostCents,
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

// Forcer l'utilisation des helpers depuis pricing.ts (évite l'unused import
// au cas où on simplifie estimateLemonFeesCents plus tard).
void estimateLemonFeesCents;
