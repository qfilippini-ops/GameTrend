"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";

/**
 * Bouton flottant affiché sur la page profil pour sauter directement à la
 * section "Mon abonnement / Préférences / Affiliation / Légal" sans avoir
 * à scroller à travers tout le feed d'activité ou la grille de presets.
 *
 * Visibilité dynamique :
 *   - On observe la section ancre (#account-section) via IntersectionObserver.
 *   - Tant qu'elle n'est pas visible (≥ 20 % en viewport) on affiche le bouton.
 *   - Dès qu'elle entre, le bouton disparaît avec une légère animation pour
 *     ne pas masquer la BottomNav ni la section elle-même.
 *
 * Positionnement :
 *   - `fixed bottom-24` pour rester au-dessus de la BottomNav (h ≈ 80 px).
 *   - `right-4` côté droit, hors zone des badges latéraux.
 *   - `z-30` : au-dessus du contenu mais en dessous des modales (z-50+).
 *
 * Implémentation simple sans portal : la flèche n'est utile que dans la page
 * profil, pas besoin de l'extraire du DOM local.
 */
export default function ScrollToAccountButton() {
  const t = useTranslations("profile");
  const [visible, setVisible] = useState(false);
  // On retient l'observer pour le déconnecter au démontage et éviter les
  // setState après unmount (warnings en dev).
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const target = document.getElementById("account-section");
    if (!target) return;

    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        // Le bouton est utile UNIQUEMENT tant que la cible n'a pas atteint
        // le viewport. Dès qu'elle est visible (même partiellement), inutile
        // de proposer le raccourci.
        setVisible(!entry.isIntersecting);
      },
      { threshold: 0.2 }
    );
    observerRef.current.observe(target);

    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, []);

  function handleClick() {
    const target = document.getElementById("account-section");
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          type="button"
          onClick={handleClick}
          aria-label={t("scrollToAccountAria")}
          title={t("scrollToAccountTitle")}
          initial={{ opacity: 0, y: 12, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.9 }}
          transition={{ duration: 0.18 }}
          className="fixed bottom-24 right-4 z-30 flex items-center gap-2 px-4 py-3 rounded-full bg-gradient-brand text-white text-xs font-bold shadow-lg shadow-brand-900/40 hover:opacity-95 active:scale-95 transition-all"
        >
          <span>{t("scrollToAccountLabel")}</span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <polyline points="19 12 12 19 5 12" />
          </svg>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
