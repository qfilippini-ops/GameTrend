"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Met à jour profiles.last_seen_at toutes les 3 minutes pour un utilisateur connecté
 * (non-anonyme). Utilisé pour le statut "En ligne" dans la liste d'amis.
 *
 * Le seuil "is_online" côté SQL est à 5 min : 2 min de tolérance après le dernier
 * beat évite un faux "offline" si l'onglet ne déclenche pas le timer pile à l'heure.
 * Économie : 3x moins d'écritures DB qu'avec un heartbeat 60s.
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
    const interval = setInterval(beat, 3 * 60_000);
    return () => clearInterval(interval);
  }, []);

  return null;
}
