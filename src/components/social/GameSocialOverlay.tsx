"use client";

import GroupPanel from "@/components/social/GroupPanel";

/**
 * Overlay flottant à utiliser dans les scènes de jeu en plein écran (4 jeux
 * online). Affiche uniquement le bouton du groupe (chat + membres + invites)
 * pour que le joueur garde l'accès au groupe pendant la partie sans casser
 * les layouts existants `h-screen` / `min-h-screen`.
 *
 * Les notifications push d'invitation sont gérées séparément (`GroupInviteToasts`)
 * et toujours visibles via le layout global.
 */
export default function GameSocialOverlay() {
  return (
    <div
      className="fixed top-2 right-2 z-40 pt-safe pr-safe pointer-events-none"
      aria-label="game social overlay"
    >
      <div className="pointer-events-auto">
        <GroupPanel />
      </div>
    </div>
  );
}
