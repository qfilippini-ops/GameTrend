// Registry statique des items "Avenir". Chaque item a un `slug` stable
// utilisé comme clé pour les votes en BDD (table roadmap_votes). Les
// labels et descriptions sont gérés via i18n (clés `home.roadmap.items`).
//
// Pour ajouter un item, ajouter une entrée ici + les clés i18n dans
// fr.json et en.json. Pas de migration BDD nécessaire.

export type RoadmapKind = "game" | "feature";

export interface RoadmapItem {
  /** Identifiant stable utilisé en BDD (PK des votes). NE JAMAIS modifier. */
  slug: string;
  kind: RoadmapKind;
  /** Suffixe i18n : home.roadmap.items.{i18nKey}.title|desc */
  i18nKey: string;
  icon: string;
}

export const ROADMAP_ITEMS: RoadmapItem[] = [
  // ── Jeux à venir ────────────────────────────────────────────────────
  {
    slug: "game.quiz",
    kind: "game",
    i18nKey: "quiz",
    icon: "🧩",
  },
  {
    slug: "game.myteam",
    kind: "game",
    i18nKey: "myteam",
    icon: "🤝",
  },

  // ── Fonctionnalités à venir ─────────────────────────────────────────
  {
    slug: "feature.voice",
    kind: "feature",
    i18nKey: "voice",
    icon: "🎙️",
  },
  {
    slug: "feature.tournament",
    kind: "feature",
    i18nKey: "tournament",
    icon: "🏆",
  },
];

/** Retourne tous les slugs (utilitaire pour les RPC). */
export function getAllRoadmapSlugs(): string[] {
  return ROADMAP_ITEMS.map((i) => i.slug);
}
