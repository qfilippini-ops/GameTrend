"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import LegalModal from "@/components/legal/LegalModal";

// Version des CGU en vigueur — à mettre à jour lors de chaque révision
const CGU_VERSION = "2025-04";

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageContent />
    </Suspense>
  );
}

function SignupPageContent() {
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

  const supabase = createClient();

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();

    if (!cguAccepted) {
      setError("Tu dois accepter les CGU et la politique de confidentialité pour continuer.");
      return;
    }
    if (!ageConfirmed) {
      setError("Tu dois confirmer avoir 16 ans ou plus pour créer un compte.");
      return;
    }
    if (password.length < 8) {
      setError("Le mot de passe doit contenir au moins 8 caractères.");
      return;
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

    // Enregistrer le timestamp CGU directement dans profiles si l'utilisateur existe déjà
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
          <h1 className="text-2xl font-display font-bold text-white mb-3">Compte créé !</h1>
          <p className="text-surface-400 mb-6">
            Vérifie tes emails pour confirmer ton compte. Un lien t'a été envoyé
            à <span className="text-white font-medium">{email}</span>.
          </p>
          <Link href="/auth/login" className="text-brand-400 font-medium hover:underline">
            Aller à la connexion
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
          <h1 className="text-3xl font-display font-black text-white mb-2">Inscription</h1>
          <p className="text-surface-400 text-sm">Crée des presets et rejoins la communauté</p>
        </div>

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
            placeholder="Pseudo (ex: GameMaster42)"
            required
            maxLength={30}
            className="w-full bg-surface-800 border border-surface-600 focus:border-brand-500 text-white placeholder-surface-500 rounded-xl px-4 py-3.5 outline-none transition-colors"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ton@email.com"
            required
            className="w-full bg-surface-800 border border-surface-600 focus:border-brand-500 text-white placeholder-surface-500 rounded-xl px-4 py-3.5 outline-none transition-colors"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mot de passe (8 caractères min.)"
            required
            minLength={8}
            className="w-full bg-surface-800 border border-surface-600 focus:border-brand-500 text-white placeholder-surface-500 rounded-xl px-4 py-3.5 outline-none transition-colors"
          />

          {/* Checkboxes de consentement */}
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
                J'ai lu et j'accepte les{" "}
                <button
                  type="button"
                  onClick={() => setLegalModal("cgu")}
                  className="text-brand-400 hover:text-brand-300 underline underline-offset-2"
                >
                  CGU
                </button>{" "}
                et la{" "}
                <button
                  type="button"
                  onClick={() => setLegalModal("privacy")}
                  className="text-brand-400 hover:text-brand-300 underline underline-offset-2"
                >
                  Politique de confidentialité
                </button>. <span className="text-red-500">*</span>
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
              <span className="text-surface-300 text-xs leading-relaxed">
                Je confirme avoir <strong className="text-white">16 ans ou plus</strong>. <span className="text-red-500">*</span>
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading || !cguAccepted || !ageConfirmed}
            className="w-full bg-gradient-brand text-white font-bold py-4 rounded-2xl transition-all disabled:opacity-40 hover:opacity-90"
          >
            {loading ? "Création..." : "Créer mon compte 🚀"}
          </button>
        </form>

        <p className="text-center text-surface-400 text-sm mt-6">
          Déjà un compte ?{" "}
          <Link href={`/auth/login?redirect=${redirect}`} className="text-brand-400 font-medium hover:underline">
            Se connecter
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
