"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import Avatar from "@/components/ui/Avatar";
import FollowButton from "@/components/social/FollowButton";

interface FollowListProps {
  userId: string;
  mode: "followers" | "following";
}

interface UserRow {
  id: string;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
}

export default function FollowList({ userId, mode }: FollowListProps) {
  const t = useTranslations("friends");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const supabase = createClient();

      // mode = "followers"  → on cherche les follows où following_id = userId, on récupère le follower
      // mode = "following"  → on cherche les follows où follower_id  = userId, on récupère le following
      const filterCol = mode === "followers" ? "following_id" : "follower_id";
      const targetCol = mode === "followers" ? "follower_id"  : "following_id";

      const { data: rows } = await supabase
        .from("follows")
        .select(targetCol)
        .eq(filterCol, userId);

      const ids = (rows ?? []).map((r) => (r as Record<string, string>)[targetCol]).filter(Boolean);

      if (ids.length === 0) { setUsers([]); setLoading(false); return; }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, bio")
        .in("id", ids);

      setUsers((profiles as UserRow[]) ?? []);
      setLoading(false);
    }
    load();
  }, [userId, mode]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-3xl animate-pulse">👥</div>
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 px-5 text-center">
        <div className="text-5xl opacity-40">{mode === "followers" ? "👥" : "🔭"}</div>
        <p className="text-surface-400 text-sm">
          {mode === "followers" ? t("noFollowers") : t("noFollowing")}
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 space-y-2 max-w-lg mx-auto">
      {users.map((u, i) => (
        <motion.div
          key={u.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.03 }}
          className="flex items-center gap-3 p-3 rounded-2xl border border-surface-800/50 bg-surface-900/40"
        >
          <Link href={`/profile/${u.id}`} className="flex items-center gap-3 flex-1 min-w-0">
            <Avatar src={u.avatar_url} name={u.username} size="md" className="rounded-xl shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm truncate">{u.username ?? t("anonymousFull")}</p>
              {u.bio && <p className="text-surface-500 text-xs truncate">{u.bio}</p>}
            </div>
          </Link>
          <FollowButton targetUserId={u.id} compact />
        </motion.div>
      ))}
    </div>
  );
}
