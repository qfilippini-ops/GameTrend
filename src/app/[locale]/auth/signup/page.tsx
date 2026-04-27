"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter, Link } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import LegalModal from "@/components/legal/LegalModal";
import { AFFILIATE_CONFIG } from "@/lib/affiliate/config";

// Version des CGU en vigueur — à mettre à jour lors de chaque révision
const CGU_VERSION = "2025-04";

/**
 * Lecture cookie côté navigateur. Dupliqué (au lieu d'importer depuis
 * ReferralClaimer) pour garder ce composant indépendant — la signature est
 * triviale.
 */
function readCookieClient(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp("(?:^|;\\s*)" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)")
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookieClient(name: string, value: string, maxAgeSeconds: number) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; path=/; SameSite=Lax`;
}

function deleteCookieClient(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageContent />
    </Suspense>
  );
}

function SignupPageContent() {
  const t = useTranslations("auth.signup");
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/";

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cguAccepted, setCguAccepted] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [legalModal, setLegalModal] = useState<"cgu" | "privacy" | null>(null);

  // Code créateur : optionnel. Pré-rempli si l'utilisateur a cliqué sur un
  // lien `/r/{code}` (qui pose le cookie `gt_ref`). On garde un flag pour
  // afficher un mini badge "Code créateur détecté ✓" qui rassure sur le
  // fait que le créateur sera bien crédité.
  const [creatorCode, setCreatorCode] = useState("");
  const [codeFromCookie, setCodeFromCookie] = useState(false);
  // Métadonnées du créateur (si code reconnu) pour afficher une bannière
  // "Tu as été invité par @username" — fort levier de social proof.
  const [creatorInfo, setCreatorInfo] = useState<{
    username: string;
    avatar_url: string | null;
  } | null>(null);

  const supabase = createClient();

  useEffect(() => {
    const cookieCode = readCookieClient(AFFILIATE_CONFIG.COOKIE_NAME);
    if (!cookieCode) return;
    setCreatorCode(cookieCode);
    setCodeFromCookie(true);

    // Lookup du créateur — la table `profiles` a une policy SELECT publique
    // (cf. schema.sql : "Profils visibles par tous"), donc accessible sans
    // auth. `maybeSingle()` pour ne pas throw si le code est inconnu (cas
    // d'un cookie obsolète ou d'un partage de lien périmé).
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("username, avatar_url")
        .eq("affiliate_code", cookieCode.toLowerCase())
        .maybeSingle();
      if (data?.username) {
        setCreatorInfo({
          username: data.username,
          avatar_url: data.avatar_url ?? null,
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();

    if (!cguAccepted) {
      setError(t("errorCgu"));
      return;
    }
    if (!ageConfirmed) {
      setError(t("errorAge"));
      return;
    }
    if (password.length < 8) {
      setError(t("errorPassword"));
      return;
    }

    // Validation + synchronisation du cookie d'affiliation AVANT signUp.
    //
    // Stratégie : on réutilise le flux existant (cookie `gt_ref` →
    // ReferralClaimer → RPC claim_referral) pour ne pas multiplier les
    // chemins de code. Si l'utilisateur a saisi un code (ou modifié celui
    // pré-rempli depuis le cookie), on écrase le cookie ; s'il l'a vidé
    // alors qu'il était initialement présent, on supprime le cookie pour
    // respecter sa décision (refus de l'affiliation).
    const trimmedCode = creatorCode.trim().toLowerCase();
    if (trimmedCode.length > 0) {
      if (!AFFILIATE_CONFIG.CODE_REGEX.test(trimmedCode)) {
        setError(t("creatorCodeInvalid"));
        return;
      }
      writeCookieClient(
        AFFILIATE_CONFIG.COOKIE_NAME,
        trimmedCode,
        AFFILIATE_CONFIG.COOKIE_MAX_AGE_SECONDS
      );
    } else if (codeFromCookie) {
      // L'utilisateur a explicitement vidé le champ pré-rempli → il refuse
      // l'attribution : on nettoie le cookie pour qu'il ne soit pas claim.
      deleteCookieClient(AFFILIATE_CONFIG.COOKIE_NAME);
    }

    setLoading(true);
    setError(null);

    const acceptedAt = new Date().toISOString();

    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?redirect=${redirect}`,
        data: {
          username,
          cgu_accepted_at: acceptedAt,
          cgu_version: CGU_VERSION,
        },
      },
    });

    if (signUpError) {
      setLoading(false);
      setError(signUpError.message);
      return;
    }

    if (authData.user) {
      await supabase
        .from("profiles")
        .update({
          cgu_accepted_at: acceptedAt,
          cgu_version: CGU_VERSION,
        })
        .eq("id", authData.user.id);
    }

    setLoading(false);
    setSuccess(true);
    // Suppress unused warning for router (kept for parity with login flow)
    void router;
  }

  if (success) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center px-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center max-w-sm"
        >
          <div className="text-6xl mb-4">🎉</div>
          <h1 className="text-2xl font-display font-bold text-white mb-3">{t("successTitle")}</h1>
          <p className="text-surface-400 mb-6">
            {t("successText")} <span className="text-white font-medium">{email}</span>.
          </p>
          <Link href="/auth/login" className="text-brand-400 font-medium hover:underline">
            {t("successCta")}
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-950 flex flex-col justify-center px-4">
      {legalModal && (
        <LegalModal type={legalModal} onClose={() => setLegalModal(null)} />
      )}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-sm mx-auto w-full"
      >
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🎮</div>
          <h1 className="text-3xl font-display font-black text-white mb-2">{t("title")}</h1>
          <p className="text-surface-400 text-sm">{t("subtitle")}</p>
        </div>

        {/* Bannière "Invité par @creator" — affichée uniquement si l'utilisateur
            arrive via un lien d'affiliation valide ET que le créateur existe.
            Effet de social proof : valide l'invitation et personnalise l'expérience. */}
        {creatorInfo && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 flex items-center gap-3 px-4 py-3 rounded-2xl border border-brand-700/40 bg-gradient-to-br from-brand-950/60 via-surface-900/60 to-surface-950/40 shadow-lg shadow-brand-900/10"
          >
            {creatorInfo.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={creatorInfo.avatar_url}
                alt={creatorInfo.username}
                className="w-10 h-10 rounded-full object-cover border-2 border-brand-500/50 shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-brand-700/40 border-2 border-brand-500/50 flex items-center justify-center shrink-0">
                <span className="text-brand-200 text-base font-bold">
                  {creatorInfo.username.slice(0, 1).toUpperCase()}
                </span>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-brand-200/80 text-[10px] uppercase tracking-widest font-semibold">
                {t("invitedByLabel")}
              </p>
              <p className="text-white font-display font-bold text-sm truncate">
                @{creatorInfo.username}
              </p>
            </div>
            <span className="text-2xl shrink-0" aria-hidden>
              ✨
            </span>
          </motion.div>
        )}

        {error && (
          <div className="mb-4 p-4 rounded-xl bg-red-950/40 border border-red-700/50 text-red-300 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-4">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t("usernamePlaceholder")}
            required
            maxLength={30}
            className="w-full bg-surface-800 border border-surface-600 focus:border-brand-500 text-white placeholder-surface-500 rounded-xl px-4 py-3.5 outline-none transition-colors"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("emailPlaceholder")}
            required
            className="w-full bg-surface-800 border border-surface-600 focus:border-brand-500 text-white placeholder-surface-500 rounded-xl px-4 py-3.5 outline-none transition-colors"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("passwordPlaceholder")}
            required
            minLength={8}
            className="w-full bg-surface-800 border border-surface-600 focus:border-brand-500 text-white placeholder-surface-500 rounded-xl px-4 py-3.5 outline-none transition-colors"
          />

          {/* Code créateur — optionnel. Repli automatique sur cookie `gt_ref`
              si l'utilisateur a suivi un lien d'invitation. */}
          <div className="space-y-1.5">
            <label className="block text-surface-400 text-xs font-medium px-1">
              {t("creatorCodeLabel")}
            </label>
            <div className="relative">
              <input
                type="text"
                value={creatorCode}
                onChange={(e) => {
                  setCreatorCode(e.target.value);
                  // Dès que l'user édite manuellement on n'affiche plus le
                  // badge "détecté depuis lien" pour éviter la confusion
                  // (le code n'est plus celui du cookie d'origine).
                  setCodeFromCookie(false);
                }}
                placeholder={t("creatorCodePlaceholder")}
                maxLength={30}
                autoComplete="off"
                spellCheck={false}
                className="w-full bg-surface-800 border border-surface-600 focus:border-brand-500 text-white placeholder-surface-500 rounded-xl px-4 py-3 outline-none transition-colors lowercase"
              />
              {codeFromCookie && creatorCode.length > 0 && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 text-[10px] font-bold uppercase tracking-wider pointer-events-none">
                  {t("creatorCodeApplied")}
                </span>
              )}
            </div>
            <p className="text-surface-600 text-[11px] px-1 leading-relaxed">
              {t("creatorCodeHint")}
            </p>
          </div>

          <div className="space-y-3 rounded-xl bg-surface-900/60 border border-surface-700/30 p-4">
            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="relative mt-0.5 shrink-0">
                <input
                  type="checkbox"
                  checked={cguAccepted}
                  onChange={(e) => setCguAccepted(e.target.checked)}
                  className="sr-only"
                />
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                  cguAccepted
                    ? "bg-brand-600 border-brand-600"
                    : "bg-surface-800 border-surface-600 group-hover:border-brand-700"
                }`}>
                  {cguAccepted && <span className="text-white text-xs font-bold">✓</span>}
                </div>
              </div>
              <span className="text-surface-300 text-xs leading-relaxed">
                {t("consentCguPrefix")}{" "}
                <button
                  type="button"
                  onClick={() => setLegalModal("cgu")}
                  className="text-brand-400 hover:text-brand-300 underline underline-offset-2"
                >
                  {t("consentCguLinkCgu")}
                </button>{" "}
                {t("consentCguMid")}{" "}
                <button
                  type="button"
                  onClick={() => setLegalModal("privacy")}
                  className="text-brand-400 hover:text-brand-300 underline underline-offset-2"
                >
                  {t("consentCguLinkPrivacy")}
                </button>{t("consentCguDot")} <span className="text-red-500">*</span>
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="relative mt-0.5 shrink-0">
                <input
                  type="checkbox"
                  checked={ageConfirmed}
                  onChange={(e) => setAgeConfirmed(e.target.checked)}
                  className="sr-only"
                />
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                  ageConfirmed
                    ? "bg-brand-600 border-brand-600"
                    : "bg-surface-800 border-surface-600 group-hover:border-brand-700"
                }`}>
                  {ageConfirmed && <span className="text-white text-xs font-bold">✓</span>}
                </div>
              </div>
              <span
                className="text-surface-300 text-xs leading-relaxed"
                dangerouslySetInnerHTML={{ __html: t.raw("consentAge") + " <span class='text-red-500'>*</span>" }}
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={loading || !cguAccepted || !ageConfirmed}
            className="w-full bg-gradient-brand text-white font-bold py-4 rounded-2xl transition-all disabled:opacity-40 hover:opacity-90"
          >
            {loading ? t("submitting") : t("submit")}
          </button>
        </form>

        <p className="text-center text-surface-400 text-sm mt-6">
          {t("haveAccount")}{" "}
          <Link href={`/auth/login?redirect=${redirect}`} className="text-brand-400 font-medium hover:underline">
            {t("loginLink")}
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
