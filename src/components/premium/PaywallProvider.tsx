"use client";

import { createContext, useCallback, useContext, useState, useMemo, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useSubscription } from "@/hooks/useSubscription";
import { track } from "@/lib/analytics/posthog";

export type PaywallFeature =
  | "presetLimit"
  | "profileLink"
  | "bannerAccent"
  | "pinnedPresets"
  | "boostExplore"
  | "analytics"
  | "noAds"
  | "creatorBadge";

interface PaywallContextValue {
  /**
   * Exécute `action` si l'utilisateur est premium, sinon ouvre le modal paywall.
   * Retourne `true` si l'action a été exécutée immédiatement, `false` sinon.
   */
  requirePremium: (feature: PaywallFeature, action: () => void | Promise<void>) => boolean;
  /** Ouvre directement le modal pour une feature donnée. */
  openPaywall: (feature: PaywallFeature) => void;
}

const PaywallContext = createContext<PaywallContextValue | null>(null);

export function PaywallProvider({ children }: { children: ReactNode }) {
  const [openFeature, setOpenFeature] = useState<PaywallFeature | null>(null);
  const { isPremium } = useSubscription();
  const router = useRouter();
  const t = useTranslations("premium.paywall");

  const openPaywall = useCallback((feature: PaywallFeature) => {
    track("paywall_shown", { feature });
    setOpenFeature(feature);
  }, []);

  const requirePremium = useCallback(
    (feature: PaywallFeature, action: () => void | Promise<void>) => {
      if (isPremium) {
        try {
          action();
        } catch {}
        return true;
      }
      openPaywall(feature);
      return false;
    },
    [isPremium, openPaywall]
  );

  const handleUpgrade = useCallback(() => {
    if (openFeature) track("paywall_clicked_upgrade", { feature: openFeature });
    setOpenFeature(null);
    router.push("/premium");
  }, [openFeature, router]);

  const value = useMemo(() => ({ requirePremium, openPaywall }), [requirePremium, openPaywall]);

  return (
    <PaywallContext.Provider value={value}>
      {children}

      <AnimatePresence>
        {openFeature && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpenFeature(null)}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
            />
            <motion.div
              initial={{ opacity: 0, y: "100%" }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
              className="fixed bottom-0 left-0 right-0 z-50 max-w-lg mx-auto bg-surface-900 rounded-t-3xl border-t border-brand-500/40 p-6 max-h-[85vh] overflow-y-auto"
            >
              <div className="flex justify-center mb-4">
                <div className="w-12 h-1 rounded-full bg-surface-700" />
              </div>

              <div className="text-center mb-6">
                <div className="inline-block px-3 py-1 rounded-full bg-gradient-brand text-white text-[11px] font-bold uppercase tracking-widest mb-3 glow-brand">
                  {t("badge")}
                </div>
                <h2 className="text-2xl font-display font-bold text-white mb-2">
                  {t(`features.${openFeature}.title`)}
                </h2>
                <p className="text-surface-400 text-sm leading-relaxed">
                  {t(`features.${openFeature}.description`)}
                </p>
              </div>

              <div className="rounded-2xl bg-surface-800/40 border border-surface-700/40 p-4 mb-6">
                <p className="text-surface-500 text-xs uppercase tracking-widest font-medium mb-3">
                  {t("includedTitle")}
                </p>
                <ul className="space-y-2 text-sm text-surface-300">
                  {(["noAds", "presetLimit", "profileLink", "bannerAccent", "pinnedPresets", "boostExplore", "analytics", "creatorBadge"] as PaywallFeature[]).map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <span className="text-brand-400 shrink-0">✓</span>
                      <span>{t(`features.${f}.title`)}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-3">
                <button
                  onClick={handleUpgrade}
                  className="w-full py-3 rounded-xl bg-gradient-brand text-white font-semibold glow-brand hover:opacity-95 transition-opacity"
                >
                  {t("ctaPrimary")}
                </button>
                <button
                  onClick={() => setOpenFeature(null)}
                  className="w-full py-3 rounded-xl bg-surface-800/60 text-surface-300 font-medium hover:bg-surface-800 transition-colors"
                >
                  {t("ctaSecondary")}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </PaywallContext.Provider>
  );
}

export function usePaywall(): PaywallContextValue {
  const ctx = useContext(PaywallContext);
  if (!ctx) {
    throw new Error("usePaywall must be used within <PaywallProvider>");
  }
  return ctx;
}
