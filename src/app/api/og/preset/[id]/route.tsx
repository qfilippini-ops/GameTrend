import { ImageResponse } from "next/og";
import { createPublicClient } from "@/lib/supabase/server";
import { loadInterFonts } from "@/app/api/og/_lib/fonts";

// OG image dynamique pour un preset (1200x630).
//
// Layout :
//   - Si cover_url existe → cover en background (objectFit cover) + overlay
//     sombre dégradé pour garantir la lisibilité du texte par-dessus.
//   - Sinon → fallback gradient de marque uniquement.
//   - Texte (badge jeu, titre, auteur, brand) en Inter, taille calibrée pour
//     les previews Discord/X/WhatsApp (zoom à 600px de large environ).
//
// Cache HTTP agressif (24h) car le contenu bouge peu.

export const runtime = "nodejs";

const WIDTH = 1200;
const HEIGHT = 630;

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createPublicClient();
  const { data: preset } = await supabase
    .from("presets")
    .select("name, description, game_type, cover_url, profiles!author_id(username)")
    .eq("id", params.id)
    .eq("is_public", true)
    .maybeSingle();

  if (!preset) {
    return new Response("Not found", { status: 404 });
  }

  const author = (preset.profiles as { username: string | null } | null)?.username;
  const gameLabel =
    preset.game_type === "ghostword"
      ? "GhostWord"
      : preset.game_type === "dyp"
        ? "DYP"
        : preset.game_type;
  const gameEmoji =
    preset.game_type === "ghostword" ? "👻" : preset.game_type === "dyp" ? "⚡" : "🎮";

  const fonts = await loadInterFonts();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #0c1145 0%, #1a0a2e 50%, #3b0040 100%)",
          color: "white",
          position: "relative",
          fontFamily: "Inter",
        }}
      >
        {preset.cover_url && (
          <img
            src={preset.cover_url}
            alt=""
            width={WIDTH}
            height={HEIGHT}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        )}

        {/* Overlay : assombrit la cover pour que le texte reste lisible. */}
        {/* Si pas de cover, on garde quand même l'overlay : il rajoute une */}
        {/* profondeur sympa au gradient brand. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: preset.cover_url
              ? "linear-gradient(135deg, rgba(12,17,69,0.78) 0%, rgba(26,10,46,0.82) 50%, rgba(59,0,64,0.88) 100%)"
              : "transparent",
            display: "flex",
          }}
        />

        {/* Halo brand */}
        <div
          style={{
            position: "absolute",
            top: -200,
            right: -200,
            width: 600,
            height: 600,
            borderRadius: 600,
            background: "radial-gradient(circle, rgba(99,102,241,0.45) 0%, transparent 70%)",
            display: "flex",
          }}
        />

        {/* Contenu */}
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            width: "100%",
            height: "100%",
            padding: 80,
          }}
        >
          {/* Header : badge jeu */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: "rgba(99,102,241,0.25)",
              border: "2px solid rgba(165,180,252,0.6)",
              color: "#e0e7ff",
              padding: "10px 24px",
              borderRadius: 999,
              fontSize: 28,
              fontWeight: 700,
              alignSelf: "flex-start",
            }}
          >
            <span style={{ fontSize: 36 }}>{gameEmoji}</span>
            {gameLabel}
          </div>

          {/* Nom du preset */}
          <div
            style={{
              display: "flex",
              fontSize: 92,
              fontWeight: 900,
              lineHeight: 1.05,
              marginTop: 40,
              letterSpacing: -2,
              textShadow: preset.cover_url ? "0 2px 12px rgba(0,0,0,0.4)" : "none",
            }}
          >
            {preset.name.length > 60 ? preset.name.slice(0, 57) + "…" : preset.name}
          </div>

          {/* Description tronquée si présente */}
          {preset.description && (
            <div
              style={{
                display: "flex",
                fontSize: 32,
                lineHeight: 1.3,
                marginTop: 24,
                color: "#e2e8f0",
                maxWidth: 980,
                fontWeight: 400,
              }}
            >
              {preset.description.length > 140
                ? preset.description.slice(0, 137) + "…"
                : preset.description}
            </div>
          )}

          {/* Footer : auteur + brand */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: "auto",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 24, color: "#cbd5e1", fontWeight: 400 }}>
                Créé par
              </span>
              <span style={{ fontSize: 38, fontWeight: 700 }}>
                {author ? `@${author}` : "un créateur"}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                fontSize: 38,
                fontWeight: 900,
                color: "white",
              }}
            >
              <span style={{ fontSize: 44 }}>🎮</span>
              GameTrend
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts,
      headers: {
        "Cache-Control":
          "public, immutable, no-transform, s-maxage=86400, stale-while-revalidate=604800",
      },
    },
  );
}
