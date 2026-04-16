"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export function useFavorites(presetId: string, userId?: string | null) {
  const [isFavorited, setIsFavorited] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) {
      setIsFavorited(false);
      return;
    }
    const supabase = createClient();
    supabase
      .from("preset_likes")
      .select("preset_id")
      .eq("preset_id", presetId)
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => setIsFavorited(!!data));
  }, [presetId, userId]);

  async function toggle() {
    if (!userId || loading) return;
    setLoading(true);
    const supabase = createClient();

    if (isFavorited) {
      await supabase
        .from("preset_likes")
        .delete()
        .eq("preset_id", presetId)
        .eq("user_id", userId);
      setIsFavorited(false);
    } else {
      await supabase
        .from("preset_likes")
        .insert({ preset_id: presetId, user_id: userId });
      setIsFavorited(true);
    }
    setLoading(false);
  }

  return { isFavorited, toggle, loading };
}
