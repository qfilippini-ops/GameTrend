"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import CreatorStats from "@/components/profile/CreatorStats";

interface StatsAccordionProps {
  userId: string;
  followersCount: number;
}

// Wrapper accordéon (fermé par défaut) pour la section "Stats" sur les pages
// profil. Charge le contenu réel de `CreatorStats` uniquement quand ouvert,
// pour éviter de payer la double requête côté Supabase si non visité.
export default function StatsAccordion({
  userId,
  followersCount,
}: StatsAccordionProps) {
  const t = useTranslations("profile.public");
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);

  return (
    <section className="rounded-2xl border border-surface-700/40 bg-surface-900/40 overflow-hidden">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!hasOpened) setHasOpened(true);
        }}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-surface-800/30 transition-colors"
      >
        <span className="font-display font-bold text-sm text-surface-100 flex items-center gap-2">
          <span>📊</span>
          {t("stats")}
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.18 }}
          className="text-surface-400"
          aria-hidden
        >
          ▾
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden border-t border-surface-700/40"
          >
            <div className="p-4">
              {hasOpened && (
                <CreatorStats
                  userId={userId}
                  followersCount={followersCount}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
