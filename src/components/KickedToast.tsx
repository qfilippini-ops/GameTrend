"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

export default function KickedToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (searchParams.get("kicked") === "1") {
      setVisible(true);
      // Nettoyer le paramètre de l'URL sans rechargement
      const url = new URL(window.location.href);
      url.searchParams.delete("kicked");
      router.replace(url.pathname + (url.search || ""), { scroll: false });
      // Auto-dismiss après 5s
      const t = setTimeout(() => setVisible(false), 5000);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -60 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -60 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-2rem)] max-w-sm"
        >
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-red-700/40 bg-surface-950/95 backdrop-blur-xl shadow-xl"
            style={{ boxShadow: "0 0 30px rgba(239,68,68,0.12), 0 8px 32px rgba(0,0,0,0.6)" }}>
            <span className="text-2xl shrink-0">🚪</span>
            <div className="flex-1">
              <p className="text-white font-display font-bold text-sm">Tu as été expulsé du salon</p>
              <p className="text-surface-500 text-xs mt-0.5">L&apos;hôte t&apos;a retiré de la partie</p>
            </div>
            <button
              onClick={() => setVisible(false)}
              className="text-surface-600 hover:text-white text-sm transition-colors shrink-0"
            >
              ✕
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
