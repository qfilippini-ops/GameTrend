export type FriendshipStatus = "none" | "pending" | "accepted" | "blocked";

export interface FriendshipState {
  id?: string;
  status: FriendshipStatus;
  /** true = moi qui ai envoyé la demande */
  isRequester?: boolean;
}

export interface Notification {
  id: string;
  user_id: string;
  type: "friend_request" | "friend_accepted";
  from_user_id: string;
  read_at: string | null;
  created_at: string;
  /** Profil de l'expéditeur, jointuré côté client */
  from_profile?: {
    username: string | null;
    avatar_url: string | null;
  };
  /** ID de l'amitié associée (pour accept/decline inline) */
  friendship_id?: string;
}

export type ActivityStatus =
  | "offline"
  | "online"
  | "in_lobby"
  | "in_game";

export interface FriendActivity {
  user_id: string;
  username: string | null;
  avatar_url: string | null;
  last_seen_at: string | null;
  is_online: boolean;
  room_id: string | null;
  room_phase: string | null;
  game_type: string | null;
  friendship_id: string;
}

export function getActivityStatus(f: FriendActivity): ActivityStatus {
  if (f.room_phase === "lobby") return "in_lobby";
  if (f.room_phase === "reveal" || f.room_phase === "discussion" || f.room_phase === "vote")
    return "in_game";
  if (f.is_online) return "online";
  return "offline";
}

export const ACTIVITY_LABELS: Record<ActivityStatus, string> = {
  offline:  "Hors ligne",
  online:   "En ligne",
  in_lobby: "En lobby",
  in_game:  "En partie",
};

export const ACTIVITY_COLORS: Record<ActivityStatus, string> = {
  offline:  "bg-surface-600",
  online:   "bg-emerald-400",
  in_lobby: "bg-brand-400",
  in_game:  "bg-amber-400",
};
