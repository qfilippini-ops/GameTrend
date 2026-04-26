"use server";

// Server actions pour la section "Avenir" : votes sur des items futurs
// (jeux ou fonctionnalités) identifiés par un slug stable et géré côté
// front (registry statique). Voir schema_roadmap_v1.sql.

import { createClient } from "@/lib/supabase/server";

export interface ToggleRoadmapVoteResult {
  ok: boolean;
  slug?: string;
  voteCount?: number;
  voted?: boolean;
  error?: string;
}

export async function toggleRoadmapVote(
  slug: string
): Promise<ToggleRoadmapVoteResult> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || user.is_anonymous) {
      return { ok: false, error: "unauthenticated" };
    }

    const { data, error } = await supabase.rpc("toggle_roadmap_vote", {
      p_slug: slug,
    });
    if (error) {
      console.error("[toggleRoadmapVote]", error);
      return { ok: false, error: error.message };
    }
    const payload = (data ?? {}) as {
      slug?: string;
      vote_count?: number;
      voted?: boolean;
    };
    return {
      ok: true,
      slug: payload.slug,
      voteCount: payload.vote_count ?? 0,
      voted: payload.voted ?? false,
    };
  } catch (e) {
    console.error("[toggleRoadmapVote] exception", e);
    return { ok: false, error: String(e) };
  }
}
