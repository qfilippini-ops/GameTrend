"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type {
  Group,
  GroupMember,
  GroupMessage,
  GroupInvitation,
} from "@/types/groups";

// ────────────────────────────────────────────────────────────────────────────
// Canaux Realtime partagés module-level
// ────────────────────────────────────────────────────────────────────────────
// `useGroup` est typiquement instancié dans Header (GroupPanel + FriendsPanel).
// Si chaque hook crée son propre channel avec le même name, Supabase Realtime
// râle ("cannot add postgres_changes callbacks after subscribe()"). On partage
// donc un seul couple de canaux par utilisateur courant et on broadcaste le
// refresh aux instances locales via un Set de subscribers.
// ────────────────────────────────────────────────────────────────────────────

let sharedGroupChannel: RealtimeChannel | null = null;
let sharedGroupChannelGroupId: string | null = null;

let sharedInviteChannel: RealtimeChannel | null = null;
let sharedInviteChannelUserId: string | null = null;

const refreshSubscribers = new Set<() => void>();

function broadcastRefresh() {
  refreshSubscribers.forEach((cb) => {
    try {
      cb();
    } catch {
      /* ignore */
    }
  });
}

function ensureGroupChannel(groupId: string | null) {
  const supabase = createClient();
  if (sharedGroupChannel && sharedGroupChannelGroupId === groupId) return;
  if (sharedGroupChannel) {
    supabase.removeChannel(sharedGroupChannel);
    sharedGroupChannel = null;
    sharedGroupChannelGroupId = null;
  }
  if (!groupId) return;

  sharedGroupChannelGroupId = groupId;
  sharedGroupChannel = supabase
    .channel(`group:${groupId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "group_messages",
        filter: `group_id=eq.${groupId}`,
      },
      broadcastRefresh
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "group_members",
        filter: `group_id=eq.${groupId}`,
      },
      broadcastRefresh
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "groups",
        filter: `id=eq.${groupId}`,
      },
      broadcastRefresh
    )
    .subscribe();
}

function ensureInviteChannel(userId: string | null) {
  const supabase = createClient();
  if (sharedInviteChannel && sharedInviteChannelUserId === userId) return;
  if (sharedInviteChannel) {
    supabase.removeChannel(sharedInviteChannel);
    sharedInviteChannel = null;
    sharedInviteChannelUserId = null;
  }
  if (!userId) return;

  sharedInviteChannelUserId = userId;
  sharedInviteChannel = supabase
    .channel(`group_invites:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "group_invitations",
        filter: `invitee_id=eq.${userId}`,
      },
      broadcastRefresh
    )
    .subscribe();
}

interface MemberProfile {
  id: string;
  username: string | null;
  avatar_url: string | null;
  subscription_status: string | null;
}

export interface UseGroupReturn {
  group: Group | null;
  members: GroupMember[];
  messages: GroupMessage[];
  /** Invitations RECUES par le user courant (pending) */
  pendingInvites: GroupInvitation[];
  loading: boolean;
  isHost: boolean;
  myUserId: string | null;
  capacity: number;
  isFull: boolean;
  refresh: () => Promise<void>;
}

/**
 * Hook singleton (un user = au plus 1 groupe).
 *
 * - Récupère l'état initial : group, membres (joins profiles), messages
 *   et invitations reçues en attente.
 * - Souscrit en realtime aux 3 tables (filtré par group_id) + aux invitations
 *   adressées au user courant.
 * - Fait un soft-refetch dès qu'une row change pour avoir les jointures profile.
 */
export function useGroup(): UseGroupReturn {
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [pendingInvites, setPendingInvites] = useState<GroupInvitation[]>([]);
  const [loading, setLoading] = useState(true);

  const myUserId = user?.id ?? null;

  const fetchAll = useCallback(async () => {
    if (!myUserId) {
      setGroup(null);
      setMembers([]);
      setMessages([]);
      setPendingInvites([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data: membership } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", myUserId)
      .maybeSingle();

    const groupId = membership?.group_id as string | undefined;

    // Invitations reçues (toujours pertinent même sans groupe actif)
    const { data: invites } = await supabase
      .from("group_invitations")
      .select("*")
      .eq("invitee_id", myUserId);
    const inviteRows = (invites as GroupInvitation[]) ?? [];
    if (inviteRows.length > 0) {
      const inviterIds = Array.from(
        new Set(inviteRows.map((i) => i.inviter_id))
      );
      const { data: inviterProfs } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .in("id", inviterIds);
      const inviterMap = new Map<
        string,
        { username: string | null; avatar_url: string | null }
      >();
      for (const p of (inviterProfs as
        | { id: string; username: string | null; avatar_url: string | null }[]
        | null) ?? []) {
        inviterMap.set(p.id, {
          username: p.username,
          avatar_url: p.avatar_url,
        });
      }
      setPendingInvites(
        inviteRows.map((inv) => ({
          ...inv,
          inviter_username: inviterMap.get(inv.inviter_id)?.username ?? null,
          inviter_avatar: inviterMap.get(inv.inviter_id)?.avatar_url ?? null,
        }))
      );
    } else {
      setPendingInvites([]);
    }

    if (!groupId) {
      setGroup(null);
      setMembers([]);
      setMessages([]);
      setLoading(false);
      return;
    }

    const [{ data: g }, { data: ms }, { data: msgs }] = await Promise.all([
      supabase.from("groups").select("*").eq("id", groupId).maybeSingle(),
      supabase
        .from("group_members")
        .select("*")
        .eq("group_id", groupId)
        .order("joined_at", { ascending: true }),
      supabase
        .from("group_messages")
        .select("*")
        .eq("group_id", groupId)
        .order("created_at", { ascending: true })
        .limit(200),
    ]);

    // Joins manuels sur profiles pour les avatars/usernames
    const memberRows = (ms as GroupMember[]) ?? [];
    const ids = memberRows.map((m) => m.user_id);
    let profilesMap = new Map<string, MemberProfile>();
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, subscription_status")
        .in("id", ids);
      for (const p of (profs as MemberProfile[]) ?? []) {
        profilesMap.set(p.id, p);
      }
    }
    const enrichedMembers = memberRows.map((m) => ({
      ...m,
      username: profilesMap.get(m.user_id)?.username ?? null,
      avatar_url: profilesMap.get(m.user_id)?.avatar_url ?? null,
      subscription_status:
        profilesMap.get(m.user_id)?.subscription_status ?? null,
    }));

    setGroup((g as Group | null) ?? null);
    setMembers(enrichedMembers);
    setMessages((msgs as GroupMessage[]) ?? []);
    setLoading(false);
  }, [myUserId, supabase]);

  // Setup : charge initial + abonnement au broadcaster partagé.
  useEffect(() => {
    refreshSubscribers.add(fetchAll);
    fetchAll();
    return () => {
      refreshSubscribers.delete(fetchAll);
    };
  }, [fetchAll]);

  // Met à jour les canaux partagés (group:* et group_invites:*) quand le
  // user ou le groupe courant changent. Plusieurs instances du hook
  // partagent ces canaux pour éviter le double-subscribe.
  useEffect(() => {
    ensureInviteChannel(myUserId);
  }, [myUserId]);

  useEffect(() => {
    ensureGroupChannel(group?.id ?? null);
  }, [group?.id]);

  const isHost = !!(group && myUserId && group.host_id === myUserId);
  const capacity = group?.max_members ?? 4;
  const isFull = members.length >= capacity;

  return {
    group,
    members,
    messages,
    pendingInvites,
    loading,
    isHost,
    myUserId,
    capacity,
    isFull,
    refresh: fetchAll,
  };
}
