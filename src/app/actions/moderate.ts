"use server";

export interface ModerationResult {
  safe: boolean;
  reason?: string;
}

/**
 * Vérifie une image via l'API Sightengine (côté serveur).
 * Le log des scores est actif pour calibration — à désactiver une fois les seuils finaux trouvés.
 */
export async function checkImageSafety(
  imageBuffer: number[],
  mimeType: string,
  fileName: string
): Promise<ModerationResult> {
  const apiUser = process.env.SIGHTENGINE_API_USER;
  const apiSecret = process.env.SIGHTENGINE_API_SECRET;

  if (!apiUser || !apiSecret) {
    return { safe: true };
  }

  try {
    const blob = new Blob([new Uint8Array(imageBuffer)], { type: mimeType });
    const file = new File([blob], fileName, { type: mimeType });

    const formData = new FormData();
    formData.append("media", file);
    formData.append("models", "nudity-2.1,gore");
    formData.append("api_user", apiUser);
    formData.append("api_secret", apiSecret);

    const response = await fetch("https://api.sightengine.com/1.0/check.json", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      console.warn("[moderate] API Sightengine indisponible, upload autorisé");
      return { safe: true };
    }

    const data = await response.json();

    // Log complet pour calibration — visible dans le terminal local et les logs Vercel
    console.log("[moderate] scores pour", fileName, ":", JSON.stringify({
      nudity: data?.nudity,
      gore: data?.gore?.prob,
    }, null, 2));

    const sexualActivity = data?.nudity?.sexual_activity ?? 0;
    const sexualDisplay  = data?.nudity?.sexual_display  ?? 0;
    const erotica        = data?.nudity?.erotica          ?? 0;
    const gore           = data?.gore?.prob               ?? 0;

    if (sexualActivity > 0.20 || sexualDisplay > 0.12) {
      return { safe: false, reason: "Cette image contient du contenu sexuel ou nudité et ne peut pas être publiée." };
    }
    if (erotica > 0.22) {
      return { safe: false, reason: "Cette image contient du contenu érotique ou hentai et ne peut pas être publiée." };
    }
    // Seuil gore : 0.80 — laisse passer le sang léger (blessure cartoon, éclaboussure
    // de jeu vidéo, scènes d'action sans cadavre) mais bloque le gore explicite.
    // À ajuster en fonction des logs si trop laxiste / trop strict.
    if (gore > 0.80) {
      return { safe: false, reason: "Cette image contient du contenu violent et ne peut pas être publiée." };
    }

    return { safe: true };
  } catch (err) {
    console.warn("[moderate] Erreur, upload autorisé :", err);
    return { safe: true };
  }
}
