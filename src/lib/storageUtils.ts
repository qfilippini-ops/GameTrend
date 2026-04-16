/**
 * Extrait le chemin de stockage Supabase depuis une URL publique du bucket "covers".
 * Ex: "https://xxx.supabase.co/storage/v1/object/public/covers/uid/file.webp"
 *     → "uid/file.webp"
 * Retourne null si l'URL n'appartient pas au bucket "covers".
 */
export function extractStoragePath(publicUrl: string): string | null {
  try {
    const marker = "/object/public/covers/";
    const idx = publicUrl.indexOf(marker);
    if (idx === -1) return null;
    return decodeURIComponent(publicUrl.slice(idx + marker.length));
  } catch {
    return null;
  }
}
