"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { useParams } from "next/navigation";
import { useRouter, usePathname } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";

/**
 * Sélecteur de langue (dropdown natif <select>).
 *
 * Volontairement basé sur <select> natif :
 * - scale automatiquement à N langues (5, 10, 20…) sans souci de layout ;
 * - le menu s'ouvre via le popup système du navigateur, donc jamais clippé
 *   par un parent `overflow-hidden` ou un z-index ;
 * - accessibilité clavier + lecteurs d'écran gratuite ;
 * - sur mobile, l'OS affiche son picker natif, idéal UX.
 *
 * Préserve le pathname et les params dynamiques (ex. /profile/[id]) en
 * redirigeant via `next-intl`'s router. Persiste le choix dans le cookie
 * NEXT_LOCALE (1 an) pour les visites suivantes.
 */
export default function LanguageSwitcher() {
  const t = useTranslations("languages");
  const currentLocale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const [isPending, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as Locale;
    if (next === currentLocale || isPending) return;
    startTransition(() => {
      router.replace(
        // @ts-expect-error -- pathname est typé strict par next-intl
        { pathname, params },
        { locale: next }
      );
    });
  }

  return (
    <div className="relative w-full">
      <select
        value={currentLocale}
        onChange={handleChange}
        disabled={isPending}
        aria-label={t("label")}
        className="appearance-none w-full pl-4 pr-10 py-3 rounded-xl bg-surface-800/80 border border-surface-700/50 text-white text-sm hover:border-brand-500/50 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 transition-all disabled:opacity-50 cursor-pointer"
      >
        {routing.locales.map((loc) => (
          <option key={loc} value={loc} className="bg-surface-900 text-white">
            {t(loc)} ({loc.toUpperCase()})
          </option>
        ))}
      </select>
      <span
        aria-hidden
        className={`pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-surface-500 text-xs transition-opacity ${
          isPending ? "opacity-30" : "opacity-100"
        }`}
      >
        ▼
      </span>
    </div>
  );
}
