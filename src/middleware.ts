import { createServerClient } from "@supabase/ssr";
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";

/**
 * Middleware combiné : next-intl (routing localisé /fr|/en) + Supabase
 * (rafraîchissement silencieux de la session).
 *
 * L'ordre est important :
 *   1. next-intl gère d'abord la redirection / le préfixe de locale.
 *   2. Sur la réponse résultante, on attache Supabase pour conserver les
 *      cookies d'auth (et déclencher refresh).
 *
 * Routes EXCLUES du préfixe locale (cf. matcher) :
 *   - /api/*           : routes serveur (auth, webhooks)
 *   - /auth/callback   : OAuth callback Supabase
 *   - /_next/*         : assets internes Next.js
 *   - /sw.js, *.png... : PWA + statiques
 */
const intlMiddleware = createIntlMiddleware(routing);

export async function middleware(request: NextRequest) {
  // 1. Délégation à next-intl : applique la locale (cookie ou Accept-Language)
  //    et insère le préfixe URL si manquant. Renvoie une NextResponse qui
  //    peut être une redirection (308) ou une .next() avec headers locale.
  const intlResponse = intlMiddleware(request);

  // Si next-intl a produit une redirection, on la retourne telle quelle :
  // pas besoin de Supabase sur une 308 (le client suivra la redirect et le
  // middleware sera ré-exécuté sur la nouvelle URL).
  if (intlResponse.headers.get("location")) {
    return intlResponse;
  }

  // 2. Refresh session Supabase sur la réponse de next-intl. On utilise
  //    intlResponse comme base pour préserver les headers locale ajoutés.
  let response = intlResponse;
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // Recrée une réponse en repartant des headers de intlResponse pour
          // ne pas perdre la locale, puis ré-attache les cookies Supabase.
          response = NextResponse.next({
            request,
            headers: intlResponse.headers,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getUser();

  return response;
}

export const config = {
  // On exclut explicitement les routes qui ne doivent JAMAIS être préfixées
  // par une locale (API, OAuth callback, statiques, service worker).
  matcher: [
    "/((?!api|auth/callback|_next/static|_next/image|favicon.ico|sw.js|workbox-.*|icons|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
