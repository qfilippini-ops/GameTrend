/**
 * Modération d'images côté client — appelle la Server Action `checkImageSafety`
 * qui contacte l'API Sightengine côté serveur (clés jamais exposées au navigateur).
 *
 * Fail-open : si la modération est indisponible, l'upload est autorisé.
 */

import { checkImageSafety } from "@/app/actions/moderate";

export interface ModerationResult {
  safe: boolean;
  reason?: string;
}

export class ModerationError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "ModerationError";
  }
}

export async function moderateImage(file: File): Promise<ModerationResult> {
  if (typeof window === "undefined") return { safe: true };

  try {
    // Convertir le File en tableau d'octets pour l'envoyer à la Server Action
    const arrayBuffer = await file.arrayBuffer();
    const imageBuffer = Array.from(new Uint8Array(arrayBuffer));

    const result = await checkImageSafety(imageBuffer, file.type, file.name);
    return result;
  } catch (err) {
    console.warn("[moderateImage] Erreur, upload autorisé :", err);
    return { safe: true };
  }
}
