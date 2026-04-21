"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { track } from "@/lib/analytics/posthog";

/**
 * Composant invisible monté sur la page detail d'un preset.
 * Trigger un `track_preset_event('view')` une fois par mount + un capture
 * PostHog parallèle. Les anti-spam (1 view/h/preset/viewer) sont gérés
 * côté SQL.
 */
export default function PresetViewTracker({ presetId }: { presetId: string }) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    const supabase = createClient();
    (async () => {
      try {
        await supabase.rpc("track_preset_event", {
          p_preset_id: presetId,
          p_event: "view",
          p_country: null,
        });
      } catch {
        /* fail silently : analytics ne doit jamais bloquer la lecture du preset */
      }
    })();

    track("feature_used_premium", { feature: "view_preset", preset_id: presetId });
  }, [presetId]);

  return null;
}
