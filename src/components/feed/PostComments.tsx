"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import Avatar from "@/components/ui/Avatar";
import { createClient } from "@/lib/supabase/client";
import {
  createPostComment,
  deletePostComment,
  togglePostCommentVote,
  type PostType,
} from "@/app/actions/posts";

// Section commentaires d'un post du feed.
// - Liste les commentaires (threading 1 niveau : root → reply, pas plus)
// - Permet de poster un commentaire racine et une réponse
// - Vote 👍/👎 sur chaque commentaire avec score net
// - Suppression de ses propres commentaires
//
// Structure de données : on charge tous les commentaires d'un coup via le
// RPC `get_post_comments` (les posts auront rarement > 200 commentaires
// dans cette app). Le client reconstruit l'arbre par parent_id.

interface RawComment {
  id: string;
  parent_id: string | null;
  body: string;
  score: number;
  created_at: string;
  author_id: string;
  author_username: string | null;
  author_avatar_url: string | null;
  author_subscription_status: string | null;
  user_vote: 1 | -1 | null;
}

interface PostCommentsProps {
  postType: PostType;
  postId: string;
  // Auteur courant (null = anonyme/déconnecté).
  currentUserId: string | null;
  // Auteur du post (pour highlight "auteur" sur ses commentaires).
  postAuthorId: string;
  // Callback appelé après chaque opération qui change le compteur global
  // (création / suppression). Permet au parent de mettre à jour le badge
  // "X commentaires" sans refetch complet.
  onCountChange?: (delta: number) => void;
}

export function PostComments({
  postType,
  postId,
  currentUserId,
  postAuthorId,
  onCountChange,
}: PostCommentsProps) {
  const t = useTranslations("feed.postComments");

  const [comments, setComments] = useState<RawComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rootDraft, setRootDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);

  // Charge tous les commentaires une fois.
  const fetchComments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: rpcErr } = await supabase.rpc("get_post_comments", {
        p_post_type: postType,
        p_post_id: postId,
      });
      if (rpcErr) throw rpcErr;
      setComments((data ?? []) as RawComment[]);
    } catch (e) {
      console.error("[PostComments] fetch", e);
      setError(t("errLoad"));
    } finally {
      setLoading(false);
    }
  }, [postType, postId, t]);

  useEffect(() => {
    void fetchComments();
  }, [fetchComments]);

  // ── Reconstruit l'arbre : roots + replies par root id ────────────────
  const { roots, repliesByRoot } = useMemo(() => {
    const rs: RawComment[] = [];
    const map = new Map<string, RawComment[]>();
    for (const c of comments) {
      if (c.parent_id == null) {
        rs.push(c);
      } else {
        const arr = map.get(c.parent_id) ?? [];
        arr.push(c);
        map.set(c.parent_id, arr);
      }
    }
    // Roots triés : score desc puis ancienneté asc (les meilleurs en haut)
    rs.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.created_at.localeCompare(b.created_at);
    });
    // Replies triées chronologiquement (asc), pour suivre la conversation.
    for (const [k, list] of map) {
      list.sort((a, b) => a.created_at.localeCompare(b.created_at));
      map.set(k, list);
    }
    return { roots: rs, repliesByRoot: map };
  }, [comments]);

  // ── Actions ───────────────────────────────────────────────────────────
  async function submitRoot() {
    const body = rootDraft.trim();
    if (!body) return;
    if (!currentUserId) return;
    setSubmitting(true);
    const res = await createPostComment(postType, postId, body, null);
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error ?? t("errSubmit"));
      return;
    }
    setRootDraft("");
    onCountChange?.(1);
    await fetchComments();
  }

  async function submitReply(parentId: string, draft: string) {
    const body = draft.trim();
    if (!body || !currentUserId) return;
    const res = await createPostComment(postType, postId, body, parentId);
    if (!res.ok) {
      setError(res.error ?? t("errSubmit"));
      return false;
    }
    onCountChange?.(1);
    await fetchComments();
    setReplyTo(null);
    return true;
  }

  async function removeComment(commentId: string) {
    const res = await deletePostComment(commentId);
    if (!res.ok) {
      setError(res.error ?? t("errDelete"));
      return;
    }
    // Compte aussi les replies qu'on perd par cascade.
    const target = comments.find((c) => c.id === commentId);
    let lost = 1;
    if (target?.parent_id == null) {
      lost += repliesByRoot.get(commentId)?.length ?? 0;
    }
    onCountChange?.(-lost);
    await fetchComments();
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* Composer principal (commentaire racine) */}
      {currentUserId ? (
        <div className="flex gap-2 items-start">
          <textarea
            value={rootDraft}
            onChange={(e) => setRootDraft(e.target.value)}
            placeholder={t("placeholder")}
            maxLength={1000}
            rows={2}
            className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-surface-900/60 border border-surface-700/60 text-surface-100 text-sm placeholder:text-surface-500 focus:outline-none focus:border-brand-500/60 resize-none"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void submitRoot();
            }}
            disabled={submitting || rootDraft.trim().length === 0}
            className="px-3 py-2 rounded-lg bg-brand-600 text-white text-xs font-bold hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {submitting ? "…" : t("send")}
          </button>
        </div>
      ) : (
        <p className="text-xs text-surface-500 italic px-1">{t("loginToComment")}</p>
      )}

      {error && (
        <p className="text-xs text-rose-400 px-1">{error}</p>
      )}

      {/* Liste */}
      {loading ? (
        <p className="text-xs text-surface-500 px-1">{t("loading")}</p>
      ) : roots.length === 0 ? (
        <p className="text-xs text-surface-500 italic px-1">{t("empty")}</p>
      ) : (
        <ul className="space-y-3">
          {roots.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              replies={repliesByRoot.get(c.id) ?? []}
              currentUserId={currentUserId}
              postAuthorId={postAuthorId}
              isReplying={replyTo === c.id}
              onReplyClick={() =>
                setReplyTo(replyTo === c.id ? null : c.id)
              }
              onReplySubmit={(draft) => submitReply(c.id, draft)}
              onDelete={removeComment}
              onVoteChange={(commentId, score, userVote) => {
                setComments((prev) =>
                  prev.map((x) =>
                    x.id === commentId
                      ? { ...x, score, user_vote: userVote }
                      : x
                  )
                );
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Sous-composant : commentaire (root ou reply) ─────────────────────────
interface CommentItemProps {
  comment: RawComment;
  replies: RawComment[]; // [] pour les replies (pas de niveau 2)
  currentUserId: string | null;
  postAuthorId: string;
  isReplying: boolean;
  onReplyClick: () => void;
  onReplySubmit: (draft: string) => Promise<boolean>;
  onDelete: (commentId: string) => void;
  onVoteChange: (
    commentId: string,
    score: number,
    userVote: 1 | -1 | null
  ) => void;
}

function CommentItem({
  comment,
  replies,
  currentUserId,
  postAuthorId,
  isReplying,
  onReplyClick,
  onReplySubmit,
  onDelete,
  onVoteChange,
}: CommentItemProps) {
  const t = useTranslations("feed.postComments");
  const [replyDraft, setReplyDraft] = useState("");
  const [, startTransition] = useTransition();
  const [pendingVote, setPendingVote] = useState(false);

  const isMine = currentUserId === comment.author_id;
  const isPostAuthor = postAuthorId === comment.author_id;
  const isReply = comment.parent_id != null;

  function vote(v: 1 | -1) {
    if (!currentUserId || pendingVote) return;
    const prev = { score: comment.score, userVote: comment.user_vote };
    let nextScore = comment.score;
    let nextUser: 1 | -1 | null;
    if (comment.user_vote === v) {
      nextScore -= v;
      nextUser = null;
    } else if (comment.user_vote == null) {
      nextScore += v;
      nextUser = v;
    } else {
      nextScore += v - comment.user_vote;
      nextUser = v;
    }
    onVoteChange(comment.id, nextScore, nextUser);

    setPendingVote(true);
    startTransition(async () => {
      const res = await togglePostCommentVote(comment.id, v);
      setPendingVote(false);
      if (!res.ok) {
        onVoteChange(comment.id, prev.score, prev.userVote);
        return;
      }
      onVoteChange(
        comment.id,
        res.score ?? nextScore,
        res.userVote ?? null
      );
    });
  }

  return (
    <li className={isReply ? "" : ""}>
      <div className="flex gap-2 items-start">
        <Link
          href={`/profile/${comment.author_id}`}
          className="shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <Avatar
            src={comment.author_avatar_url}
            name={comment.author_username}
            size={isReply ? "xs" : "sm"}
          />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="rounded-xl bg-surface-900/40 border border-surface-800/60 px-3 py-2">
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <Link
                href={`/profile/${comment.author_id}`}
                onClick={(e) => e.stopPropagation()}
                className="font-bold text-surface-100 text-xs hover:underline"
              >
                {comment.author_username ?? t("anonymous")}
              </Link>
              <div className="flex items-center gap-1.5 text-[10px] text-surface-500">
                {isPostAuthor && (
                  <span className="px-1.5 py-0.5 rounded-full bg-brand-600/20 border border-brand-500/40 text-brand-200 font-bold">
                    {t("authorBadge")}
                  </span>
                )}
                <RelativeTime iso={comment.created_at} />
              </div>
            </div>
            <p className="text-surface-200 text-sm whitespace-pre-line break-words mt-1">
              {comment.body}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 mt-1 px-1 text-[11px]">
            {/* Vote */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                vote(1);
              }}
              disabled={!currentUserId || pendingVote}
              aria-pressed={comment.user_vote === 1}
              className={`transition-colors ${
                comment.user_vote === 1
                  ? "text-emerald-300"
                  : "text-surface-500 hover:text-emerald-300"
              } disabled:opacity-50`}
            >
              👍
            </button>
            <span
              className={`font-mono font-bold tabular-nums ${
                comment.score > 0
                  ? "text-emerald-300"
                  : comment.score < 0
                    ? "text-rose-300"
                    : "text-surface-400"
              }`}
            >
              {comment.score}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                vote(-1);
              }}
              disabled={!currentUserId || pendingVote}
              aria-pressed={comment.user_vote === -1}
              className={`transition-colors ${
                comment.user_vote === -1
                  ? "text-rose-300"
                  : "text-surface-500 hover:text-rose-300"
              } disabled:opacity-50`}
            >
              👎
            </button>

            {/* Répondre (uniquement sur les roots, pas les replies) */}
            {!isReply && currentUserId && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onReplyClick();
                }}
                className="ml-2 text-surface-400 hover:text-brand-300 transition-colors font-bold"
              >
                {t("reply")}
              </button>
            )}

            {/* Supprimer */}
            {isMine && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(t("confirmDelete"))) onDelete(comment.id);
                }}
                className="ml-2 text-surface-400 hover:text-rose-300 transition-colors"
              >
                {t("delete")}
              </button>
            )}
          </div>

          {/* Composer reply */}
          <AnimatePresence initial={false}>
            {isReplying && currentUserId && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden mt-2"
              >
                <div className="flex gap-2 items-start">
                  <textarea
                    value={replyDraft}
                    onChange={(e) => setReplyDraft(e.target.value)}
                    placeholder={t("replyPlaceholder")}
                    rows={2}
                    maxLength={1000}
                    className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-surface-900/60 border border-surface-700/60 text-surface-100 text-xs placeholder:text-surface-500 focus:outline-none focus:border-brand-500/60 resize-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const ok = await onReplySubmit(replyDraft);
                      if (ok) setReplyDraft("");
                    }}
                    disabled={replyDraft.trim().length === 0}
                    className="px-2.5 py-1.5 rounded-lg bg-brand-600 text-white text-[11px] font-bold hover:bg-brand-500 disabled:opacity-50 transition-colors shrink-0"
                  >
                    {t("send")}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Replies */}
          {replies.length > 0 && (
            <ul className="mt-2 space-y-2 pl-3 border-l border-surface-800/60">
              {replies.map((r) => (
                <CommentItem
                  key={r.id}
                  comment={r}
                  replies={[]} /* pas de niveau 2 */
                  currentUserId={currentUserId}
                  postAuthorId={postAuthorId}
                  isReplying={false}
                  onReplyClick={() => {
                    /* pas de reply on reply */
                  }}
                  onReplySubmit={async () => false}
                  onDelete={onDelete}
                  onVoteChange={onVoteChange}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}

// Petit composant temps relatif léger (FR/EN). Pour rester simple on
// affiche en chiffres bruts (pas de plug `time` namespace existant ici car
// déjà beaucoup de paramètres).
function RelativeTime({ iso }: { iso: string }) {
  const t = useTranslations("feed.postComments.time");
  const date = new Date(iso);
  const diff = Math.max(0, Date.now() - date.getTime());
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  let label = "";
  if (sec < 60) label = t("now");
  else if (min < 60) label = t("minAgo", { n: min });
  else if (hr < 24) label = t("hAgo", { n: hr });
  else if (day < 30) label = t("dAgo", { n: day });
  else label = date.toLocaleDateString();
  return <span>{label}</span>;
}
