"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const STORAGE_KEY = "pwa-install-dismissed";

export default function PWAInstallBanner() {
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    // Ne jamais afficher si déjà installé ou déjà refusé
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      localStorage.getItem(STORAGE_KEY)
    ) return;

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /safari/i.test(navigator.userAgent) && !/chrome/i.test(navigator.userAgent);

    if (ios && isSafari) {
      setIsIOS(true);
      // Afficher après 3s sur iOS Safari
      const t = setTimeout(() => setShow(true), 3000);
      return () => clearTimeout(t);
    }

    // Android / Chrome — écouter l'événement natif
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setTimeout(() => setShow(true), 3000);
    };
    window.addEventListener("beforeinstallprompt", handler as EventListener);
    return () => window.removeEventListener("beforeinstallprompt", handler as EventListener);
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    setShow(false);
  }

  async function handleInstall() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setShow(false);
      }
    }
    dismiss();
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 120, opacity: 0 }}
          transition={{ type: "spring", stiffness: 280, damping: 26 }}
          className="fixed bottom-28 left-0 right-0 z-[80] flex justify-center px-4"
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-surface-700/30 bg-surface-950/98 backdrop-blur-xl overflow-hidden"
            style={{ boxShadow: "0 0 40px rgba(109,40,217,0.15), 0 20px 50px rgba(0,0,0,0.7)" }}
          >
            <div className="px-5 py-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-700 to-brand-900 flex items-center justify-center shrink-0 border border-brand-700/40">
                <span className="text-2xl">👻</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-display font-bold text-sm">Installer GameTrend</p>
                <p className="text-surface-400 text-xs mt-0.5 leading-snug">
                  {isIOS
                    ? "Tap le bouton partage puis \"Sur l'écran d'accueil\""
                    : "Accède au jeu comme une vraie app, sans navigateur"}
                </p>
              </div>
              <button
                onClick={dismiss}
                className="text-surface-600 hover:text-surface-400 text-lg transition-colors shrink-0 w-7 h-7 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {!isIOS && (
              <div className="px-5 pb-4">
                <button
                  onClick={handleInstall}
                  className="w-full py-3 rounded-2xl font-display font-bold text-sm text-white transition-all"
                  style={{
                    background: "linear-gradient(135deg, #6d28d9, #4f46e5)",
                    boxShadow: "0 0 20px rgba(109,40,217,0.3)",
                  }}
                >
                  ⚡ Installer l&apos;app
                </button>
              </div>
            )}

            {isIOS && (
              <div className="px-5 pb-4 flex items-center gap-2 bg-surface-900/40 mx-4 mb-4 rounded-2xl px-3 py-2.5">
                <span className="text-lg">⬆️</span>
                <p className="text-surface-400 text-xs">Partage → &quot;Sur l&apos;écran d&apos;accueil&quot;</p>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
