"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Notification } from "@/types/social";

export function useNotifications(userId: string | null) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  // Client stable — évite de recréer un client (et ses channels) à chaque render
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  // Ref pour éviter les stale closures dans le callback Realtime
  const fetchRef = useRef<() => Promise<void>>(async () => {});

  const fetchNotifications = useCallback(async () => {
    if (!userId) { setLoading(false); return; }

    const { data: notifs } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);

    if (!notifs) { setLoading(false); return; }

    const fromIds = [...new Set(notifs.map((n) => n.from_user_id))];
    const { data: profiles } = fromIds.length
      ? await supabase.from("profiles").select("id, username, avatar_url").in("id", fromIds)
      : { data: [] };

    const { data: friendships } = await supabase
      .from("friendships")
      .select("id, requester_id")
      .in("requester_id", fromIds.length ? fromIds : ["00000000-0000-0000-0000-000000000000"])
      .eq("addressee_id", userId)
      .eq("status", "pending");

    const enriched: Notification[] = notifs.map((n) => ({
      ...n,
      from_profile: profiles?.find((p) => p.id === n.from_user_id) ?? undefined,
      friendship_id: friendships?.find((f) => f.requester_id === n.from_user_id)?.id,
    }));

    setNotifications(enriched);
    setLoading(false);
  }, [userId]);

  // Garder la ref à jour
  useEffect(() => {
    fetchRef.current = fetchNotifications;
  }, [fetchNotifications]);

  // Fetch initial
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Realtime — canal dédié, séparé du fetch
  useEffect(() => {
    if (!userId) return;

    // Nom unique pour éviter la réutilisation d'un canal déjà subscribed
    const channelName = `notifications:${userId}:${Date.now()}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => fetchRef.current()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  // userId seul en dépendance — le fetchRef gère la fraîcheur de la callback
  }, [userId]);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  async function markAllRead() {
    if (!userId || unreadCount === 0) return;
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null);
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() }))
    );
  }

  async function markRead(id: string) {
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
    );
  }

  /** Supprime définitivement une notification (côté UI + Supabase) */
  async function deleteNotification(id: string) {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    await supabase.from("notifications").delete().eq("id", id);
  }

  return { notifications, unreadCount, loading, markAllRead, markRead, deleteNotification, refresh: fetchNotifications };
}
