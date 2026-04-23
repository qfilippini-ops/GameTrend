/**
 * Familles de presets — concept d'abstraction pour la création.
 *
 * Une famille = un format de config commun + un formulaire + une liste de
 * jeux qui partagent ce format. Permet d'éviter de demander à l'utilisateur
 * de choisir entre "DYP" et "Blind Rank" lors de la création alors qu'il
 * crée exactement la même chose dans les deux cas.
 *
 * Exemple : la famille "cards" (Cartes & Classements) regroupe DYP et
 * Blind Rank. L'utilisateur crée un preset de cartes une seule fois, et il
 * est automatiquement jouable dans les deux jeux via `acceptedPresetTypes`.
 *
 * Convention DB : on stocke en `presets.game_type` le **premier** game_type
 * de la famille (= "canonical"). Tous les jeux de la famille pourront
 * jouer ce preset grâce à `getAcceptedPresetTypes` (compat.ts).
 *
 * Rétrocompat : les presets créés AVANT l'introduction des familles peuvent
 * avoir n'importe quel game_type de la famille (ex: 'blindrank'). Tout
 * continue de fonctionner car le filtrage côté UI passe toujours par
 * `getAcceptedPresetTypes`.
 */

import { GAMES_REGISTRY } from "@/games/registry";
import type { GameMeta } from "@/types/games";

export interface PresetFamily {
  /** ID stable utilisé dans les URLs (`?family=cards`) et les traductions */
  id: string;
  /** Liste ordonnée des `game_type` que cette famille produit / accepte.
   *  Le premier élément est le type CANONICAL stocké en DB lors d'une création. */
  gameTypes: string[];
  /** Icône représentative — pas l'icône d'un jeu spécifique mais du format */
  icon: string;
  /** Clé de traduction pour le nom (sous `presets.families.<id>.name`) */
  i18nKey: string;
}

export const PRESET_FAMILIES: PresetFamily[] = [
  {
    id: "words",
    gameTypes: ["ghostword"],
    icon: "👻",
    i18nKey: "words",
  },
  {
    id: "cards",
    gameTypes: ["dyp", "blindrank", "outbid"],
    icon: "🃏",
    i18nKey: "cards",
  },
];

/** Retourne la famille à laquelle appartient un `game_type`, ou null. */
export function getFamilyForGameType(gameType: string): PresetFamily | null {
  return PRESET_FAMILIES.find((f) => f.gameTypes.includes(gameType)) ?? null;
}

/** Retourne la famille par son id, ou null. */
export function getFamilyById(familyId: string): PresetFamily | null {
  return PRESET_FAMILIES.find((f) => f.id === familyId) ?? null;
}

/**
 * Retourne le `game_type` canonical d'une famille = celui qu'on stocke en
 * DB lors de la création. Convention : premier élément de `gameTypes`.
 */
export function getCanonicalGameType(family: PresetFamily): string {
  return family.gameTypes[0];
}

/**
 * Retourne les métadonnées des jeux compatibles avec une famille (utile
 * pour afficher les badges "Compatible avec : DYP, Blind Rank").
 */
export function getFamilyGames(family: PresetFamily): GameMeta[] {
  return family.gameTypes
    .map((gt) => GAMES_REGISTRY.find((g) => g.id === gt))
    .filter((g): g is GameMeta => g !== undefined);
}

/**
 * Sécurité dev : si un game_type est ajouté au registry mais oublié dans
 * une famille, on log un warning au démarrage. Évite les bugs silencieux
 * (preset créé mais invisible dans la bibliothèque).
 */
if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
  const allFamilyGameTypes = new Set(
    PRESET_FAMILIES.flatMap((f) => f.gameTypes)
  );
  for (const game of GAMES_REGISTRY) {
    if (!allFamilyGameTypes.has(game.id)) {
      // eslint-disable-next-line no-console
      console.warn(
        `[preset-families] Le jeu "${game.id}" n'appartient à aucune PresetFamily. ` +
          `Ajoute-le dans src/games/preset-families.ts sinon ses presets seront introuvables dans /presets/new.`
      );
    }
  }
}
