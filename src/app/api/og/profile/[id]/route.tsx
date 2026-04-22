import { ImageResponse } from "next/og";
import { createPublicClient } from "@/lib/supabase/server";
import { loadInterFonts } from "@/app/api/og/_lib/fonts";

// OG image dynamique pour un profil créateur (1200x630).
//
// Layout :
//   - Si profile_banner_url existe → bannière en background avec overlay sombre.
//   - Avatar circulaire affiché à gauche du nom.
//   - Username, bio, badge premium, nb de presets, brand.
//
// Voir og/preset/[id]/route.tsx pour la stratégie générale (runtime, fonts, cache).

export const runtime = "nodejs";

const WIDTH = 1200;
const HEIGHT = 630;
const AVATAR_SIZE = 180;

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createPublicClient();

  const [{ data: profile }, { count: presetCount }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "username, bio, avatar_url, profile_banner_url, subscription_status",
      )
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
    profile.subscription_status ?? "",
  );

  const fonts = await loadInterFonts();

  const totalPresets = presetCount ?? 0;
  const presetSuffix = totalPresets > 1 ? "s" : "";
  const username = profile.username ? `@${profile.username}` : "Anonyme";

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
        {profile.profile_banner_url && (
          <img
            src={profile.profile_banner_url}
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

        {/* Overlay pour lisibilité du texte */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: profile.profile_banner_url
              ? "linear-gradient(135deg, rgba(12,17,69,0.78) 0%, rgba(26,10,46,0.82) 50%, rgba(59,0,64,0.88) 100%)"
              : "transparent",
            display: "flex",
          }}
        />

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
          {/* Badge créateur */}
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
              fontSize: 26,
              fontWeight: 700,
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
                  borderLeft: "2px solid rgba(165,180,252,0.4)",
                  color: "#fcd34d",
                  fontSize: 22,
                  fontWeight: 700,
                }}
              >
                ★ Premium
              </span>
            )}
          </div>

          {/* Avatar + Username sur la même ligne */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 32,
              marginTop: 36,
            }}
          >
            <div
              style={{
                width: AVATAR_SIZE,
                height: AVATAR_SIZE,
                borderRadius: AVATAR_SIZE,
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background:
                  "linear-gradient(135deg, #6366f1 0%, #d946ef 100%)",
                border: "4px solid rgba(255,255,255,0.18)",
                flexShrink: 0,
              }}
            >
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt=""
                  width={AVATAR_SIZE}
                  height={AVATAR_SIZE}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                <span style={{ fontSize: 96, fontWeight: 900 }}>
                  {(profile.username ?? "?").charAt(0).toUpperCase()}
                </span>
              )}
            </div>

            <div
              style={{
                display: "flex",
                fontSize: 88,
                fontWeight: 900,
                lineHeight: 1.0,
                letterSpacing: -2,
                textShadow: profile.profile_banner_url
                  ? "0 2px 12px rgba(0,0,0,0.4)"
                  : "none",
              }}
            >
              {username.length > 22 ? username.slice(0, 21) + "…" : username}
            </div>
          </div>

          {/* Bio */}
          {profile.bio && (
            <div
              style={{
                display: "flex",
                fontSize: 30,
                lineHeight: 1.35,
                marginTop: 28,
                color: "#e2e8f0",
                maxWidth: 980,
                fontWeight: 400,
              }}
            >
              {profile.bio.length > 160
                ? profile.bio.slice(0, 157) + "…"
                : profile.bio}
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
              {totalPresets} preset{presetSuffix} publié{presetSuffix}
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
