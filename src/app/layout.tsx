import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/layout/BottomNav";
import ActiveRoomBadge from "@/components/ActiveRoomBadge";
import KickedToast from "@/components/KickedToast";
import Heartbeat from "@/components/Heartbeat";
import PWAInstallBanner from "@/components/PWAInstallBanner";
import { Suspense } from "react";

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

export const metadata: Metadata = {
  title: "GameTrend — Hub de jeux sociaux viraux",
  description:
    "Centralise tes jeux de soirée : GhostWord, Quizz, Enchères. Crée et partage des presets communautaires.",
  keywords: ["jeux", "soirée", "undercover", "ghostword", "social", "presets"],
  authors: [{ name: "GameTrend Community" }],
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "GameTrend",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
  openGraph: {
    title: "GameTrend",
    description: "Le hub de jeux sociaux viraux",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#06070d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={`${inter.variable} ${spaceGrotesk.variable}`}>
        <body className="min-h-screen">
        <Suspense><KickedToast /></Suspense>
        <Suspense><PWAInstallBanner /></Suspense>
        <Heartbeat />
        <main className="pb-24 max-w-lg mx-auto">{children}</main>
        <BottomNav />
        <Suspense><ActiveRoomBadge /></Suspense>
      </body>
    </html>
  );
}
