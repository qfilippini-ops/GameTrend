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
import PWAInstallBanner from "@/components/PWAInstallBanner";
import CookieBanner from "@/components/CookieBanner";
import { FeedCacheProvider } from "@/components/feed/FeedCacheContext";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

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

  return {
    title: t("title"),
    description: t("description"),
    keywords: ["jeux", "soirée", "undercover", "ghostword", "social", "presets", "party games"],
    authors: [{ name: "GameTrend Community" }],
    manifest: "/manifest.json",
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
      title: "GameTrend",
      description: t("description"),
      type: "website",
      locale: safeLocale === "fr" ? "fr_FR" : "en_US",
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
          <FeedCacheProvider>
            <Suspense><KickedToast /></Suspense>
            <Suspense><PWAInstallBanner /></Suspense>
            <CookieBanner />
            <Heartbeat />
            <main className="pb-24 max-w-lg mx-auto">{children}</main>
            <BottomNav />
            <Suspense><ActiveRoomBadge /></Suspense>
          </FeedCacheProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
