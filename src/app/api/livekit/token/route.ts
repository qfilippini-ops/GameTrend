import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createGroupVoiceToken,
  isLiveKitConfigured,
} from "@/lib/livekit/server";
import { logLiveKitTokenMint } from "@/lib/admin/usage-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/livekit/token
 * Body : { groupId: string }
 *
 * Vérifie que l'appelant est bien membre du groupe (group_members) puis
 * délivre un AccessToken LiveKit signé permettant de rejoindre le room
 * `group:${groupId}`.
 *
 * Le micro n'est pas allumé par défaut côté serveur : c'est le client qui
 * appelle `setMicrophoneEnabled(false)` à la connexion (cf. useGroupVoice).
 */
export async function POST(req: Request) {
  if (!isLiveKitConfigured()) {
    return NextResponse.json(
      { error: "livekit_not_configured" },
      { status: 503 }
    );
  }

  let body: { groupId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const groupId = body.groupId?.trim();
  if (!groupId) {
    return NextResponse.json({ error: "missing_group_id" }, { status: 400 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  type MembershipRow = { is_host: boolean };
  const { data: membership } = await supabase
    .from("group_members")
    .select("is_host")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle<MembershipRow>();

  if (!membership) {
    return NextResponse.json({ error: "not_a_member" }, { status: 403 });
  }

  type ProfileRow = { username: string | null; avatar_url: string | null };
  const { data: profile } = await supabase
    .from("profiles")
    .select("username, avatar_url")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  const username = profile?.username ?? "Player";
  const avatarUrl = profile?.avatar_url ?? null;

  try {
    const token = await createGroupVoiceToken({
      userId: user.id,
      username,
      avatarUrl,
      groupId,
      isHost: membership.is_host,
    });

    logLiveKitTokenMint({
      userId: user.id,
      groupId,
      isHost: membership.is_host,
    });

    return NextResponse.json({
      token,
      url: process.env.LIVEKIT_URL,
      identity: user.id,
    });
  } catch (err) {
    console.error("[livekit/token] failed to mint token", err);
    return NextResponse.json({ error: "token_failed" }, { status: 500 });
  }
}
