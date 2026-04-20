"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface FollowButtonProps {
  targetUserId: string;
  /** Callback déclenché quand le statut change (utile pour mettre à jour le compteur parent) */
  onChange?: (isFollowing: boolean) => void;
  /** Variante compacte pour les listes */
  compact?: boolean;
}

export default function FollowButton({ targetUserId, onChange, compact = false }: FollowButtonProps) {
  const router = useRouter();
  const t = useTranslations("friends");
  const { user } = useAuth();
  const [isFollowing, setIsFollowing] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  const isLoggedIn = user && !user.is_anonymous;
  const isSelf = user?.id === targetUserId;

  useEffect(() => {
    if (!isLoggedIn || isSelf) { setIsFollowing(false); return; }
    const supabase = createClient();
    supabase
      .from("follows")
      .select("follower_id", { head: true, count: "exact" })
      .eq("follower_id", user!.id)
      .eq("following_id", targetUserId)
      .then(({ count }) => setIsFollowing((count ?? 0) > 0));
  }, [user, targetUserId, isLoggedIn, isSelf]);

  if (isSelf) return null;

  async function handleClick() {
    if (!isLoggedIn) {
      router.push(`/auth/login?redirect=/profile/${targetUserId}`);
      return;
    }
    if (isFollowing === null || loading) return;

    setLoading(true);
    const supabase = createClient();

    if (isFollowing) {
      await supabase
        .from("follows")
        .delete()
        .eq("follower_id", user!.id)
        .eq("following_id", targetUserId);
      setIsFollowing(false);
      onChange?.(false);
    } else {
      await supabase
        .from("follows")
        .insert({ follower_id: user!.id, following_id: targetUserId });
      setIsFollowing(true);
      onChange?.(true);
    }
    setLoading(false);
  }

  const label = isFollowing ? t("following") : t("follow");
  const icon  = isFollowing ? "✓" : "+";

  if (compact) {
    return (
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={handleClick}
        disabled={loading}
        className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all disabled:opacity-50 ${
          isFollowing
            ? "bg-surface-800 text-surface-300 border border-surface-700/50 hover:bg-red-950/40 hover:text-red-300 hover:border-red-700/30"
            : "bg-brand-600 text-white hover:bg-brand-500"
        }`}
      >
        {isFollowing ? t("following") : t("followCompact")}
      </motion.button>
    );
  }

  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={handleClick}
      disabled={loading}
      className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 ${
        isFollowing
          ? "bg-surface-800/80 text-white border border-surface-700/50 hover:bg-red-950/40 hover:border-red-700/40"
          : "bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-lg shadow-brand-500/20"
      }`}
    >
      <span className="mr-1.5">{icon}</span>
      {label}
    </motion.button>
  );
}
