import { ImageResponse } from "next/og";
import { createPublicClient } from "@/lib/supabase/server";

/**
 * OG image dynamique pour un preset.
 *
 * URL : /api/og/preset/<id> → image PNG 1200x630 personnalisée.
 * Utilisée par Open Graph + Twitter Card (cf. presets/[id]/page.tsx).
 *
 * Cache HTTP agressif (24h) car le contenu (nom + auteur + cover) bouge peu.
 * Si l'auteur change le nom du preset, il faudra attendre l'expiration ou
 * forcer un revalidate (acceptable pour un asset OG).
 *
 * Runtime nodejs (par défaut) car on utilise le client Supabase classique.
 * `edge` serait possible mais demande @supabase/supabase-js + un setup léger.
 */

export const runtime = "nodejs";

const WIDTH = 1200;
const HEIGHT = 630;

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
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
  const gameLabel = preset.game_type === "ghostword"
    ? "GhostWord"
    : preset.game_type === "dyp"
      ? "DYP"
      : preset.game_type;
  const gameEmoji = preset.game_type === "ghostword"
    ? "👻"
    : preset.game_type === "dyp"
      ? "⚡"
      : "🎮";

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
          padding: 80,
          position: "relative",
          fontFamily: "sans-serif",
        }}
      >
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

        {/* Header : badge jeu */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: "rgba(99,102,241,0.18)",
            border: "2px solid rgba(99,102,241,0.5)",
            color: "#a5b4fc",
            padding: "10px 24px",
            borderRadius: 999,
            fontSize: 28,
            fontWeight: 600,
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
            fontSize: 88,
            fontWeight: 900,
            lineHeight: 1.05,
            marginTop: 40,
            letterSpacing: -2,
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
              color: "#cbd5e1",
              maxWidth: 980,
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
            <span style={{ fontSize: 24, color: "#94a3b8" }}>par</span>
            <span style={{ fontSize: 36, fontWeight: 700 }}>
              {author ? `@${author}` : "un créateur"}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 36,
              fontWeight: 800,
              color: "white",
            }}
          >
            <span style={{ fontSize: 44 }}>🎮</span>
            GameTrend
          </div>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: {
        // Cache CDN 24h, stale-while-revalidate 7j (asset OG = stable)
        "Cache-Control": "public, immutable, no-transform, s-maxage=86400, stale-while-revalidate=604800",
      },
    }
  );
}
