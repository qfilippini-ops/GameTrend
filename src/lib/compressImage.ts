import imageCompression from "browser-image-compression";
import { moderateImage } from "./moderateImage";

export interface CompressOptions {
  /** Largeur max en pixels (hauteur ajustée proportionnellement). Défaut : 1200 */
  maxWidthOrHeight?: number;
  /** Taille max du fichier en Mo. Défaut : 0.5 */
  maxSizeMB?: number;
  /** Qualité WebP 0-1 (utilisée uniquement pour la conversion Canvas). Défaut : 0.85 */
  quality?: number;
  /** Activer la modération NSFW après compression. Défaut : true */
  moderate?: boolean;
}

export class ModerationError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "ModerationError";
  }
}

/**
 * Compresse une image côté navigateur, la convertit en WebP, puis lance la modération NSFW.
 * La compression se fait EN PREMIER pour que le buffer envoyé au serveur soit < 0.5 MB
 * (limite de la Server Action Next.js).
 *
 * Lève une `ModerationError` si l'image est inappropriée.
 */
export async function compressImage(
  file: File,
  options: CompressOptions = {}
): Promise<File> {
  const {
    maxWidthOrHeight = 1200,
    maxSizeMB = 0.5,
    quality = 0.85,
    moderate = true,
  } = options;

  let webpFile: File = file;

  try {
    // ── Étape 1 : compression via browser-image-compression ───────
    const compressed = await imageCompression(file, {
      maxSizeMB,
      maxWidthOrHeight,
      useWebWorker: true,
      exifOrientation: -1,
    });

    // ── Étape 2 : conversion WebP via Canvas ──────────────────────
    webpFile = await toWebP(compressed, quality);

    const originalKB = Math.round(file.size / 1024);
    const finalKB = Math.round(webpFile.size / 1024);
    console.debug(
      `[compressImage] ${file.name} : ${originalKB} KB → ${finalKB} KB` +
      ` (−${Math.round((1 - finalKB / originalKB) * 100)}%)`
    );
  } catch (err) {
    console.warn("[compressImage] Échec compression, fichier original utilisé :", err);
    webpFile = file;
  }

  // ── Étape 3 : modération NSFW sur le fichier compressé (toujours < 0.5 MB) ──
  if (moderate) {
    const result = await moderateImage(webpFile);
    if (!result.safe) {
      throw new ModerationError(
        result.reason ?? "Cette image contient du contenu inapproprié."
      );
    }
  }

  return webpFile;
}

/**
 * Convertit un File image en WebP via Canvas API.
 * Si le navigateur ne supporte pas WebP en output, retourne le fichier tel quel.
 */
async function toWebP(file: File, quality: number): Promise<File> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);

      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0);

      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return; }

          if (!blob.type.includes("webp")) {
            resolve(file);
            return;
          }

          const baseName = file.name.replace(/\.[^.]+$/, "");
          resolve(new File([blob], `${baseName}.webp`, { type: "image/webp" }));
        },
        "image/webp",
        quality
      );
    };

    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}
