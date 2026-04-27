import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AFFILIATE_CONFIG } from "@/lib/affiliate/config";
import { routing } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";

/**
 * Route handler du lien court d'affiliation : /r/{code}
 *
 * Comportement :
 *   1. Lit le code depuis l'URL (normalisé en lowercase).
 *   2. Pose un cookie `gt_ref` (90 jours) qui sera consommé après l'auth
 *      par le composant ReferralClaimer (RPC claim_referral).
 *   3. Redirection conditionnelle :
 *      - Utilisateur NON authentifié → /{locale}/auth/signup
 *        Logique : un visiteur qui clique sur un lien d'invitation a une
 *        intention forte. Le rediriger vers la home dilue le funnel et le
 *        prive du signal social (nom du créateur affiché sur la page signup
 *        via le cookie). Conversion bien meilleure en allant direct au
 *        formulaire avec le code pré-rempli.
 *      - Utilisateur AUTHENTIFIÉ → /{locale}/
 *        Le cookie est immédiatement consommé par ReferralClaimer dans le
 *        layout. Pas de redirection vers signup (l'utilisateur a déjà un
 *        compte).
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

  // Détection de session — on utilise le client Supabase serveur qui lit les
  // cookies sb-* automatiquement. Si l'utilisateur a déjà un compte, on ne
  // l'envoie pas sur la page d'inscription (mauvaise UX).
  let isAuthenticated = false;
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    isAuthenticated = !!data.user && !data.user.is_anonymous;
  } catch {
    // En cas d'erreur de session (rare : env vars manquantes, etc.) on
    // retombe sur le comportement non-authentifié → signup. Pire cas : un
    // user déjà loggué tombe sur signup et clique "Se connecter" — friction
    // mineure et exceptionnelle.
    isAuthenticated = false;
  }

  const targetPath = isAuthenticated ? `/${locale}/` : `/${locale}/auth/signup`;
  const target = new URL(targetPath, url.origin);
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
