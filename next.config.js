const createNextIntlPlugin = require("next-intl/plugin");

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  // ⚠️ NE PAS réactiver ces deux flags : ils mettent les pages HTML en cache côté
  // Service Worker et servent une version périmée même sur hard refresh. Casse
  // toutes les pages avec données live (compteur lifetime, paywall, profile,
  // affiliation, abonnement). Le PWA reste installable et fonctionne offline
  // via le precaching standard des assets (JS/CSS/images).
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  reloadOnOnline: true,
  swcMinify: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    disableDevLogs: true,
    // Pour les requêtes de navigation (HTML pages), on force NetworkOnly :
    // jamais de version cachée servie par le SW, on laisse Next.js / Vercel
    // gérer la fraîcheur via les headers de la route.
    runtimeCaching: [
      {
        urlPattern: ({ request }) => request.mode === "navigate",
        handler: "NetworkOnly",
      },
    ],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    // Désactive l'optimisation Vercel : les images Supabase sont déjà compressées en WebP
    // côté client avant upload, donc l'optimisation Vercel ferait double emploi et coûterait
    // du quota (1 000 sources/mois sur Hobby = vite atteint avec un feed actif).
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        port: "",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

module.exports = withPWA(withNextIntl(nextConfig));
