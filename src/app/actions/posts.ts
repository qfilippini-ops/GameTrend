"use server";

// Server actions pour les interactions sociales sur les "posts" du feed
// (résultats de partie partagés). Toutes les actions s'appuient sur des RPC
// SQL définies dans schema_social_v3.sql, qui font les vérifications
// d'auth, d'ownership et la maintenance des compteurs/notifs.

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { COMMENT_MAX_LEN } from "@/lib/social/limits";

// Type des "posts" supportés. Désormais 'result' ET 'preset'.
// (Note : les presets ont aussi un système legacy de favoris via preset_likes
// — c'est INDÉPENDANT des réactions/commentaires "social v3" basés sur
// post_reactions / post_comments.)
export type PostType = "result" | "preset";

// ── Réactions ────────────────────────────────────────────────────────────

export interface TogglePostReactionResult {
  ok: boolean;
  likeCount?: number;
  dislikeCount?: number;
  userReaction?: "like" | "dislike" | null;
  error?: string;
}

export async function togglePostReaction(
  postType: PostType,
  postId: string,
  reaction: "like" | "dislike"
): Promise<TogglePostReactionResult> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || user.is_anonymous) {
      return { ok: false, error: "unauthenticated" };
    }

    const { data, error } = await supabase.rpc("toggle_post_reaction", {
      p_post_type: postType,
      p_post_id: postId,
      p_reaction: reaction,
    });
    if (error) {
      console.error("[togglePostReaction]", error);
      return { ok: false, error: error.message };
    }

    // RPC retourne un jsonb { like_count, dislike_count, user_reaction }.
    const payload = (data ?? {}) as {
      like_count?: number;
      dislike_count?: number;
      user_reaction?: "like" | "dislike" | null;
    };
    return {
      ok: true,
      likeCount: payload.like_count ?? 0,
      dislikeCount: payload.dislike_count ?? 0,
      userReaction: payload.user_reaction ?? null,
    };
  } catch (e) {
    console.error("[togglePostReaction] exception", e);
    return { ok: false, error: String(e) };
  }
}

// ── Commentaires ──────────────────────────────────────────────────────────

export interface CreatePostCommentResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export async function createPostComment(
  postType: PostType,
  postId: string,
  body: string,
  parentId?: string | null
): Promise<CreatePostCommentResult> {
  try {
    const trimmed = body.trim();
    if (trimmed.length === 0) return { ok: false, error: "empty_body" };
    if (trimmed.length > COMMENT_MAX_LEN) return { ok: false, error: "body_too_long" };

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || user.is_anonymous) {
      return { ok: false, error: "unauthenticated" };
    }

    const { data, error } = await supabase.rpc("create_post_comment", {
      p_post_type: postType,
      p_post_id: postId,
      p_body: trimmed,
      p_parent_id: parentId ?? null,
    });
    if (error) {
      console.error("[createPostComment]", error);
      return { ok: false, error: error.message };
    }
    const payload = (data ?? {}) as { id?: string };
    return { ok: true, id: payload.id };
  } catch (e) {
    console.error("[createPostComment] exception", e);
    return { ok: false, error: String(e) };
  }
}

// Suppression d'un de ses propres commentaires. Cascade vers post_comment_votes
// + recalcul du comment_count via trigger.
export async function deletePostComment(
  commentId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || user.is_anonymous) {
      return { ok: false, error: "unauthenticated" };
    }
    const { error } = await supabase
      .from("post_comments")
      .delete()
      .eq("id", commentId)
      .eq("author_id", user.id);
    if (error) {
      console.error("[deletePostComment]", error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    console.error("[deletePostComment] exception", e);
    return { ok: false, error: String(e) };
  }
}

// ── Votes commentaires ────────────────────────────────────────────────────

export interface ToggleCommentVoteResult {
  ok: boolean;
  score?: number;
  userVote?: 1 | -1 | null;
  error?: string;
}

export async function togglePostCommentVote(
  commentId: string,
  vote: 1 | -1
): Promise<ToggleCommentVoteResult> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || user.is_anonymous) {
      return { ok: false, error: "unauthenticated" };
    }
    const { data, error } = await supabase.rpc("toggle_post_comment_vote", {
      p_comment_id: commentId,
      p_vote: vote,
    });
    if (error) {
      console.error("[togglePostCommentVote]", error);
      return { ok: false, error: error.message };
    }
    const payload = (data ?? {}) as {
      score?: number;
      user_vote?: 1 | -1 | null;
    };
    return {
      ok: true,
      score: payload.score ?? 0,
      userVote: payload.user_vote ?? null,
    };
  } catch (e) {
    console.error("[togglePostCommentVote] exception", e);
    return { ok: false, error: String(e) };
  }
}

// ── Suppression de post ───────────────────────────────────────────────────

export async function deleteMyPost(
  postType: PostType,
  postId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || user.is_anonymous) {
      return { ok: false, error: "unauthenticated" };
    }
    const { error } = await supabase.rpc("delete_my_post", {
      p_post_type: postType,
      p_post_id: postId,
    });
    if (error) {
      console.error("[deleteMyPost]", error);
      return { ok: false, error: error.message };
    }
    // Invalider les pages qui pourraient afficher ce post (best-effort).
    revalidatePath("/[locale]/feed", "page");
    revalidatePath("/[locale]/profile/[id]", "page");
    return { ok: true };
  } catch (e) {
    console.error("[deleteMyPost] exception", e);
    return { ok: false, error: String(e) };
  }
}
