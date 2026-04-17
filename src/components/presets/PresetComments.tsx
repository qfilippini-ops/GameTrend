"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import Avatar from "@/components/ui/Avatar";

const MAX_LENGTH = 300;

interface PresetCommentsProps {
  presetId: string;
}

interface CommentRow {
  id: string;
  preset_id: string;
  author_id: string;
  content: string;
  score: number;
  created_at: string;
  author?: {
    id: string;
    username: string | null;
    avatar_url: string | null;
  };
  myVote?: -1 | 0 | 1;
}

export default function PresetComments({ presetId }: PresetCommentsProps) {
  const router = useRouter();
  const { user } = useAuth();
  const isLoggedIn = user && !user.is_anonymous;

  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [posting, setPosting] = useState(false);
  const [sortBy, setSortBy] = useState<"top" | "recent">("top");

  async function load() {
    const supabase = createClient();

    const { data: cs } = await supabase
      .from("preset_comments")
      .select("id, preset_id, author_id, content, score, created_at")
      .eq("preset_id", presetId)
      .order(sortBy === "top" ? "score" : "created_at", { ascending: false })
      .limit(100);

    const rows = (cs as CommentRow[] | null) ?? [];

    if (rows.length === 0) {
      setComments([]);
      setLoading(false);
      return;
    }

    // Profils des auteurs
    const authorIds = Array.from(new Set(rows.map((r) => r.author_id)));
    const { data: authors } = await supabase
      .from("profiles")
      .select("id, username, avatar_url")
      .in("id", authorIds);

    const authorMap = new Map((authors ?? []).map((a) => [a.id, a]));

    // Mes votes (si connecté)
    let myVotes = new Map<string, -1 | 1>();
    if (isLoggedIn) {
      const { data: votes } = await supabase
        .from("comment_votes")
        .select("comment_id, vote")
        .in("comment_id", rows.map((r) => r.id))
        .eq("user_id", user!.id);
      myVotes = new Map((votes ?? []).map((v) => [v.comment_id as string, v.vote as -1 | 1]));
    }

    setComments(
      rows.map((r) => ({
        ...r,
        author: authorMap.get(r.author_id) ?? undefined,
        myVote: myVotes.get(r.id) ?? 0,
      }))
    );
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetId, sortBy, user]);

  async function handlePost() {
    const text = content.trim();
    if (!text || !isLoggedIn) return;

    setPosting(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("preset_comments")
      .insert({ preset_id: presetId, author_id: user!.id, content: text });

    setPosting(false);
    if (!error) {
      setContent("");
      load();
    }
  }

  async function handleVote(commentId: string, currentVote: -1 | 0 | 1, newVote: -1 | 1) {
    if (!isLoggedIn) {
      router.push(`/auth/login`);
      return;
    }

    const supabase = createClient();

    if (currentVote === newVote) {
      // Annuler le vote
      await supabase
        .from("comment_votes")
        .delete()
        .eq("comment_id", commentId)
        .eq("user_id", user!.id);
      // MAJ locale optimiste
      setComments((cs) => cs.map((c) =>
        c.id === commentId ? { ...c, myVote: 0, score: c.score - currentVote } : c
      ));
    } else if (currentVote === 0) {
      // Nouveau vote
      await supabase
        .from("comment_votes")
        .insert({ comment_id: commentId, user_id: user!.id, vote: newVote });
      setComments((cs) => cs.map((c) =>
        c.id === commentId ? { ...c, myVote: newVote, score: c.score + newVote } : c
      ));
    } else {
      // Changement (+1 → -1 ou inverse)
      await supabase
        .from("comment_votes")
        .update({ vote: newVote })
        .eq("comment_id", commentId)
        .eq("user_id", user!.id);
      setComments((cs) => cs.map((c) =>
        c.id === commentId ? { ...c, myVote: newVote, score: c.score + (newVote - currentVote) } : c
      ));
    }
  }

  async function handleDelete(commentId: string) {
    if (!confirm("Supprimer ce commentaire ?")) return;
    const supabase = createClient();
    await supabase.from("preset_comments").delete().eq("id", commentId);
    setComments((cs) => cs.filter((c) => c.id !== commentId));
  }

  return (
    <div className="space-y-3">
      {/* Header avec tri */}
      <div className="flex items-center justify-between">
        <p className="text-surface-300 font-display font-bold text-base">
          Commentaires <span className="text-surface-600 font-normal">({comments.length})</span>
        </p>
        <div className="flex bg-surface-900/60 rounded-full p-0.5 border border-surface-800/40 text-xs">
          <button
            onClick={() => setSortBy("top")}
            className={`px-3 py-1 rounded-full transition-all ${
              sortBy === "top" ? "bg-surface-700 text-white" : "text-surface-500 hover:text-surface-300"
            }`}
          >
            Top
          </button>
          <button
            onClick={() => setSortBy("recent")}
            className={`px-3 py-1 rounded-full transition-all ${
              sortBy === "recent" ? "bg-surface-700 text-white" : "text-surface-500 hover:text-surface-300"
            }`}
          >
            Récents
          </button>
        </div>
      </div>

      {/* Zone d'écriture */}
      {isLoggedIn ? (
        <div className="rounded-2xl border border-surface-800/50 bg-surface-900/40 p-3 space-y-2">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value.slice(0, MAX_LENGTH))}
            placeholder="Donne ton avis sur ce preset…"
            rows={2}
            className="w-full bg-transparent text-sm text-white placeholder-surface-600 resize-none outline-none"
          />
          <div className="flex items-center justify-between">
            <span className={`text-[11px] ${content.length > MAX_LENGTH - 30 ? "text-amber-500" : "text-surface-600"}`}>
              {content.length}/{MAX_LENGTH}
            </span>
            <button
              onClick={handlePost}
              disabled={!content.trim() || posting}
              className="px-4 py-1.5 rounded-full bg-brand-600 text-white text-xs font-semibold hover:bg-brand-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {posting ? "Envoi…" : "Publier"}
            </button>
          </div>
        </div>
      ) : (
        <Link
          href="/auth/login"
          className="block text-center py-3 rounded-2xl border border-dashed border-surface-700/50 text-surface-500 text-sm hover:border-surface-600/50 hover:text-surface-400 transition-colors"
        >
          Connecte-toi pour commenter
        </Link>
      )}

      {/* Liste des commentaires */}
      {loading ? (
        <div className="text-center text-surface-600 text-sm py-6">Chargement…</div>
      ) : comments.length === 0 ? (
        <div className="text-center text-surface-600 text-sm py-6">
          Aucun commentaire pour le moment. Sois le premier !
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {comments.map((c) => (
              <motion.div
                key={c.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex gap-2.5 p-3 rounded-2xl border border-surface-800/40 bg-surface-900/30"
              >
                {/* Votes verticaux */}
                <div className="flex flex-col items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => handleVote(c.id, c.myVote ?? 0, 1)}
                    className={`p-1 rounded transition-colors ${
                      c.myVote === 1 ? "text-brand-400" : "text-surface-600 hover:text-surface-400"
                    }`}
                    aria-label="Upvote"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 3l5 6H3l5-6z" />
                    </svg>
                  </button>
                  <span className={`text-xs font-bold ${
                    c.score > 0 ? "text-brand-400" : c.score < 0 ? "text-red-400" : "text-surface-500"
                  }`}>
                    {c.score}
                  </span>
                  <button
                    onClick={() => handleVote(c.id, c.myVote ?? 0, -1)}
                    className={`p-1 rounded transition-colors ${
                      c.myVote === -1 ? "text-red-400" : "text-surface-600 hover:text-surface-400"
                    }`}
                    aria-label="Downvote"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 13L3 7h10l-5 6z" />
                    </svg>
                  </button>
                </div>

                {/* Contenu */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Link href={`/profile/${c.author_id}`} className="flex items-center gap-1.5 group min-w-0">
                      <Avatar
                        src={c.author?.avatar_url ?? null}
                        name={c.author?.username ?? null}
                        size="xs"
                        className="rounded-full shrink-0"
                      />
                      <span className="text-xs font-semibold text-surface-300 group-hover:text-white truncate">
                        {c.author?.username ?? "Joueur"}
                      </span>
                    </Link>
                    <span className="text-surface-700 text-[10px]">·</span>
                    <span className="text-surface-600 text-[10px]">{relativeTime(c.created_at)}</span>
                    {user?.id === c.author_id && (
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="ml-auto text-surface-700 hover:text-red-400 text-xs"
                        aria-label="Supprimer"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-surface-200 leading-snug whitespace-pre-wrap break-words">
                    {c.content}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `il y a ${d}j`;
  return new Date(iso).toLocaleDateString("fr-FR");
}
