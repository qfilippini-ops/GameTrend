"use client";

import Script from "next/script";

/**
 * Charge le script Google AdSense (adsbygoogle.js) globalement.
 *
 * Pourquoi toujours le charger (et pas conditionnellement sur le cookie consent) :
 *   - Le crawler AdSense doit pouvoir le détecter pour valider le site.
 *   - Le script seul ne pose AUCUN cookie tant que .push() n'est pas appelé
 *     pour rendre une ad. Pas de tracking sans rendu d'annonce.
 *   - Sans ce script présent, la validation initiale du site échoue.
 *
 * Conformité RGPD :
 *   - On ne `.push()` aucune ad (et donc on ne pose aucun cookie pub) tant que
 *     l'utilisateur n'a pas accepté tous les cookies. Cette gate est gérée
 *     dans le composant AdSlot.
 *   - Les utilisateurs Premium ne voient jamais d'ads (gate dans AdSlot via
 *     useSubscription).
 *
 * Variables d'env :
 *   NEXT_PUBLIC_ADSENSE_CLIENT_ID = ca-pub-XXXXXXXXXXXXXXXX
 *   Si absente → no-op (pas de script chargé), utile en dev/staging.
 */
export default function AdSenseScript() {
  const clientId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;

  // Pas d'ID configuré → on ne charge rien (build local, preview, etc.).
  if (!clientId) return null;

  return (
    <Script
      id="adsense-script"
      async
      strategy="afterInteractive"
      crossOrigin="anonymous"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`}
    />
  );
}
