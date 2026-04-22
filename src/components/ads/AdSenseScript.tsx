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
 * Optimisation perf (LCP) :
 *   - `defer` au lieu de `async` : le navigateur télécharge en parallèle MAIS
 *     n'exécute le JS qu'après avoir parsé tout le HTML. Sur 4G lente, ça
 *     évite que le main thread soit bloqué par le parsing du script AdSense
 *     (~230 KiB) avant que le LCP element soit peint.
 *   - Le composant est désormais monté en BAS du body (cf. layout.tsx) pour
 *     que le navigateur ne commence pas le download AdSense avant d'avoir
 *     reçu le contenu critique.
 *   - Le crawler AdSense voit toujours la balise script dans le HTML SSR :
 *     la position dans le body ne change rien à la validation.
 *
 * Conformité RGPD :
 *   - Le .push() est gaté dans AdSlot par useConsent().adsConsent && !isPremium.
 *   - Le consentement est géré par la CMP Google (TCF v2.2) injectée par ce
 *     même script en EEE/UK/CH.
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
      defer
      crossOrigin="anonymous"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`}
    />
  );
}
