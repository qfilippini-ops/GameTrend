"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { togglePostReaction, type PostType } from "@/app/actions/posts";
import { vibrate } from "@/lib/utils";

// Boutons "👍 / 👎" façon Reddit avec compteurs distincts. Optimistic UI :
// le clic met à jour immédiatement l'état local, et seule une erreur revert.
//
// Props :
//   - postType, postId : identifient le post
//   - initialLikeCount / initialDislikeCount : compteurs initiaux
//   - initialUserReaction : état initial du user ('like' | 'dislike' | null)
//   - canReact : si false, on désactive le bouton (anonymes / banned)
//   - size : 'sm' | 'md'
//
// Le composant ne gère pas l'auth : si l'user clique sans être connecté on
// pourrait afficher une modal de login, mais c'est délégué au parent via
// le prop `onRequireAuth`.

interface PostReactionsProps {
  postType: PostType;
  postId: string;
  initialLikeCount: number;
  initialDislikeCount: number;
  initialUserReaction: "like" | "dislike" | null;
  canReact: boolean;
  size?: "sm" | "md";
  onRequireAuth?: () => void;
}

export function PostReactions({
  postType,
  postId,
  initialLikeCount,
  initialDislikeCount,
  initialUserReaction,
  canReact,
  size = "md",
  onRequireAuth,
}: PostReactionsProps) {
  const t = useTranslations("feed.postReactions");

  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [dislikeCount, setDislikeCount] = useState(initialDislikeCount);
  const [userReaction, setUserReaction] = useState<"like" | "dislike" | null>(
    initialUserReaction
  );
  const [pending, startTransition] = useTransition();

  function react(reaction: "like" | "dislike") {
    if (!canReact) {
      onRequireAuth?.();
      return;
    }
    if (pending) return;
    vibrate(10);

    // Snapshot pour rollback en cas d'erreur.
    const prev = { likeCount, dislikeCount, userReaction };

    // Optimistic : on simule la nouvelle logique localement.
    let nextLike = likeCount;
    let nextDislike = dislikeCount;
    let nextUser: "like" | "dislike" | null;
    if (userReaction === reaction) {
      nextUser = null;
      if (reaction === "like") nextLike--;
      else nextDislike--;
    } else if (userReaction === null) {
      nextUser = reaction;
      if (reaction === "like") nextLike++;
      else nextDislike++;
    } else {
      nextUser = reaction;
      if (reaction === "like") {
        nextLike++;
        nextDislike--;
      } else {
        nextLike--;
        nextDislike++;
      }
    }
    setLikeCount(Math.max(0, nextLike));
    setDislikeCount(Math.max(0, nextDislike));
    setUserReaction(nextUser);

    startTransition(async () => {
      const res = await togglePostReaction(postType, postId, reaction);
      if (!res.ok) {
        // Rollback
        setLikeCount(prev.likeCount);
        setDislikeCount(prev.dislikeCount);
        setUserReaction(prev.userReaction);
        return;
      }
      // Réconciliation avec la vérité serveur (les counts peuvent diverger
      // si d'autres users ont voté entre-temps).
      if (typeof res.likeCount === "number") setLikeCount(res.likeCount);
      if (typeof res.dislikeCount === "number") setDislikeCount(res.dislikeCount);
      setUserReaction(res.userReaction ?? null);
    });
  }

  const sizeClasses =
    size === "sm"
      ? "text-xs py-1 px-2 gap-1"
      : "text-sm py-1.5 px-3 gap-1.5";

  return (
    <div
      className="flex items-center gap-1"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          react("like");
        }}
        disabled={pending}
        aria-pressed={userReaction === "like"}
        aria-label={t("likeAria")}
        className={`flex items-center font-mono font-bold rounded-full transition-all border ${sizeClasses} ${
          userReaction === "like"
            ? "bg-emerald-600/30 border-emerald-500/60 text-emerald-200"
            : "bg-surface-900/40 border-surface-700/60 text-surface-300 hover:bg-surface-800/60 hover:border-emerald-500/40 hover:text-emerald-200"
        } ${pending ? "opacity-70" : ""}`}
      >
        <span aria-hidden>👍</span>
        <span>{likeCount}</span>
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          react("dislike");
        }}
        disabled={pending}
        aria-pressed={userReaction === "dislike"}
        aria-label={t("dislikeAria")}
        className={`flex items-center font-mono font-bold rounded-full transition-all border ${sizeClasses} ${
          userReaction === "dislike"
            ? "bg-rose-600/30 border-rose-500/60 text-rose-200"
            : "bg-surface-900/40 border-surface-700/60 text-surface-300 hover:bg-surface-800/60 hover:border-rose-500/40 hover:text-rose-200"
        } ${pending ? "opacity-70" : ""}`}
      >
        <span aria-hidden>👎</span>
        <span>{dislikeCount}</span>
      </button>
    </div>
  );
}
