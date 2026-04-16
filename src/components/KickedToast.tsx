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
      const url = new URL(window.location.href);
      url.searchParams.delete("kicked");
      router.replace(url.pathname + (url.search || ""), { scroll: false });
      const t = setTimeout(() => setVisible(false), 5000);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[99] bg-black/40 backdrop-blur-sm"
            onClick={() => setVisible(false)}
          />
          {/* Toast centré */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none px-6"
          >
            <div
              className="pointer-events-auto w-full max-w-xs rounded-3xl border border-red-700/30 bg-surface-950/98 backdrop-blur-xl shadow-2xl overflow-hidden"
              style={{ boxShadow: "0 0 40px rgba(239,68,68,0.15), 0 20px 60px rgba(0,0,0,0.8)" }}
            >
              <div className="px-6 py-6 text-center space-y-3">
                <div className="text-4xl">🚪</div>
                <div>
                  <p className="text-white font-display font-bold text-base">Tu as été expulsé</p>
                  <p className="text-surface-400 text-sm mt-1">L&apos;hôte t&apos;a retiré de la partie</p>
                </div>
                <button
                  onClick={() => setVisible(false)}
                  className="w-full py-2.5 rounded-xl bg-surface-800/80 text-surface-300 text-sm font-medium hover:bg-surface-700/80 transition-colors border border-surface-700/40"
                >
                  Fermer
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
