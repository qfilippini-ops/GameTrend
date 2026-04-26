// Types partagés côté client pour les groupes (chat realtime + invitations).

export interface Group {
  id: string;
  host_id: string;
  max_members: number;
  last_activity_at: string;
  created_at: string;
}

export interface GroupMember {
  group_id: string;
  user_id: string;
  is_host: boolean;
  joined_at: string;
  last_seen_at: string;
  // Joints éventuels (pour l'affichage)
  username?: string | null;
  avatar_url?: string | null;
  subscription_status?: string | null;
}

export type GroupMessageType = "text" | "system" | "lobby_share";

export interface GroupMessageBase {
  id: string;
  group_id: string;
  user_id: string | null;
  type: GroupMessageType;
  content: string;
  created_at: string;
}

export interface GroupTextMessage extends GroupMessageBase {
  type: "text";
  payload: Record<string, never>;
}

export interface GroupSystemMessage extends GroupMessageBase {
  type: "system";
  payload: {
    user_id?: string;
    username?: string;
  };
}

export interface GroupLobbyShareMessage extends GroupMessageBase {
  type: "lobby_share";
  payload: {
    code: string;
    game_type: string;
    is_private: boolean;
    host_id: string;
    host_name: string;
  };
}

export type GroupMessage =
  | GroupTextMessage
  | GroupSystemMessage
  | GroupLobbyShareMessage;

export interface GroupInvitation {
  id: string;
  group_id: string;
  inviter_id: string;
  invitee_id: string;
  created_at: string;
  expires_at: string;
  // Joints éventuels (pour l'affichage)
  inviter_username?: string | null;
  inviter_avatar?: string | null;
}
