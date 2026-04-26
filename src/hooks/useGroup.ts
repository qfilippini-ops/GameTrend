"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type {
  Group,
  GroupMember,
  GroupMessage,
  GroupInvitation,
} from "@/types/groups";

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
  const channelRef = useRef<RealtimeChannel | null>(null);
  const inviteChannelRef = useRef<RealtimeChannel | null>(null);

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
    setPendingInvites((invites as GroupInvitation[]) ?? []);

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

  // Charge initial + à chaque changement d'utilisateur
  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Realtime sur group_* (filtré par group_id) — on resouscrit quand le
  // groupId change. Les events triggerent un refetch (simple et robuste).
  useEffect(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    const groupId = group?.id;
    if (!groupId) return;

    const channel = supabase
      .channel(`group:${groupId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "group_messages",
          filter: `group_id=eq.${groupId}`,
        },
        () => {
          fetchAll();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "group_members",
          filter: `group_id=eq.${groupId}`,
        },
        () => {
          fetchAll();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "groups",
          filter: `id=eq.${groupId}`,
        },
        () => {
          fetchAll();
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [group?.id, supabase, fetchAll]);

  // Realtime sur les invitations REÇUES par le user courant
  useEffect(() => {
    if (inviteChannelRef.current) {
      supabase.removeChannel(inviteChannelRef.current);
      inviteChannelRef.current = null;
    }
    if (!myUserId) return;

    const channel = supabase
      .channel(`group_invites:${myUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "group_invitations",
          filter: `invitee_id=eq.${myUserId}`,
        },
        () => {
          fetchAll();
        }
      )
      .subscribe();
    inviteChannelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [myUserId, supabase, fetchAll]);

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
