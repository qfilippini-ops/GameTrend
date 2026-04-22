import { ImageResponse } from "next/og";
import { createPublicClient } from "@/lib/supabase/server";

/**
 * OG image dynamique pour un profil créateur. Voir `og/preset/[id]/route.tsx`
 * pour les choix de runtime / cache.
 */

export const runtime = "nodejs";

const WIDTH = 1200;
const HEIGHT = 630;

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createPublicClient();

  const [{ data: profile }, { count: presetCount }] = await Promise.all([
    supabase
      .from("profiles")
      .select("username, bio, subscription_status")
      .eq("id", params.id)
      .maybeSingle(),
    supabase
      .from("presets")
      .select("id", { count: "exact", head: true })
      .eq("author_id", params.id)
      .eq("is_public", true)
      .is("archived_at", null),
  ]);

  if (!profile) {
    return new Response("Not found", { status: 404 });
  }

  const isPremium = ["trialing", "active", "lifetime"].includes(
    profile.subscription_status ?? ""
  );

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
            bottom: -200,
            left: -200,
            width: 600,
            height: 600,
            borderRadius: 600,
            background: "radial-gradient(circle, rgba(217,70,239,0.4) 0%, transparent 70%)",
            display: "flex",
          }}
        />

        {/* Badge créateur */}
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
            fontSize: 26,
            fontWeight: 600,
            alignSelf: "flex-start",
          }}
        >
          <span style={{ fontSize: 32 }}>👤</span>
          Créateur GameTrend
          {isPremium && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginLeft: 8,
                paddingLeft: 12,
                borderLeft: "2px solid rgba(99,102,241,0.4)",
                color: "#fcd34d",
                fontSize: 22,
              }}
            >
              ★ Premium
            </span>
          )}
        </div>

        {/* Username */}
        <div
          style={{
            display: "flex",
            fontSize: 96,
            fontWeight: 900,
            lineHeight: 1.05,
            marginTop: 36,
            letterSpacing: -2,
          }}
        >
          {profile.username ? `@${profile.username}` : "Anonyme"}
        </div>

        {/* Bio */}
        {profile.bio && (
          <div
            style={{
              display: "flex",
              fontSize: 32,
              lineHeight: 1.35,
              marginTop: 24,
              color: "#cbd5e1",
              maxWidth: 980,
            }}
          >
            {profile.bio.length > 160 ? profile.bio.slice(0, 157) + "…" : profile.bio}
          </div>
        )}

        {/* Footer : nb de presets + brand */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: "auto",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              fontSize: 36,
              fontWeight: 700,
            }}
          >
            <span style={{ fontSize: 44 }}>📦</span>
            {presetCount ?? 0} preset{(presetCount ?? 0) > 1 ? "s" : ""} publié{(presetCount ?? 0) > 1 ? "s" : ""}
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
        "Cache-Control": "public, immutable, no-transform, s-maxage=86400, stale-while-revalidate=604800",
      },
    }
  );
}
