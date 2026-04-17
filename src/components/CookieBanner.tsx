"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

const COOKIE_KEY = "cookie-consent";

type Consent = "all" | "essential" | null;

export default function CookieBanner() {
  const [show, setShow] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(COOKIE_KEY);
    if (!saved) setTimeout(() => setShow(true), 1500);

    // Écoute l'événement déclenché depuis le profil
    function handleOpen() {
      setShowDetails(false);
      setShow(true);
    }
    window.addEventListener("open-cookie-settings", handleOpen);
    return () => window.removeEventListener("open-cookie-settings", handleOpen);
  }, []);

  function accept(choice: Consent) {
    localStorage.setItem(COOKIE_KEY, choice ?? "essential");
    setShow(false);
    // Si l'utilisateur accepte tout, on peut activer Google Analytics ici
    if (choice === "all" && typeof window !== "undefined") {
      // window.gtag?.("consent", "update", { analytics_storage: "granted" });
    }
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 120, opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
          className="fixed bottom-24 left-0 right-0 z-[90] flex justify-center px-4"
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-surface-700/30 bg-surface-950/98 backdrop-blur-xl overflow-hidden"
            style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.7)" }}
          >
            <div className="px-5 pt-5 pb-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🍪</span>
                <p className="text-white font-display font-bold text-sm">Cookies & confidentialité</p>
              </div>
              <p className="text-surface-400 text-xs leading-relaxed">
                GameTrend utilise des cookies essentiels pour fonctionner et, avec ton accord, des cookies analytiques (Google Analytics) pour améliorer le service. Des cookies publicitaires pourront être activés ultérieurement avec ton consentement.{" "}
                <Link href="/legal/privacy" className="text-brand-400 underline underline-offset-2">
                  En savoir plus
                </Link>
              </p>

              {showDetails && (
                <div className="space-y-2 rounded-xl bg-surface-900/60 border border-surface-700/30 p-3">
                  {[
                    { label: "Essentiels", desc: "Session, préférences. Toujours actifs.", active: true, required: true },
                    { label: "Analytiques (Google Analytics)", desc: "Statistiques d'utilisation anonymisées.", active: false, required: false },
                    { label: "Publicitaires (futur)", desc: "Publicités personnalisées. Désactivés pour l'instant.", active: false, required: false, disabled: true },
                  ].map((item) => (
                    <div key={item.label} className="flex items-start gap-3">
                      <div className={`mt-0.5 w-3 h-3 rounded-full shrink-0 ${item.active || item.required ? "bg-brand-500" : item.disabled ? "bg-surface-700" : "bg-surface-600"}`} />
                      <div>
                        <p className="text-white text-xs font-medium">{item.label} {item.required && <span className="text-surface-500">(requis)</span>}</p>
                        <p className="text-surface-500 text-[10px]">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={() => setShowDetails(!showDetails)}
                className="text-surface-500 text-xs underline underline-offset-2 hover:text-surface-300 transition-colors"
              >
                {showDetails ? "Masquer les détails" : "Voir les détails"}
              </button>
            </div>

            <div className="px-5 pb-5 flex gap-2">
              <button
                onClick={() => accept("essential")}
                className="flex-1 py-2.5 rounded-2xl bg-surface-800/80 text-surface-300 text-xs font-semibold border border-surface-700/40 hover:border-surface-600/60 transition-all"
              >
                Essentiels seulement
              </button>
              <button
                onClick={() => accept("all")}
                className="flex-1 py-2.5 rounded-2xl font-semibold text-xs text-white transition-all"
                style={{ background: "linear-gradient(135deg, #6d28d9, #4f46e5)" }}
              >
                Tout accepter
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
