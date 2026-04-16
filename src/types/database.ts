export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          username: string | null;
          avatar_url: string | null;
          bio: string | null;
          stats: Json;
        };
        Insert: {
          id: string;
          created_at?: string;
          updated_at?: string;
          username?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          stats?: Json;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          username?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          stats?: Json;
        };
      };
      presets: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          author_id: string;
          name: string;
          description: string | null;
          game_type: string;
          is_public: boolean;
          play_count: number;
          like_count: number;
          config: Json;
          cover_url: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          author_id: string;
          name: string;
          description?: string | null;
          game_type: string;
          is_public?: boolean;
          play_count?: number;
          like_count?: number;
          config: Json;
          cover_url?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          author_id?: string;
          name?: string;
          description?: string | null;
          game_type?: string;
          is_public?: boolean;
          play_count?: number;
          like_count?: number;
          config?: Json;
          cover_url?: string | null;
        };
      };
      preset_likes: {
        Row: { preset_id: string; user_id: string; created_at: string };
        Insert: { preset_id: string; user_id: string; created_at?: string };
        Update: { preset_id?: string; user_id?: string; created_at?: string };
      };
      dyp_results: {
        Row: {
          id: string;
          created_at: string;
          preset_id: string;
          bracket_size: number;
          rankings: Json;
          player_id: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          preset_id: string;
          bracket_size: number;
          rankings: Json;
          player_id?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          preset_id?: string;
          bracket_size?: number;
          rankings?: Json;
          player_id?: string | null;
        };
      };
      game_rooms: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          host_id: string;
          game_type: string;
          phase: string;
          config: Json;
          current_round: number;
          current_turn: number;
          discussion_turns_per_round: number;
          speaker_duration_seconds: number;
          current_speaker_index: number;
          vote_round: number;
          tie_count: number;
          winner: string | null;
          expires_at: string;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          host_id: string;
          game_type: string;
          phase?: string;
          config?: Json;
          current_round?: number;
          current_turn?: number;
          discussion_turns_per_round?: number;
          speaker_duration_seconds?: number;
          current_speaker_index?: number;
          vote_round?: number;
          tie_count?: number;
          winner?: string | null;
          expires_at?: string;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          host_id?: string;
          game_type?: string;
          phase?: string;
          config?: Json;
          current_round?: number;
          current_turn?: number;
          discussion_turns_per_round?: number;
          speaker_duration_seconds?: number;
          current_speaker_index?: number;
          vote_round?: number;
          tie_count?: number;
          winner?: string | null;
          expires_at?: string;
        };
      };
      room_players: {
        Row: {
          id: string;
          created_at: string;
          room_id: string;
          user_id: string | null;
          display_name: string;
          is_host: boolean;
          is_ready: boolean;
          is_eliminated: boolean;
          role: string | null;
          word: string | null;
          word_image_url: string | null;
          vote_target: string | null;
          avatar_url: string | null;
          presence_status: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          room_id: string;
          user_id?: string | null;
          display_name: string;
          is_host?: boolean;
          is_ready?: boolean;
          is_eliminated?: boolean;
          role?: string | null;
          word?: string | null;
          word_image_url?: string | null;
          vote_target?: string | null;
          avatar_url?: string | null;
          presence_status?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          room_id?: string;
          user_id?: string | null;
          display_name?: string;
          is_host?: boolean;
          is_ready?: boolean;
          is_eliminated?: boolean;
          role?: string | null;
          word?: string | null;
          word_image_url?: string | null;
          vote_target?: string | null;
          avatar_url?: string | null;
          presence_status?: string | null;
        };
      };
      room_messages: {
        Row: {
          id: string;
          created_at: string;
          room_id: string;
          sender_name: string;
          content: string;
          round: number;
          turn: number;
        };
        Insert: {
          id?: string;
          created_at?: string;
          room_id: string;
          sender_name: string;
          content: string;
          round?: number;
          turn?: number;
        };
        Update: {
          id?: string;
          created_at?: string;
          room_id?: string;
          sender_name?: string;
          content?: string;
          round?: number;
          turn?: number;
        };
      };
      friendships: {
        Row: {
          id: string;
          created_at: string;
          requester_id: string;
          addressee_id: string;
          status: string;
        };
        Insert: {
          id?: string;
          created_at?: string;
          requester_id: string;
          addressee_id: string;
          status?: string;
        };
        Update: {
          id?: string;
          created_at?: string;
          requester_id?: string;
          addressee_id?: string;
          status?: string;
        };
      };
      notifications: {
        Row: {
          id: string;
          created_at: string;
          user_id: string;
          type: string;
          payload: Json;
          read: boolean;
        };
        Insert: {
          id?: string;
          created_at?: string;
          user_id: string;
          type: string;
          payload?: Json;
          read?: boolean;
        };
        Update: {
          id?: string;
          created_at?: string;
          user_id?: string;
          type?: string;
          payload?: Json;
          read?: boolean;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    // Tables non listées explicitement sont acceptées sans erreur
    // (évite les `never` sur des tables ajoutées après génération des types)
    Functions: {
      increment_play_count: {
        Args: { preset_id: string };
        Returns: void;
      };
      increment_preset_play_count: {
        Args: { p_preset_id: string };
        Returns: void;
      };
      quit_room_fn: {
        Args: { p_room_id: string; p_user_id: string };
        Returns: void;
      };
      respond_to_friend_request: {
        Args: { p_friendship_id: string; p_status: string };
        Returns: void;
      };
      get_friend_activities: {
        Args: { p_user_id: string };
        Returns: Json;
      };
      search_players: {
        Args: { query: string };
        Returns: Array<{ id: string; username: string; avatar_url: string | null }>;
      };
      send_friend_request: {
        Args: { p_addressee_id: string };
        Returns: void;
      };
      // Signature index : toute RPC non listée ci-dessus est acceptée sans erreur
      [key: string]: {
        Args: Record<string, unknown>;
        Returns: unknown;
      };
    };
    Enums: {
      [_ in never]: never;
    };
  };
}

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Preset = Database["public"]["Tables"]["presets"]["Row"];
export type PresetLike = Database["public"]["Tables"]["preset_likes"]["Row"];
export type GameRoom = Database["public"]["Tables"]["game_rooms"]["Row"];
export type RoomPlayer = Database["public"]["Tables"]["room_players"]["Row"];
export type RoomMessage = Database["public"]["Tables"]["room_messages"]["Row"];
export type Friendship = Database["public"]["Tables"]["friendships"]["Row"];
export type Notification = Database["public"]["Tables"]["notifications"]["Row"];
export type DypResult = Database["public"]["Tables"]["dyp_results"]["Row"];
