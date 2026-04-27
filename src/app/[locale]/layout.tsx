import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import "../globals.css";
import { routing } from "@/i18n/routing";
import BottomNav from "@/components/layout/BottomNav";
import ActiveRoomBadge from "@/components/ActiveRoomBadge";
import KickedToast from "@/components/KickedToast";
import Heartbeat from "@/components/Heartbeat";
import GroupInviteToasts from "@/components/social/GroupInviteToasts";
import PWAInstallBanner from "@/components/PWAInstallBanner";
import { FeedCacheProvider } from "@/components/feed/FeedCacheContext";
import ReferralClaimer from "@/components/affiliate/ReferralClaimer";
import { PaywallProvider } from "@/components/premium/PaywallProvider";
import AnalyticsProvider from "@/components/analytics/AnalyticsProvider";
import AdSenseScript from "@/components/ads/AdSenseScript";

// Inter et Space Grotesk sont des fonts VARIABLES sur Google Fonts. En
// omettant le `weight`, next/font charge un unique fichier variable axis qui
// couvre tous les weights demandés via Tailwind (font-medium/bold/etc.).
//
// Avant : Space Grotesk chargeait 4 fichiers statiques (400/500/600/700) →
// ~80 KiB transférés sur la landing. Après : 1 fichier variable ~30 KiB qui
// permet en plus d'utiliser font-extrabold (800) et font-black (900) sans
// fallback synthétique du navigateur.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

/**
 * Mots-clés SEO globaux. Strictement aucun nom de marque tierce
 * (pas d'Undercover, Loup-Garou, Skribbl, Among Us, etc.) — uniquement nos
 * marques propres (GameTrend, GhostWord, DYP) + des termes génériques.
 *
 * Priorisation imposée par la stratégie SEO :
 *   1. jeu de soirée + création (le coeur de l'offre)
 *   2. communauté (presets partagés, créateurs)
 *   3. affiliation (traitée uniquement sur la landing dédiée)
 */
const KEYWORDS_FR = [
  "jeu de soirée",
  "jeux de soirée entre amis",
  "jeu à plusieurs",
  "jeu en ligne entre amis",
  "soirée jeux",
  "créer son propre jeu",
  "création de jeux",
  "presets communautaires",
  "communauté de joueurs",
  "GameTrend",
  "GhostWord",
  "DYP",
];

const KEYWORDS_EN = [
  "party game",
  "party games with friends",
  "multiplayer party game",
  "play online with friends",
  "game night",
  "create your own game",
  "game creation",
  "community presets",
  "player community",
  "GameTrend",
  "GhostWord",
  "DYP",
];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const safeLocale = hasLocale(routing.locales, locale)
    ? locale
    : routing.defaultLocale;
  const t = await getTranslations({ locale: safeLocale, namespace: "metadata" });
  const adsenseClientId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;

  return {
    metadataBase: new URL("https://www.gametrend.fr"),
    title: {
      default: t("title"),
      // Les pages enfants peuvent fournir leur propre title court ; il sera
      // suffixé automatiquement par "| GameTrend" pour conserver la marque.
      template: "%s | GameTrend",
    },
    description: t("description"),
    keywords: safeLocale === "fr" ? KEYWORDS_FR : KEYWORDS_EN,
    authors: [{ name: "GameTrend Community" }],
    creator: "GameTrend",
    publisher: "GameTrend",
    manifest: "/manifest.json",
    // Hreflang : par défaut on pointe vers la racine de chaque locale.
    // Les pages enfants surchargent avec leur pathname spécifique.
    alternates: {
      canonical: `/${safeLocale}`,
      languages: {
        fr: "/fr",
        en: "/en",
        "x-default": "/fr",
      },
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    ...(adsenseClientId && {
      other: {
        "google-adsense-account": adsenseClientId,
      },
    }),
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "GameTrend",
      startupImage: [
        { url: "/icons/splash.png", media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)" },
        { url: "/icons/splash.png", media: "(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)" },
        { url: "/icons/splash.png", media: "(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)" },
        { url: "/icons/splash.png", media: "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3)" },
        { url: "/icons/splash.png" },
      ],
    },
    icons: { apple: "/icons/apple-touch-icon.png" },
    openGraph: {
      title: t("ogTitle"),
      description: t("ogDescription"),
      siteName: t("siteName"),
      url: `https://www.gametrend.fr/${safeLocale}`,
      type: "website",
      locale: safeLocale === "fr" ? "fr_FR" : "en_US",
      alternateLocale: safeLocale === "fr" ? "en_US" : "fr_FR",
      images: [
        {
          url: "/api/og/default",
          width: 1200,
          height: 630,
          alt: t("siteName"),
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: t("ogTitle"),
      description: t("ogDescription"),
      images: ["/api/og/default"],
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  // Active la locale pour les composants serveur (getTranslations, etc.)
  setRequestLocale(locale);

  return (
    <html lang={locale} className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="min-h-screen">
        <NextIntlClientProvider>
          <PaywallProvider>
            <FeedCacheProvider>
              <AnalyticsProvider />
              <Suspense><KickedToast /></Suspense>
              <Suspense><PWAInstallBanner /></Suspense>
              <Heartbeat />
              <ReferralClaimer />
              <main className="pb-24 max-w-lg mx-auto">{children}</main>
              <BottomNav />
              <Suspense><ActiveRoomBadge /></Suspense>
              <GroupInviteToasts />
            </FeedCacheProvider>
          </PaywallProvider>
        </NextIntlClientProvider>
        {/*
          AdSense en BAS de body pour que le navigateur reçoive d'abord tout
          le HTML critique (header, hero, contenu) avant de commencer le
          download de adsbygoogle.js. Combiné au `defer` du script, le LCP
          n'est plus bloqué par AdSense.
        */}
        <AdSenseScript />
      </body>
    </html>
  );
}
