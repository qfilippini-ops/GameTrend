"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export interface ActiveRoom {
  id: string;
  phase: string;
  game_type: string;
}

/**
 * Vérifie si l'utilisateur courant est dans une room active.
 * Se rafraîchit à chaque changement de page (pathname).
 */
export function useActiveRoom() {
  const pathname = usePathname();
  const [activeRoom, setActiveRoom] = useState<ActiveRoom | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!cancelled) { setActiveRoom(null); setLoading(false); } return; }

      const { data: membership } = await supabase
        .from("room_players")
        .select("room_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (!membership?.room_id) {
        if (!cancelled) { setActiveRoom(null); setLoading(false); }
        return;
      }

      const { data: room } = await supabase
        .from("game_rooms")
        .select("id, phase, game_type")
        .eq("id", membership.room_id)
        .maybeSingle();

      if (!cancelled) {
        setActiveRoom(room as ActiveRoom | null);
        setLoading(false);
      }
    }

    setLoading(true);
    check();

    return () => { cancelled = true; };
  }, [pathname]); // Re-vérifier à chaque navigation

  return { activeRoom, loading };
}
