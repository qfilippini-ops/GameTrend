"use client";

import { useState, useEffect } from "react";
import { usePathname } from "@/i18n/navigation";
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

      // Filet de sécurité : si la room n'existe plus (cron de cleanup,
      // suppression manuelle…) mais qu'un membership orphelin traîne,
      // on le supprime côté client pour ne pas afficher un badge fantôme.
      if (!room) {
        await supabase
          .from("room_players")
          .delete()
          .eq("user_id", user.id)
          .eq("room_id", membership.room_id);
      }

      if (!cancelled) {
        setActiveRoom((room as ActiveRoom | null) ?? null);
        setLoading(false);
      }
    }

    setLoading(true);
    check();

    return () => { cancelled = true; };
  }, [pathname]); // Re-vérifier à chaque navigation

  return { activeRoom, loading };
}
