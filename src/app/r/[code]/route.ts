import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AFFILIATE_CONFIG } from "@/lib/affiliate/config";
import { routing } from "@/i18n/routing";

/**
 * Route handler du lien court d'affiliation : /r/{code}
 *
 * Comportement :
 *   1. Lit le code depuis l'URL (normalisé en lowercase).
 *   2. Pose un cookie `gt_ref` (90 jours) qui sera consommé après l'auth
 *      par le composant ReferralClaimer (RPC claim_referral).
 *   3. Redirige vers la page d'accueil dans la locale de l'utilisateur
 *      (cookie NEXT_LOCALE, sinon default).
 *
 * Cette route est exclue du middleware next-intl (cf. matcher dans
 * src/middleware.ts) pour éviter d'être redirigée vers /fr/r/... avant
 * d'arriver ici.
 *
 * On ne valide PAS le format du code ici (regex, longueur) : la validation
 * réelle a lieu côté SQL (RPC claim_referral retourne `code_not_found` si
 * inconnu). Cela évite d'afficher une page d'erreur si quelqu'un partage un
 * lien valide avant d'avoir activé son code (cas rare mais possible).
 */
export async function GET(
  request: Request,
  { params }: { params: { code: string } }
) {
  const code = (params.code ?? "").toLowerCase().slice(0, 60);
  const url = new URL(request.url);

  const cookieStore = cookies();
  const localeCookie = cookieStore.get("NEXT_LOCALE")?.value;
  const locale =
    localeCookie && (routing.locales as readonly string[]).includes(localeCookie)
      ? localeCookie
      : routing.defaultLocale;

  const target = new URL(`/${locale}/`, url.origin);
  const response = NextResponse.redirect(target, 307);

  if (code) {
    response.cookies.set(AFFILIATE_CONFIG.COOKIE_NAME, code, {
      maxAge: AFFILIATE_CONFIG.COOKIE_MAX_AGE_SECONDS,
      sameSite: "lax",
      path: "/",
      httpOnly: false,
    });
  }

  return response;
}
