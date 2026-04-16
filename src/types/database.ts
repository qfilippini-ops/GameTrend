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
        Row: {
          preset_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          preset_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          preset_id?: string;
          user_id?: string;
          created_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      increment_play_count: {
        Args: { preset_id: string };
        Returns: void;
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
