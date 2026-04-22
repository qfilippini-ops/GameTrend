"use client";

import { useTranslations } from "next-intl";
import { useAuth } from "@/hooks/useAuth";

/**
 * CTA "Connecte-toi pour suivre" — n'apparaît que pour les visiteurs
 * non authentifiés (ou anonymes). Caché pour les users loggés afin
 * d'éviter de polluer leur UI.
 */
export default function ProfileLoginCTA() {
  const t = useTranslations("profile.public");
  const { user } = useAuth();
  const isLoggedIn = user && !user.is_anonymous;
  if (isLoggedIn) return null;

  return (
    <p className="text-surface-600 text-xs text-center pt-2">
      <a href="/auth/login" className="text-brand-400 underline">
        {t("loginPrefix")}
      </a>
      {t("loginSuffix")}
    </p>
  );
}
