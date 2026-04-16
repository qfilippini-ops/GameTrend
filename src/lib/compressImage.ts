import imageCompression from "browser-image-compression";

export interface CompressOptions {
  /** Largeur max en pixels (hauteur ajustée proportionnellement). Défaut : 1200 */
  maxWidthOrHeight?: number;
  /** Taille max du fichier en Mo. Défaut : 0.5 */
  maxSizeMB?: number;
  /** Qualité WebP 0-1 (utilisée uniquement pour la conversion Canvas). Défaut : 0.85 */
  quality?: number;
}

/**
 * Compresse une image côté navigateur et la convertit en WebP si supporté.
 * Retourne un File prêt à uploader vers Supabase Storage.
 *
 * Fallback automatique vers le fichier original si une erreur survient.
 */
export async function compressImage(
  file: File,
  options: CompressOptions = {}
): Promise<File> {
  const {
    maxWidthOrHeight = 1200,
    maxSizeMB = 0.5,
    quality = 0.85,
  } = options;

  try {
    // ── Étape 1 : compression via browser-image-compression ───────
    const compressed = await imageCompression(file, {
      maxSizeMB,
      maxWidthOrHeight,
      useWebWorker: true,
      // Preserve EXIF uniquement si l'image est déjà orientée correctement
      exifOrientation: -1,
    });

    // ── Étape 2 : conversion WebP via Canvas (si supporté) ────────
    const webpFile = await toWebP(compressed, quality);

    const originalKB = Math.round(file.size / 1024);
    const finalKB = Math.round(webpFile.size / 1024);
    console.debug(
      `[compressImage] ${file.name} : ${originalKB} KB → ${finalKB} KB` +
      ` (−${Math.round((1 - finalKB / originalKB) * 100)}%)`
    );

    return webpFile;
  } catch (err) {
    console.warn("[compressImage] Échec compression, fichier original utilisé :", err);
    return file;
  }
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

          // Vérifier que le navigateur a bien produit du WebP
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
