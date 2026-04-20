import type { Viewport } from "next";

/**
 * Root layout MINIMAL : volontairement vide de toute structure HTML.
 *
 * Le vrai `<html>` / `<body>` (avec lang dynamique, providers next-intl,
 * polices, etc.) vit dans `[locale]/layout.tsx`. Ce layout racine n'est
 * traversé que pour les rares routes non préfixées (api, auth/callback).
 *
 * Cette structure est imposée par next-intl pour que `useTranslations`
 * et la détection de locale fonctionnent correctement avec App Router.
 */
export const viewport: Viewport = {
  themeColor: "#3f2f8d",
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
  return children;
}
