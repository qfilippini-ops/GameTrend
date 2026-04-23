"use client";

import { useEffect, useState } from "react";
// On utilise volontairement le router de `next/navigation` (et NON celui de
// next-intl) : on veut écrire le pathname brut tel quel pour nettoyer la
// query string sans que next-intl re-préfixe la locale (ce qui produirait
// `/fr/fr/...`).
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";

type ToastKind = null | "kicked" | "lobby_closed";

export default function KickedToast() {
  const t = useTranslations("rooms");
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [kind, setKind] = useState<ToastKind>(null);

  useEffect(() => {
    let next: ToastKind = null;
    let paramToClear: string | null = null;
    if (searchParams.get("kicked") === "1") {
      next = "kicked";
      paramToClear = "kicked";
    } else if (searchParams.get("lobby_closed") === "1") {
      next = "lobby_closed";
      paramToClear = "lobby_closed";
    }
    if (!next) return;
    setKind(next);
    if (paramToClear) {
      const url = new URL(window.location.href);
      url.searchParams.delete(paramToClear);
      router.replace(url.pathname + (url.search || ""), { scroll: false });
    }
    const tm = setTimeout(() => setKind(null), 5000);
    return () => clearTimeout(tm);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  const visible = kind !== null;
  const title = kind === "lobby_closed" ? t("lobbyClosedTitle") : t("kickedTitle");
  const subtitle = kind === "lobby_closed" ? t("lobbyClosedSubtitle") : t("kickedSubtitle");
  const icon = kind === "lobby_closed" ? "🚷" : "🚪";

  return (
    <AnimatePresence>
      {visible && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[99] bg-black/40 backdrop-blur-sm"
            onClick={() => setKind(null)}
          />
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
                <div className="text-4xl">{icon}</div>
                <div>
                  <p className="text-white font-display font-bold text-base">{title}</p>
                  <p className="text-surface-400 text-sm mt-1">{subtitle}</p>
                </div>
                <button
                  onClick={() => setKind(null)}
                  className="w-full py-2.5 rounded-xl bg-surface-800/80 text-surface-300 text-sm font-medium hover:bg-surface-700/80 transition-colors border border-surface-700/40"
                >
                  {t("kickedClose")}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
