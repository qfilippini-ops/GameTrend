export type RoomPhase = "lobby" | "reveal" | "discussion" | "vote" | "result";

export interface OnlineRoom {
  id: string;
  host_id: string;
  game_type: string;
  config: Record<string, unknown>;
  phase: RoomPhase;
  reveal_index: number;
  discussion_turn: number;
  discussion_turns_per_round: number;
  current_speaker_index: number;
  speaker_started_at: string | null;
  speaker_duration_seconds: number;
  vote_round: number;
  tie_count: number;
  winner: string | null;
  created_at: string;
  expires_at: string;
}

export interface RoomPlayer {
  room_id: string;
  user_id: string | null;
  display_name: string;
  is_host: boolean;
  is_eliminated: boolean;
  is_ready: boolean;
  join_order: number;
  joined_at: string;
}

export interface RoomMessage {
  id: string;
  room_id: string;
  player_name: string;
  message: string;
  discussion_turn: number;
  vote_round: number;
  created_at: string;
}

export interface RoomVote {
  room_id: string;
  voter_name: string;
  target_name: string;
  vote_round: number;
  created_at: string;
}

export interface ReplayVote {
  room_id: string;
  player_name: string;
  choice: "replay" | "lobby";
  created_at: string;
}
