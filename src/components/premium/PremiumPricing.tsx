"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { motion } from "framer-motion";
import { useRouter } from "@/i18n/navigation";
import { track } from "@/lib/analytics/posthog";

interface PremiumPricingProps {
  lifetimeRemaining: number;
  lifetimeEligible: boolean;
  currentStatus: string;
  isAuthenticated: boolean;
}

type Plan = "monthly" | "yearly" | "lifetime";

const FEATURES: { key: string; icon: string }[] = [
  { key: "noAds", icon: "🚫" },
  { key: "presetLimit", icon: "♾️" },
  { key: "lobbyCapacity", icon: "👥" },
  { key: "groupCapacity", icon: "💬" },
  { key: "profileLink", icon: "🔗" },
  { key: "bannerAccent", icon: "🎨" },
  { key: "creatorBadge", icon: "★" },
  { key: "pinnedPresets", icon: "📌" },
  { key: "boostExplore", icon: "🚀" },
  { key: "analytics", icon: "📊" },
];

export default function PremiumPricing({
  lifetimeRemaining,
  lifetimeEligible,
  currentStatus,
  isAuthenticated,
}: PremiumPricingProps) {
  const t = useTranslations("premium");
  const locale = useLocale();
  const router = useRouter();
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("yearly");
  const [loading, setLoading] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    track("pricing_page_viewed", {
      lifetime_eligible: lifetimeEligible,
      current_status: currentStatus,
    });
  }, [lifetimeEligible, currentStatus]);

  const isPremiumAlready = ["trialing", "active", "lifetime"].includes(currentStatus);

  async function startCheckout(plan: Plan) {
    if (!isAuthenticated) {
      router.push(`/auth/login?redirect=/premium`);
      return;
    }

    setError(null);
    setLoading(plan);
    track("checkout_started", { plan, lifetime_eligible: lifetimeEligible });

    try {
      const res = await fetch("/api/checkout/lemon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, locale }),
      });

      const json = await res.json();
      if (!res.ok || !json.url) {
        setError(json.error ?? "checkout_failed");
        setLoading(null);
        return;
      }

      window.location.href = json.url;
    } catch {
      setError("network_error");
      setLoading(null);
    }
  }

  return (
    <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-3"
      >
        <div className="inline-block px-3 py-1 rounded-full bg-gradient-brand text-white text-[11px] font-bold uppercase tracking-widest glow-brand">
          {t("heroBadge")}
        </div>
        <h1 className="text-3xl font-display font-bold text-white leading-tight">
          {t("heroTitle")}
        </h1>
        <p className="text-surface-400 text-sm leading-relaxed max-w-sm mx-auto">
          {t("heroSubtitle")}
        </p>
      </motion.div>

      {/* Statut actuel */}
      {isPremiumAlready && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-2xl border border-brand-500/40 bg-brand-500/5 p-4 text-center"
        >
          <p className="text-brand-300 text-sm font-medium">{t("alreadyPremium")}</p>
        </motion.div>
      )}

      {/* Lifetime offer (si éligible et places restantes) */}
      {lifetimeEligible && lifetimeRemaining > 0 && !isPremiumAlready && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative rounded-3xl p-[1px] bg-gradient-to-br from-amber-400 via-pink-500 to-violet-500 overflow-hidden"
        >
          <div className="rounded-3xl bg-surface-900 p-5 space-y-3">
            <div className="flex flex-col items-start gap-1.5">
              <div className="inline-block px-2.5 py-1 rounded-full bg-amber-400/20 text-amber-300 text-[10px] font-bold uppercase tracking-widest border border-amber-400/40">
                {t("lifetimeBadge")}
              </div>
              <p className="text-amber-300 text-[11px] font-mono">
                {t("lifetimeRemaining", { count: lifetimeRemaining })}
              </p>
            </div>
            <h2 className="text-xl font-display font-bold text-white">{t("lifetimeTitle")}</h2>
            <p className="text-surface-300 text-sm">{t("lifetimeDescription")}</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-display font-bold text-white">99 €</span>
              <span className="text-surface-500 text-xs">{t("oneTime")}</span>
            </div>
            <button
              onClick={() => startCheckout("lifetime")}
              disabled={loading !== null}
              className="w-full py-3 rounded-xl bg-gradient-to-br from-amber-400 to-pink-500 text-surface-950 font-bold disabled:opacity-50"
            >
              {loading === "lifetime" ? t("loading") : t("ctaLifetime")}
            </button>
          </div>
        </motion.div>
      )}

      {/* Toggle billing cycle */}
      <div className="flex justify-center">
        <div className="inline-flex bg-surface-900/60 rounded-2xl p-1 border border-surface-700/40">
          <button
            onClick={() => setBillingCycle("monthly")}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              billingCycle === "monthly"
                ? "bg-surface-800 text-white shadow"
                : "text-surface-400 hover:text-surface-200"
            }`}
          >
            {t("toggleMonthly")}
          </button>
          <button
            onClick={() => setBillingCycle("yearly")}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all relative ${
              billingCycle === "yearly"
                ? "bg-surface-800 text-white shadow"
                : "text-surface-400 hover:text-surface-200"
            }`}
          >
            {t("toggleYearly")}
            <span className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded-full bg-brand-500 text-white text-[9px] font-bold">
              -42%
            </span>
          </button>
        </div>
      </div>

      {/* Carte Premium principale */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-3xl p-[1px] bg-gradient-brand overflow-hidden"
      >
        <div className="rounded-3xl bg-surface-900 p-5 space-y-4">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-display font-bold text-white">
              {billingCycle === "monthly" ? "6,99 €" : "49 €"}
            </span>
            <span className="text-surface-500 text-sm">
              {billingCycle === "monthly" ? t("perMonth") : t("perYear")}
            </span>
          </div>
          {billingCycle === "yearly" && (
            <p className="text-brand-300 text-xs font-medium">{t("yearlyEquivalent")}</p>
          )}

          <button
            onClick={() => startCheckout(billingCycle)}
            disabled={loading !== null}
            className="w-full py-3 rounded-xl bg-gradient-brand text-white font-bold glow-brand disabled:opacity-50 hover:opacity-95 transition-opacity"
          >
            {loading === billingCycle ? t("loading") : t("ctaTrial")}
          </button>
          <p className="text-surface-500 text-[11px] text-center">{t("trialHint")}</p>
        </div>
      </motion.div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-center">
          <p className="text-red-400 text-sm">{t(`errors.${error}`, { defaultValue: error })}</p>
        </div>
      )}

      {/* Features */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-2xl border border-surface-700/40 bg-surface-900/30 p-5 space-y-3"
      >
        <h3 className="text-surface-500 text-xs uppercase tracking-widest font-medium">
          {t("featuresTitle")}
        </h3>
        <ul className="space-y-2.5">
          {FEATURES.map((f) => (
            <li key={f.key} className="flex items-start gap-3">
              <span className="text-base shrink-0 w-6 text-center">{f.icon}</span>
              <div>
                <p className="text-white text-sm font-medium">{t(`paywall.features.${f.key}.title`)}</p>
                <p className="text-surface-500 text-xs">{t(`paywall.features.${f.key}.description`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </motion.div>

      {/* FAQ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="rounded-2xl border border-surface-700/40 bg-surface-900/30 overflow-hidden"
      >
        <details>
          <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none list-none hover:bg-surface-800/20">
            <span className="text-surface-300 text-sm font-medium">{t("faqTitle")}</span>
            <span className="text-surface-600">▼</span>
          </summary>
          <div className="px-4 py-3 border-t border-surface-700/40 space-y-3 text-sm text-surface-400">
            {(["cancel", "refund", "trial", "lifetime"] as const).map((key) => (
              <div key={key}>
                <p className="text-surface-200 font-medium mb-1">{t(`faq.${key}.q`)}</p>
                <p className="text-surface-500 text-xs leading-relaxed">{t(`faq.${key}.a`)}</p>
              </div>
            ))}
          </div>
        </details>
      </motion.div>
    </main>
  );
}
