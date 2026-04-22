import { ImageResponse } from "next/og";

/**
 * OG image par défaut. Servie quand aucune image spécifique n'est définie
 * (landing, pages statiques, fallback). Évite d'avoir à créer un PNG
 * manuellement et garantit qu'aucun lien partagé n'aura de preview vide.
 */

export const runtime = "nodejs";

const WIDTH = 1200;
const HEIGHT = 630;

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
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
            width: 700,
            height: 700,
            borderRadius: 700,
            background: "radial-gradient(circle, rgba(99,102,241,0.45) 0%, transparent 70%)",
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -200,
            left: -200,
            width: 700,
            height: 700,
            borderRadius: 700,
            background: "radial-gradient(circle, rgba(217,70,239,0.4) 0%, transparent 70%)",
            display: "flex",
          }}
        />

        {/* Brand */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            fontSize: 80,
            fontWeight: 900,
            letterSpacing: -3,
            zIndex: 1,
          }}
        >
          <span style={{ fontSize: 100 }}>🎮</span>
          GameTrend
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 40,
            lineHeight: 1.3,
            marginTop: 32,
            color: "#cbd5e1",
            maxWidth: 900,
            textAlign: "center",
            zIndex: 1,
          }}
        >
          Crée et partage tes jeux de soirée entre amis
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: {
        // Cache long : asset statique
        "Cache-Control": "public, immutable, no-transform, s-maxage=2592000, stale-while-revalidate=2592000",
      },
    }
  );
}
