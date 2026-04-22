"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import FollowButton from "@/components/social/FollowButton";
import FriendButton from "@/components/social/FriendButton";

interface Props {
  targetUserId: string;
}

/**
 * Bloc interactif du profil public :
 *   - Boutons Follow / Friend (auth-aware, ils savent gérer eux-mêmes l'état)
 *   - Compteur d'amis en commun (RPC Supabase, ne s'affiche que pour user loggé)
 *   - Redirection automatique vers `/profile` si c'est son propre profil
 *     (préserve le comportement de l'ancienne version client-only)
 *
 * Note : le compteur de followers du hero est rendu côté serveur. Si le
 * visiteur clique sur Follow, le compteur n'est PAS mis à jour optimistement
 * (acceptable, refresh le synchronise) — c'est le prix à payer pour avoir le
 * SSR du compteur, ce qui est un signal SEO important (UGC count).
 */
export default function ProfileSocialActions({ targetUserId }: Props) {
  const t = useTranslations("profile.public");
  const router = useRouter();
  const { user } = useAuth();
  const [mutualCount, setMutualCount] = useState<number | null>(null);

  const isOwnProfile = user && user.id === targetUserId;
  const isLoggedIn = user && !user.is_anonymous;

  useEffect(() => {
    if (isOwnProfile) {
      router.replace("/profile");
    }
  }, [isOwnProfile, router]);

  useEffect(() => {
    if (!isLoggedIn || isOwnProfile) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.rpc("get_mutual_friends_count", {
        target_id: targetUserId,
      });
      if (!cancelled) setMutualCount(data ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, isOwnProfile, targetUserId]);

  return (
    <>
      {mutualCount !== null && mutualCount > 0 && (
        <span className="text-surface-500 text-xs">
          · {t("mutualFriends", { n: mutualCount })}
        </span>
      )}

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <FollowButton targetUserId={targetUserId} />
        {isLoggedIn && <FriendButton targetUserId={targetUserId} />}
      </div>
    </>
  );
}
