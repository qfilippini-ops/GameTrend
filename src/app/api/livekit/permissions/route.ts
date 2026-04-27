import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  isLiveKitConfigured,
  setMemberPublishPermission,
} from "@/lib/livekit/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/livekit/permissions
 * Body : { groupId: string, targetUserId: string, canPublish: boolean }
 *
 * Soft mute / unmute par l'host : modifie côté serveur LiveKit la permission
 * `canPublish` du membre cible. Le serveur rejette tout track audio publié
 * tant que canPublish=false. Réversible.
 *
 * Auth : seul l'host courant du groupe peut appeler cette API.
 */
export async function POST(req: Request) {
  if (!isLiveKitConfigured()) {
    return NextResponse.json(
      { error: "livekit_not_configured" },
      { status: 503 }
    );
  }

  let body: {
    groupId?: string;
    targetUserId?: string;
    canPublish?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const groupId = body.groupId?.trim();
  const targetUserId = body.targetUserId?.trim();
  const canPublish = body.canPublish;
  if (!groupId || !targetUserId || typeof canPublish !== "boolean") {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // L'host du groupe = group_members.is_host=true. On vérifie en une requête.
  type MembershipRow = { is_host: boolean };
  const { data: membership } = await supabase
    .from("group_members")
    .select("is_host")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle<MembershipRow>();

  if (!membership || !membership.is_host) {
    return NextResponse.json({ error: "host_only" }, { status: 403 });
  }

  // On vérifie aussi que la cible est membre du groupe avant de toucher au
  // room LiveKit (évite de spammer l'API LiveKit avec des identités random).
  const { data: target } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (!target) {
    return NextResponse.json({ error: "target_not_member" }, { status: 404 });
  }

  if (targetUserId === user.id) {
    return NextResponse.json({ error: "cannot_mute_self" }, { status: 400 });
  }

  try {
    await setMemberPublishPermission(groupId, targetUserId, canPublish);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[livekit/permissions] failed", err);
    return NextResponse.json({ error: "permission_failed" }, { status: 500 });
  }
}
