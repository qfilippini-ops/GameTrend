"use client";

import { usePathname } from "next/navigation";

/**
 * Wrapper du `<main>` racine.
 *
 * L'app est mobile-first PWA → par défaut on contraint la largeur à
 * `max-w-lg` (512 px) pour préserver la lisibilité. Mais certaines pages
 * admin (dashboard, simulator) ont besoin de toute la largeur PC pour
 * afficher leurs grilles d'inputs et leurs panneaux de résultats.
 *
 * On détecte simplement si la pathname commence par `/<locale>/admin/` et
 * on retire la contrainte dans ce cas.
 */
export default function MainContainer({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  // matche `/fr/admin`, `/en/admin`, etc.
  const isAdmin = /^\/[a-z]{2}\/admin(\/|$)/.test(pathname);

  return (
    <main
      className={
        isAdmin ? "pb-24 w-full" : "pb-24 max-w-lg mx-auto"
      }
    >
      {children}
    </main>
  );
}
