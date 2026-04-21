"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useSubscription } from "@/hooks/useSubscription";

/**
 * Section "Mon abonnement" affichée dans le profil.
 *
 * Trois grandes branches :
 *   1. Premium / lifetime → statut + dates + bouton portail
 *   2. Past due → warning + CTA mise à jour paiement
 *   3. Free → encart upgrade + lifetime CTA conditionnel
 */
export default function SubscriptionSection() {
  const t = useTranslations("premium.profile");
  const locale = useLocale();
  const { isPremium, isTrialing, isLifetime, isPastDue, willCancel, plan, currentPeriodEnd, cancelAt, lifetimeEligible } =
    useSubscription();
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  const dateFmt = (d: Date) =>
    new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-US", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);

  async function openPortal() {
    setPortalLoading(true);
    setPortalError(null);
    try {
      const res = await fetch("/api/portal/lemon");
      const json = await res.json();
      if (!res.ok || !json.url) {
        setPortalError(json.error ?? "portal_unavailable");
        setPortalLoading(false);
        return;
      }
      window.open(json.url, "_blank", "noopener,noreferrer");
    } catch {
      setPortalError("network_error");
    } finally {
      setPortalLoading(false);
    }
  }

  if (isPremium || isPastDue) {
    return (
      <div className="space-y-3">
        {/* Statut */}
        <div className="rounded-xl bg-surface-800/40 border border-surface-700/40 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-surface-500 text-[11px] uppercase tracking-widest font-medium">
              {t("statusLabel")}
            </span>
            <StatusPill
              label={
                isLifetime
                  ? t("status.lifetime")
                  : isTrialing
                  ? t("status.trialing")
                  : isPastDue
                  ? t("status.pastDue")
                  : willCancel
                  ? t("status.cancelling")
                  : t("status.active")
              }
              tone={isPastDue ? "warning" : willCancel ? "neutral" : "active"}
            />
          </div>

          {plan && (
            <div className="flex items-center justify-between">
              <span className="text-surface-500 text-[11px] uppercase tracking-widest font-medium">
                {t("planLabel")}
              </span>
              <span className="text-surface-200 text-sm font-medium">
                {t(`plan.${plan}`)}
              </span>
            </div>
          )}

          {isTrialing && currentPeriodEnd && (
            <div className="flex items-center justify-between">
              <span className="text-surface-500 text-[11px] uppercase tracking-widest font-medium">
                {t("trialEndsLabel")}
              </span>
              <span className="text-surface-200 text-sm">{dateFmt(currentPeriodEnd)}</span>
            </div>
          )}

          {!isLifetime && !willCancel && currentPeriodEnd && !isTrialing && (
            <div className="flex items-center justify-between">
              <span className="text-surface-500 text-[11px] uppercase tracking-widest font-medium">
                {t("renewsLabel")}
              </span>
              <span className="text-surface-200 text-sm">{dateFmt(currentPeriodEnd)}</span>
            </div>
          )}

          {willCancel && cancelAt && (
            <div className="flex items-center justify-between">
              <span className="text-surface-500 text-[11px] uppercase tracking-widest font-medium">
                {t("endsLabel")}
              </span>
              <span className="text-amber-300 text-sm">{dateFmt(cancelAt)}</span>
            </div>
          )}
        </div>

        {isPastDue && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3">
            <p className="text-red-300 text-sm">{t("pastDueWarning")}</p>
          </div>
        )}

        {!isLifetime && (
          <button
            onClick={openPortal}
            disabled={portalLoading}
            className="w-full py-2.5 rounded-xl bg-surface-800 border border-surface-700/60 text-surface-200 text-sm font-medium hover:bg-surface-700 transition-colors disabled:opacity-50"
          >
            {portalLoading ? t("loading") : t("managePortal")}
          </button>
        )}

        {portalError && (
          <p className="text-red-400 text-xs text-center">
            {portalError === "no_customer" ? t("noCustomerError") : t("portalError")}
          </p>
        )}
      </div>
    );
  }

  // Free user
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-surface-800/40 border border-surface-700/40 p-3">
        <div className="flex items-center justify-between">
          <span className="text-surface-500 text-[11px] uppercase tracking-widest font-medium">
            {t("statusLabel")}
          </span>
          <StatusPill label={t("status.free")} tone="neutral" />
        </div>
      </div>

      <div className="rounded-xl bg-gradient-to-br from-brand-500/10 to-pink-500/10 border border-brand-500/30 p-4 space-y-3">
        <p className="text-white font-display font-bold text-base leading-tight">
          {lifetimeEligible ? t("upsellLifetime") : t("upsellPremium")}
        </p>
        <p className="text-surface-300 text-xs leading-relaxed">
          {lifetimeEligible ? t("upsellLifetimeDesc") : t("upsellPremiumDesc")}
        </p>
        <Link
          href="/premium"
          className="inline-block w-full text-center py-2.5 rounded-xl bg-gradient-brand text-white font-semibold glow-brand text-sm"
        >
          {t("upsellCta")}
        </Link>
      </div>
    </div>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "active" | "warning" | "neutral" }) {
  const styles = {
    active: "bg-brand-500/20 text-brand-300 border-brand-500/40",
    warning: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    neutral: "bg-surface-700/40 text-surface-300 border-surface-600/40",
  }[tone];
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold border ${styles}`}>
      {label}
    </span>
  );
}
