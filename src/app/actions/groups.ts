"use server";

import { createClient } from "@/lib/supabase/server";

// ── Helpers ────────────────────────────────────────────────────────────────

function mapErrorMessage(raw: string): string {
  // Les RPCs lèvent des erreurs courtes type "already_in_group", "not_friend".
  // On les laisse passer telles quelles ; l'UI mappe vers les i18n.
  return raw || "unknown_error";
}

// ── Server actions ─────────────────────────────────────────────────────────

export async function createGroup(): Promise<{ groupId: string } | { error: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("create_group");
  if (error) return { error: mapErrorMessage(error.message) };
  return { groupId: data as string };
}

export async function inviteToGroup(
  targetUserId: string
): Promise<{ invitationId: string } | { error: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("invite_to_group", {
    p_target_id: targetUserId,
  });
  if (error) return { error: mapErrorMessage(error.message) };
  return { invitationId: data as string };
}

export async function acceptGroupInvite(
  invitationId: string
): Promise<{ groupId: string } | { error: string }> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("accept_group_invite", {
    p_invitation_id: invitationId,
  });
  if (error) return { error: mapErrorMessage(error.message) };
  return { groupId: data as string };
}

export async function declineGroupInvite(
  invitationId: string
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("decline_group_invite", {
    p_invitation_id: invitationId,
  });
  if (error) return { error: mapErrorMessage(error.message) };
  return {};
}

export async function leaveGroup(): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("leave_group");
  if (error) return { error: mapErrorMessage(error.message) };
  return {};
}

export async function kickGroupMember(
  targetUserId: string
): Promise<{ error?: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("kick_group_member", {
    p_target_id: targetUserId,
  });
  if (error) return { error: mapErrorMessage(error.message) };
  return {};
}

export async function sendGroupMessage(
  content: string
): Promise<{ messageId: string } | { error: string }> {
  const trimmed = (content || "").trim();
  if (!trimmed) return { error: "empty_message" };
  if (trimmed.length > 1000) return { error: "message_too_long" };

  const supabase = createClient();
  const { data, error } = await supabase.rpc("send_group_message", {
    p_content: trimmed,
  });
  if (error) return { error: mapErrorMessage(error.message) };
  return { messageId: data as string };
}

// Appelé en fire-and-forget après une création de room. No-op si l'user n'est
// pas dans un groupe ou pas l'hôte du salon.
export async function shareLobbyToGroup(roomId: string): Promise<void> {
  try {
    const supabase = createClient();
    await supabase.rpc("share_lobby_to_group", { p_room_id: roomId });
  } catch (e) {
    // Silencieux : c'est une best-effort.
    console.error("[shareLobbyToGroup]", e);
  }
}
