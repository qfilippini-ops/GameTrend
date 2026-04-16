"use client";

/**
 * Registre des formulaires de création/édition de preset par jeu.
 *
 * Pour ajouter un nouveau jeu :
 *   1. Créer src/games/monjeu/components/PresetForm.tsx
 *      → doit respecter PresetFormProps (src/types/adapters.ts)
 *   2. L'importer ici et l'ajouter dans PRESET_FORM_MAP
 *
 * Séparé de registry.ts car il contient des composants React (client-only).
 */

import type { ComponentType } from "react";
import type { PresetFormProps } from "@/types/adapters";
import GhostWordPresetForm from "@/components/presets/PresetForm";
import DYPPresetForm from "@/games/dyp/components/PresetForm";

const PRESET_FORM_MAP: Record<string, ComponentType<PresetFormProps>> = {
  ghostword: GhostWordPresetForm as ComponentType<PresetFormProps>,
  dyp: DYPPresetForm as ComponentType<PresetFormProps>,
};

/**
 * Retourne le composant de formulaire de preset pour un jeu donné.
 * Fallback sur GhostWord si le type est inconnu.
 */
export function getPresetFormComponent(gameType: string): ComponentType<PresetFormProps> {
  return PRESET_FORM_MAP[gameType] ?? PRESET_FORM_MAP["ghostword"];
}
