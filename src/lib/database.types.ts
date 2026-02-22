export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          actor_user_id: string
          changes: Json
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          request_id: string | null
          source: string | null
        }
        Insert: {
          action?: string
          actor_user_id: string
          changes: Json
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          request_id?: string | null
          source?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string
          changes?: Json
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          request_id?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      clubs: {
        Row: {
          city: string | null
          country: string | null
          created_at: string | null
          external_id: string | null
          id: string
          is_visible: boolean | null
          logo_url: string | null
          name: string
          primary_color: string | null
          region: string | null
          short_name: string | null
          slug: string | null
          union_id: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string | null
          external_id?: string | null
          id: string
          is_visible?: boolean | null
          logo_url?: string | null
          name: string
          primary_color?: string | null
          region?: string | null
          short_name?: string | null
          slug?: string | null
          union_id?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string | null
          external_id?: string | null
          id?: string
          is_visible?: boolean | null
          logo_url?: string | null
          name?: string
          primary_color?: string | null
          region?: string | null
          short_name?: string | null
          slug?: string | null
          union_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clubs_union_id_fkey"
            columns: ["union_id"]
            isOneToOne: false
            referencedRelation: "unions"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string | null
          entity_id: string
          entity_type: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      favorites_clubs: {
        Row: {
          club_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          club_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          club_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_clubs_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_clubs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites_tournaments: {
        Row: {
          created_at: string
          id: string
          tournament_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          tournament_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          tournament_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_tournaments_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_tournaments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          away_club_id: string | null
          created_at: string | null
          date_time: string
          home_club_id: string | null
          id: string
          live_enabled: boolean | null
          round_id: string | null
          score: Json | null
          status: string | null
          tournament_id: string | null
          updated_at: string | null
          venue: string | null
        }
        Insert: {
          away_club_id?: string | null
          created_at?: string | null
          date_time: string
          home_club_id?: string | null
          id?: string
          live_enabled?: boolean | null
          round_id?: string | null
          score?: Json | null
          status?: string | null
          tournament_id?: string | null
          updated_at?: string | null
          venue?: string | null
        }
        Update: {
          away_club_id?: string | null
          created_at?: string | null
          date_time?: string
          home_club_id?: string | null
          id?: string
          live_enabled?: boolean | null
          round_id?: string | null
          score?: Json | null
          status?: string | null
          tournament_id?: string | null
          updated_at?: string | null
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_away_club_id_fkey"
            columns: ["away_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_home_club_id_fkey"
            columns: ["home_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string | null
          id: string
          role: string | null
          scope_id: string
          scope_type: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: string | null
          scope_id: string
          scope_type?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: string | null
          scope_id?: string
          scope_type?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      news: {
        Row: {
          content: string | null
          id: string
          image_url: string | null
          published_at: string | null
          status: string | null
          summary: string | null
          title: string
        }
        Insert: {
          content?: string | null
          id?: string
          image_url?: string | null
          published_at?: string | null
          status?: string | null
          summary?: string | null
          title: string
        }
        Update: {
          content?: string | null
          id?: string
          image_url?: string | null
          published_at?: string | null
          status?: string | null
          summary?: string | null
          title?: string
        }
        Relationships: []
      }
      tournaments: {
        Row: {
          age_grade: string | null
          category: string | null
          country: string | null
          created_at: string | null
          external_id: string | null
          format: string | null
          id: string
          is_visible: boolean | null
          logo_url: string | null
          name: string
          region: string | null
          season_id: string
          slug: string | null
          sport: string | null
          status: string | null
          union_id: string | null
          updated_at: string | null
        }
        Insert: {
          age_grade?: string | null
          category?: string | null
          country?: string | null
          created_at?: string | null
          external_id?: string | null
          format?: string | null
          id?: string
          is_visible?: boolean | null
          logo_url?: string | null
          name: string
          region?: string | null
          season_id?: string
          slug?: string | null
          sport?: string | null
          status?: string | null
          union_id?: string | null
          updated_at?: string | null
        }
        Update: {
          age_grade?: string | null
          category?: string | null
          country?: string | null
          created_at?: string | null
          external_id?: string | null
          format?: string | null
          id?: string
          is_visible?: boolean | null
          logo_url?: string | null
          name?: string
          region?: string | null
          season_id?: string
          slug?: string | null
          sport?: string | null
          status?: string | null
          union_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournaments_union_id_fkey"
            columns: ["union_id"]
            isOneToOne: false
            referencedRelation: "unions"
            referencedColumns: ["id"]
          },
        ]
      }
      unions: {
        Row: {
          branding: Json | null
          country: string | null
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          branding?: Json | null
          country?: string | null
          created_at?: string | null
          id: string
          name: string
        }
        Update: {
          branding?: Json | null
          country?: string | null
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          id: string
          last_login_at: string | null
          name: string | null
          role: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          id: string
          last_login_at?: string | null
          name?: string | null
          role?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          id?: string
          last_login_at?: string | null
          name?: string | null
          role?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      authorize_admin: { Args: never; Returns: boolean }
      get_my_favorites: { Args: never; Returns: Json }
      get_my_favorites_enriched: { Args: never; Returns: Json }
      get_my_favorites_enriched_v2: {
        Args: { p_cursor?: string; p_limit?: number }
        Returns: {
          color: string
          created_at: string
          entity_id: string
          entity_type: string
          favorite_id: string
          logo_url: string
          name: string
          type_label: string
        }[]
      }
      get_user_favorites: {
        Args: { p_entity_type?: string }
        Returns: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
        }[]
      }
      toggle_favorite: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
  | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
    DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
  : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
    DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
  ? R
  : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
    DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] &
    DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
  ? R
  : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
  | keyof DefaultSchema["Tables"]
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
  : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
    Insert: infer I
  }
  ? I
  : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
    Insert: infer I
  }
  ? I
  : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
  | keyof DefaultSchema["Tables"]
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
  : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
    Update: infer U
  }
  ? U
  : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
    Update: infer U
  }
  ? U
  : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
  | keyof DefaultSchema["Enums"]
  | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
  : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
  | keyof DefaultSchema["CompositeTypes"]
  | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
  ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
  : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
