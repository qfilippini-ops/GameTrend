"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Notification } from "@/types/social";

// ────────────────────────────────────────────────────────────────
// État partagé module-level
// ────────────────────────────────────────────────────────────────
// Le hook peut être utilisé plusieurs fois sur la même page (BottomNav,
// NotificationBell, FriendsPage). Pour éviter de multiplier les canaux
// Realtime (et déclencher l'erreur "cannot add postgres_changes callbacks
// after subscribe()"), on partage UN canal et UNE liste de subscribers.
// ────────────────────────────────────────────────────────────────

let sharedChannel: RealtimeChannel | null = null;
let sharedUserId: string | null = null;
const refreshSubscribers = new Set<() => void>();

function ensureChannel(userId: string) {
  // Même utilisateur que le canal courant → rien à faire
  if (sharedChannel && sharedUserId === userId) return;

  const supabase = createClient();

  // Changement d'utilisateur → on ferme l'ancien
  if (sharedChannel) {
    supabase.removeChannel(sharedChannel);
    sharedChannel = null;
  }

  sharedUserId = userId;
  sharedChannel = supabase
    .channel(`notifications:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      () => {
        // Notifie tous les hooks abonnés
        refreshSubscribers.forEach((cb) => {
          try {
            cb();
          } catch {
            /* ignore */
          }
        });
      }
    )
    .subscribe();
}

// ────────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────────
export function useNotifications(userId: string | null) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchNotifications = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const { data: notifs } = await supabase
      .from("notifications")
      .select("id, user_id, type, from_user_id, read_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);

    if (!notifs) {
      setLoading(false);
      return;
    }

    const fromIds = [...new Set(notifs.map((n) => n.from_user_id))];
    const { data: profiles } = fromIds.length
      ? await supabase
          .from("profiles")
          .select("id, username, avatar_url")
          .in("id", fromIds)
      : { data: [] };

    const { data: friendships } = await supabase
      .from("friendships")
      .select("id, requester_id")
      .in(
        "requester_id",
        fromIds.length ? fromIds : ["00000000-0000-0000-0000-000000000000"]
      )
      .eq("addressee_id", userId)
      .eq("status", "pending");

    const enriched: Notification[] = notifs.map((n) => ({
      ...n,
      from_profile: profiles?.find((p) => p.id === n.from_user_id) ?? undefined,
      friendship_id: friendships?.find((f) => f.requester_id === n.from_user_id)?.id,
    }));

    setNotifications(enriched);
    setLoading(false);
  }, [userId, supabase]);

  // Setup : 1 canal partagé + abonnement aux refresh
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    ensureChannel(userId);
    refreshSubscribers.add(fetchNotifications);
    fetchNotifications();
    return () => {
      refreshSubscribers.delete(fetchNotifications);
      // On ne removeChannel pas ici : d'autres consumers peuvent en dépendre.
      // Le canal est nettoyé uniquement quand on change d'utilisateur.
    };
  }, [userId, fetchNotifications]);

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

  return {
    notifications,
    unreadCount,
    loading,
    markAllRead,
    markRead,
    deleteNotification,
    refresh: fetchNotifications,
  };
}
