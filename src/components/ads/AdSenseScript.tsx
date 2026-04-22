/**
 * Charge le script Google AdSense (adsbygoogle.js) globalement.
 *
 * Server Component (volontairement pas de "use client") :
 *   - La balise <script> est rendue dans le HTML SSR → visible par le crawler
 *     AdSense lors de la validation, sans aucune dépendance JS côté client.
 *   - Évite les conflits d'hydratation rencontrés avec next/script
 *     (HierarchyRequestError "Only one element on document allowed",
 *     erreurs React #418 / #423).
 *
 * Pourquoi toujours le charger (et pas conditionnellement sur le cookie consent) :
 *   - Le crawler AdSense ne gère pas les cookies. Sans la balise présente
 *     dans le HTML initial, la validation échoue.
 *   - Le script seul ne pose AUCUN cookie publicitaire tant qu'on n'appelle
 *     pas (adsbygoogle = window.adsbygoogle || []).push({}).
 *
 * Conformité RGPD :
 *   - Le .push() est gaté dans AdSlot par cookieConsent === "all" && !isPremium.
 *
 * Variable d'env :
 *   NEXT_PUBLIC_ADSENSE_CLIENT_ID = ca-pub-XXXXXXXXXXXXXXXX
 *   Si absente → no-op (utile en dev/preview).
 */
export default function AdSenseScript() {
  const clientId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;

  if (!clientId) return null;

  return (
    <script
      async
      crossOrigin="anonymous"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`}
    />
  );
}
