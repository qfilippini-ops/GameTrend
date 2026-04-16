"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Met à jour profiles.last_seen_at toutes les 60s pour un utilisateur connecté
 * (non-anonyme). Utilisé pour le statut "En ligne" dans la liste d'amis.
 */
export default function Heartbeat() {
  useEffect(() => {
    const supabase = createClient();

    async function beat() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || user.is_anonymous) return;
      await supabase
        .from("profiles")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", user.id);
    }

    beat();
    const interval = setInterval(beat, 60_000);
    return () => clearInterval(interval);
  }, []);

  return null;
}
