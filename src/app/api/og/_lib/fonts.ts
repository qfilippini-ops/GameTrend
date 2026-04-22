// Helper de chargement des fonts pour les routes OG (next/og ImageResponse).
//
// Pourquoi pas next/font/google ? next/font ne marche que dans le rendu HTML
// classique (<head> + CSS). Les routes OG génèrent une image PNG via Satori,
// qui réclame le binaire de la font (TTF/OTF/WOFF/WOFF2) en ArrayBuffer.
//
// Source : @fontsource servi via jsDelivr. URL stable, pas de clef API,
// pas de parsing CSS (contrairement à Google Fonts officiel qui répond du
// CSS qu'il faut ensuite parser pour récupérer l'URL du fichier binaire).

const FONTSOURCE_VERSION = "5.1.0";
const FONT_BASE = `https://cdn.jsdelivr.net/npm/@fontsource/inter@${FONTSOURCE_VERSION}/files`;

export interface OgFont {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 500 | 600 | 700 | 800 | 900;
  style: "normal" | "italic";
}

// Cache module-scope : la fonction module Node garde l'ArrayBuffer en mémoire
// entre invocations Lambda warm. Coût premier appel = ~200ms, suivants = 0.
let cachedFonts: OgFont[] | null = null;

export async function loadInterFonts(): Promise<OgFont[]> {
  if (cachedFonts) return cachedFonts;

  const [regular, bold, black] = await Promise.all([
    fetch(`${FONT_BASE}/inter-latin-400-normal.woff`).then((r) => r.arrayBuffer()),
    fetch(`${FONT_BASE}/inter-latin-700-normal.woff`).then((r) => r.arrayBuffer()),
    fetch(`${FONT_BASE}/inter-latin-900-normal.woff`).then((r) => r.arrayBuffer()),
  ]);

  cachedFonts = [
    { name: "Inter", data: regular, weight: 400, style: "normal" },
    { name: "Inter", data: bold, weight: 700, style: "normal" },
    { name: "Inter", data: black, weight: 900, style: "normal" },
  ];
  return cachedFonts;
}
