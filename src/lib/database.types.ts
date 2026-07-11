// NOTA: regenerar con supabase gen types typescript — editado a mano el 2026-07-01 para columnas de matches faltantes y tournaments.sync_locked
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

type GenericSupabaseRelationship = {
  foreignKeyName: string
  columns: string[]
  isOneToOne?: boolean
  referencedRelation: string
  referencedColumns: string[]
}

type GenericSupabaseTable = {
  Row: Record<string, any>
  Insert: Record<string, any>
  Update: Record<string, any>
  Relationships: GenericSupabaseRelationship[]
}

type GenericSupabaseView = GenericSupabaseTable | {
  Row: Record<string, any>
  Relationships: GenericSupabaseRelationship[]
}

type GenericSupabaseFunction = {
  Args: Record<string, any> | never
  Returns: any
}

export type Database = {
  public: {
    Tables: Record<string, GenericSupabaseTable> & {
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
          tournament_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          tournament_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          tournament_id?: string
        }
        Relationships: [
          { foreignKeyName: "categories_tournament_id_fkey"; columns: ["tournament_id"]; referencedRelation: "tournaments"; referencedColumns: ["id"] }
        ]
      }
      club_divisions: {
        Row: {
          category: string | null
          club_id: string
          created_at: string
          gender: string | null
          id: string
          name: string
          season: string | null
          sport: string | null
          status: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          club_id: string
          created_at?: string
          gender?: string | null
          id?: string
          name: string
          season?: string | null
          sport?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          club_id?: string
          created_at?: string
          gender?: string | null
          id?: string
          name?: string
          season?: string | null
          sport?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "club_divisions_club_id_fkey"; columns: ["club_id"]; referencedRelation: "clubs"; referencedColumns: ["id"] }
        ]
      }
      club_person_roles: {
        Row: {
          club_id: string
          created_at: string
          division_id: string | null
          id: string
          joined_at: string | null
          left_at: string | null
          person_id: string
          position: string | null
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          club_id: string
          created_at?: string
          division_id?: string | null
          id?: string
          joined_at?: string | null
          left_at?: string | null
          person_id: string
          position?: string | null
          role: string
          status?: string
          updated_at?: string
        }
        Update: {
          club_id?: string
          created_at?: string
          division_id?: string | null
          id?: string
          joined_at?: string | null
          left_at?: string | null
          person_id?: string
          position?: string | null
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "club_person_roles_club_id_fkey"; columns: ["club_id"]; referencedRelation: "clubs"; referencedColumns: ["id"] },
          { foreignKeyName: "club_person_roles_person_id_fkey"; columns: ["person_id"]; referencedRelation: "people"; referencedColumns: ["id"] },
          { foreignKeyName: "club_person_roles_division_id_fkey"; columns: ["division_id"]; referencedRelation: "club_divisions"; referencedColumns: ["id"] }
        ]
      }
      clubs: {
        Row: {
          categories: string[] | null
          city: string | null
          country: string | null
          created_at: string
          id: string
          is_visible: boolean
          logo_url: string | null
          name: string
          primary_color: string | null
          region: string | null
          short_name: string | null
          slug: string | null
          sport: string | null
          sport_id: string | null
          union_id: string | null
          updated_at: string | null
        }
        Insert: {
          categories?: string[] | null
          city?: string | null
          country?: string | null
          created_at?: string
          id: string
          is_visible?: boolean
          logo_url?: string | null
          name: string
          primary_color?: string | null
          region?: string | null
          short_name?: string | null
          slug?: string | null
          sport?: string | null
          sport_id?: string | null
          union_id?: string | null
          updated_at?: string | null
        }
        Update: {
          categories?: string[] | null
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_visible?: boolean
          logo_url?: string | null
          name?: string
          primary_color?: string | null
          region?: string | null
          short_name?: string | null
          slug?: string | null
          sport?: string | null
          sport_id?: string | null
          union_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          { foreignKeyName: "clubs_union_id_fkey"; columns: ["union_id"]; referencedRelation: "unions"; referencedColumns: ["id"] }
        ]
      }
      countries: {
        Row: {
          code: string | null
          created_at: string
          flag_emoji: string | null
          id: string
          name: string
          region: string | null
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          flag_emoji?: string | null
          id: string
          name: string
          region?: string | null
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          flag_emoji?: string | null
          id?: string
          name?: string
          region?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      discipline_incidents: {
        Row: {
          club_id: string | null
          created_at: string
          description: string | null
          id: string
          incident_type: string | null
          match_id: string | null
          player_id: string | null
          player_name: string | null
          severity: string | null
          status: string
          tournament_id: string | null
        }
        Insert: {
          club_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          incident_type?: string | null
          match_id?: string | null
          player_id?: string | null
          player_name?: string | null
          severity?: string | null
          status?: string
          tournament_id?: string | null
        }
        Update: {
          club_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          incident_type?: string | null
          match_id?: string | null
          player_id?: string | null
          player_name?: string | null
          severity?: string | null
          status?: string
          tournament_id?: string | null
        }
        Relationships: []
      }
      discipline_sanctions: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          incident_id: string | null
          start_date: string | null
          status: string | null
          summary: string | null
          weeks: number | null
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          incident_id?: string | null
          start_date?: string | null
          status?: string | null
          summary?: string | null
          weeks?: number | null
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          incident_id?: string | null
          start_date?: string | null
          status?: string | null
          summary?: string | null
          weeks?: number | null
        }
        Relationships: []
      }
      external_data: {
        Row: {
          data: Json | null
          entity_type: string | null
          external_id: string | null
          id: string
          last_updated_at: string
          provider: string | null
        }
        Insert: {
          data?: Json | null
          entity_type?: string | null
          external_id?: string | null
          id?: string
          last_updated_at?: string
          provider?: string | null
        }
        Update: {
          data?: Json | null
          entity_type?: string | null
          external_id?: string | null
          id?: string
          last_updated_at?: string
          provider?: string | null
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      matches: {
        Row: {
          attendance: number | null
          away_club_id: string | null
          away_division_id: string | null
          broadcast_url: string | null
          category: string | null
          clock: Json | null
          created_at: string
          created_by_club_id: string | null
          created_by_user_id: string | null
          date_time: string | null
          events: Json | null
          group_id: string | null
          home_club_id: string | null
          home_division_id: string | null
          id: string
          lineups: Json | null
          notes: string | null
          phase_id: string | null
          pitch: string | null
          referee: string | null
          review_notes: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by_user_id: string | null
          round_id: string | null
          sport: string | null
          sport_id: string | null
          round_uuid: string | null
          score: Json | null
          status: string
          tournament_id: string | null
          updated_at: string
          venue: string | null
          weather: Json | null
          is_visible: boolean
          home_base_points: number
          away_base_points: number
          home_bonus_points: number
          away_bonus_points: number
          points_autocalculated: boolean
          points_override_reason: string | null
          season_id: string | null
          home_team_id: string | null
          away_team_id: string | null
          home_season_entry_id: string | null
          away_season_entry_id: string | null
        }
        Insert: {
          attendance?: number | null
          away_club_id?: string | null
          away_division_id?: string | null
          broadcast_url?: string | null
          category?: string | null
          clock?: Json | null
          created_at?: string
          created_by_club_id?: string | null
          created_by_user_id?: string | null
          date_time?: string | null
          events?: Json | null
          group_id?: string | null
          home_club_id?: string | null
          home_division_id?: string | null
          id?: string
          lineups?: Json | null
          notes?: string | null
          phase_id?: string | null
          pitch?: string | null
          referee?: string | null
          review_notes?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          round_id?: string | null
          sport?: string | null
          sport_id?: string | null
          round_uuid?: string | null
          score?: Json | null
          status?: string
          tournament_id?: string | null
          updated_at?: string
          venue?: string | null
          weather?: Json | null
          is_visible?: boolean
          home_base_points?: number
          away_base_points?: number
          home_bonus_points?: number
          away_bonus_points?: number
          points_autocalculated?: boolean
          points_override_reason?: string | null
          season_id?: string | null
          home_team_id?: string | null
          away_team_id?: string | null
          home_season_entry_id?: string | null
          away_season_entry_id?: string | null
        }
        Update: {
          attendance?: number | null
          away_club_id?: string | null
          away_division_id?: string | null
          broadcast_url?: string | null
          category?: string | null
          clock?: Json | null
          created_at?: string
          created_by_club_id?: string | null
          created_by_user_id?: string | null
          date_time?: string | null
          events?: Json | null
          group_id?: string | null
          home_club_id?: string | null
          home_division_id?: string | null
          id?: string
          lineups?: Json | null
          notes?: string | null
          phase_id?: string | null
          pitch?: string | null
          referee?: string | null
          review_notes?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          round_id?: string | null
          sport?: string | null
          sport_id?: string | null
          round_uuid?: string | null
          score?: Json | null
          status?: string
          tournament_id?: string | null
          updated_at?: string
          venue?: string | null
          weather?: Json | null
          is_visible?: boolean
          home_base_points?: number
          away_base_points?: number
          home_bonus_points?: number
          away_bonus_points?: number
          points_autocalculated?: boolean
          points_override_reason?: string | null
          season_id?: string | null
          home_team_id?: string | null
          away_team_id?: string | null
          home_season_entry_id?: string | null
          away_season_entry_id?: string | null
        }
        Relationships: [
          { foreignKeyName: "matches_away_division_id_fkey"; columns: ["away_division_id"]; referencedRelation: "club_divisions"; referencedColumns: ["id"] },
          { foreignKeyName: "matches_home_division_id_fkey"; columns: ["home_division_id"]; referencedRelation: "club_divisions"; referencedColumns: ["id"] },
          { foreignKeyName: "matches_tournament_id_fkey"; columns: ["tournament_id"]; referencedRelation: "tournaments"; referencedColumns: ["id"] }
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          role: string
          scope_id: string
          scope_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: string
          scope_id: string
          scope_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          scope_id?: string
          scope_type?: string
          user_id?: string
        }
        Relationships: []
      }
      news: {
        Row: {
          author_id: string | null
          content: string | null
          created_at: string
          id: string
          image_url: string | null
          published_at: string | null
          scope: string | null
          scope_id: string | null
          sport: string | null
          status: string
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          content?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          published_at?: string | null
          scope?: string | null
          scope_id?: string | null
          sport?: string | null
          status?: string
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          content?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          published_at?: string | null
          scope?: string | null
          scope_id?: string | null
          sport?: string | null
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      people: {
        Row: {
          avatar_url: string | null
          birth_date: string | null
          club_id: string | null
          created_at: string
          email: string | null
          first_name: string
          full_name: string | null
          gender: string | null
          height: number | null
          id: string
          id_number: string | null
          last_name: string
          name: string | null
          phone: string | null
          photo_url: string | null
          position: string | null
          position_secondary: string[] | null
          role: string | null
          status: string | null
          updated_at: string
          weight: number | null
        }
        Insert: {
          avatar_url?: string | null
          birth_date?: string | null
          club_id?: string | null
          created_at?: string
          email?: string | null
          first_name: string
          full_name?: string | null
          gender?: string | null
          height?: number | null
          id?: string
          id_number?: string | null
          last_name: string
          name?: string | null
          phone?: string | null
          photo_url?: string | null
          position?: string | null
          position_secondary?: string | null
          role?: string | null
          status?: string | null
          updated_at?: string
          weight?: number | null
        }
        Update: {
          avatar_url?: string | null
          birth_date?: string | null
          club_id?: string | null
          created_at?: string
          email?: string | null
          first_name?: string
          full_name?: string | null
          gender?: string | null
          height?: number | null
          id?: string
          id_number?: string | null
          last_name?: string
          name?: string | null
          phone?: string | null
          photo_url?: string | null
          position?: string | null
          position_secondary?: string | null
          role?: string | null
          status?: string | null
          updated_at?: string
          weight?: number | null
        }
        Relationships: []
      }
      regulations: {
        Row: {
          content: string | null
          id: string
          scope_id: string | null
          scope_type: string | null
          updated_at: string
        }
        Insert: {
          content?: string | null
          id?: string
          scope_id?: string | null
          scope_type?: string | null
          updated_at?: string
        }
        Update: {
          content?: string | null
          id?: string
          scope_id?: string | null
          scope_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      seasons: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          is_active: boolean
          season_id: string | null
          start_date: string | null
          teams_count: number | null
          tournament_id: string | null
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          season_id?: string | null
          start_date?: string | null
          teams_count?: number | null
          tournament_id?: string | null
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          season_id?: string | null
          start_date?: string | null
          teams_count?: number | null
          tournament_id?: string | null
        }
        Relationships: []
      }
      sports: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          is_active: boolean
          name: string
          priority: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id: string
          is_active?: boolean
          name: string
          priority?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          priority?: number
          updated_at?: string
        }
        Relationships: []
      }
      tournament_groups: {
        Row: {
          created_at: string
          id: string
          name: string
          order_index: number
          phase_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          order_index?: number
          phase_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          order_index?: number
          phase_id?: string
        }
        Relationships: [
          { foreignKeyName: "tournament_groups_phase_id_fkey"; columns: ["phase_id"]; referencedRelation: "tournament_phases"; referencedColumns: ["id"] }
        ]
      }
      tournament_participants: {
        Row: {
          club_id: string | null
          country_name: string | null
          created_at: string
          group_id: string | null
          id: string
          joined_at: string | null
          name: string | null
          notes: string | null
          region_id: string | null
          seed: number | null
          short_code: string | null
          status: string
          tournament_id: string
          type: string
          updated_at: string
        }
        Insert: {
          club_id?: string | null
          country_name?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          joined_at?: string | null
          name?: string | null
          notes?: string | null
          region_id?: string | null
          seed?: number | null
          short_code?: string | null
          status?: string
          tournament_id: string
          type?: string
          updated_at?: string
        }
        Update: {
          club_id?: string | null
          country_name?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          joined_at?: string | null
          name?: string | null
          notes?: string | null
          region_id?: string | null
          seed?: number | null
          short_code?: string | null
          status?: string
          tournament_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "tournament_participants_tournament_id_fkey"; columns: ["tournament_id"]; referencedRelation: "tournaments"; referencedColumns: ["id"] },
          { foreignKeyName: "tournament_participants_club_id_fkey"; columns: ["club_id"]; referencedRelation: "clubs"; referencedColumns: ["id"] }
        ]
      }
      tournament_participants_audit: {
        Row: {
          action: string
          changed_by: string | null
          changes: Json | null
          created_at: string
          id: string
          participant_id: string | null
          tournament_id: string | null
        }
        Insert: {
          action: string
          changed_by?: string | null
          changes?: Json | null
          created_at?: string
          id?: string
          participant_id?: string | null
          tournament_id?: string | null
        }
        Update: {
          action?: string
          changed_by?: string | null
          changes?: Json | null
          created_at?: string
          id?: string
          participant_id?: string | null
          tournament_id?: string | null
        }
        Relationships: []
      }
      tournament_phases: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          is_active: boolean
          name: string
          order_index: number
          phase_type: string
          settings: Json | null
          start_date: string | null
          tournament_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          name: string
          order_index?: number
          phase_type: string
          settings?: Json | null
          start_date?: string | null
          tournament_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          name?: string
          order_index?: number
          phase_type?: string
          settings?: Json | null
          start_date?: string | null
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "tournament_phases_tournament_id_fkey"; columns: ["tournament_id"]; referencedRelation: "tournaments"; referencedColumns: ["id"] }
        ]
      }
      tournament_relations: {
        Row: {
          created_at: string
          description: string | null
          id: string
          relation_direction: string
          relation_type: string
          source_tournament_id: string
          status: string
          target_tournament_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          relation_direction?: string
          relation_type: string
          source_tournament_id: string
          status?: string
          target_tournament_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          relation_direction?: string
          relation_type?: string
          source_tournament_id?: string
          status?: string
          target_tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "tournament_relations_source_tournament_id_fkey"; columns: ["source_tournament_id"]; referencedRelation: "tournaments"; referencedColumns: ["id"] },
          { foreignKeyName: "tournament_relations_target_tournament_id_fkey"; columns: ["target_tournament_id"]; referencedRelation: "tournaments"; referencedColumns: ["id"] }
        ]
      }
      tournament_rounds: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          is_completed: boolean
          name: string
          notes: string | null
          order_index: number
          phase_id: string
          start_date: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_completed?: boolean
          name: string
          notes?: string | null
          order_index?: number
          phase_id: string
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_completed?: boolean
          name?: string
          notes?: string | null
          order_index?: number
          phase_id?: string
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "tournament_rounds_phase_id_fkey"; columns: ["phase_id"]; referencedRelation: "tournament_phases"; referencedColumns: ["id"] }
        ]
      }
      tournament_standings: {
        Row: {
          bonus_points: number
          club_id: string
          conceded: number
          drawn: number
          form: string | null
          group_id: string | null
          id: string
          last_updated: string
          lost: number
          phase_id: string | null
          played: number
          points: number
          position: number
          scored: number
          stats: Json | null
          streak: string | null
          tournament_id: string
          won: number
        }
        Insert: {
          bonus_points?: number
          club_id: string
          conceded?: number
          drawn?: number
          form?: string | null
          group_id?: string | null
          id?: string
          last_updated?: string
          lost?: number
          phase_id?: string | null
          played?: number
          points?: number
          position: number
          scored?: number
          stats?: Json | null
          streak?: string | null
          tournament_id: string
          won?: number
        }
        Update: {
          bonus_points?: number
          club_id?: string
          conceded?: number
          drawn?: number
          form?: string | null
          group_id?: string | null
          id?: string
          last_updated?: string
          lost?: number
          phase_id?: string | null
          played?: number
          points?: number
          position?: number
          scored?: number
          stats?: Json | null
          streak?: string | null
          tournament_id?: string
          won?: number
        }
        Relationships: [
          { foreignKeyName: "tournament_standings_tournament_id_fkey"; columns: ["tournament_id"]; referencedRelation: "tournaments"; referencedColumns: ["id"] }
        ]
      }
      tournaments: {
        Row: {
          age_grade: string | null
          banner_url: string | null
          category: string | null
          country: string | null
          country_id: string | null
          created_at: string
          created_by_club_id: string | null
          created_by_user_id: string | null
          display_name: string | null
          external_id: string | null
          format: string | null
          id: string
          is_popular: boolean
          is_visible: boolean
          logo_url: string | null
          name: string
          primary_color: string | null
          priority: number
          region: string | null
          review_notes: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by_user_id: string | null
          ruleset: { [key: string]: any } | null
          season_id: string | null
          secondary_color: string | null
          linked_official_tournament_id: string | null
          slug: string | null
          sport_id: string | null
          status: string
          sync_locked: boolean
          union_id: string | null
          updated_at: string
          url: string | null
        }
        Insert: {
          age_grade?: string | null
          banner_url?: string | null
          category?: string | null
          country?: string | null
          country_id?: string | null
          created_at?: string
          created_by_club_id?: string | null
          created_by_user_id?: string | null
          display_name?: string | null
          external_id?: string | null
          format?: string | null
          id?: string
          is_popular?: boolean
          is_visible?: boolean
          logo_url?: string | null
          name: string
          primary_color?: string | null
          priority?: number
          region?: string | null
          review_notes?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          ruleset?: { [key: string]: any } | null
          season_id?: string | null
          secondary_color?: string | null
          linked_official_tournament_id?: string | null
          slug?: string | null
          sport_id?: string | null
          status?: string
          sync_locked?: boolean
          union_id?: string | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          age_grade?: string | null
          banner_url?: string | null
          category?: string | null
          country?: string | null
          country_id?: string | null
          created_at?: string
          created_by_club_id?: string | null
          created_by_user_id?: string | null
          display_name?: string | null
          external_id?: string | null
          format?: string | null
          id?: string
          is_popular?: boolean
          is_visible?: boolean
          logo_url?: string | null
          name?: string
          primary_color?: string | null
          priority?: number
          region?: string | null
          review_notes?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by_user_id?: string | null
          ruleset?: { [key: string]: any } | null
          season_id?: string | null
          secondary_color?: string | null
          linked_official_tournament_id?: string | null
          slug?: string | null
          sport_id?: string | null
          status?: string
          sync_locked?: boolean
          union_id?: string | null
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          { foreignKeyName: "tournaments_union_id_fkey"; columns: ["union_id"]; referencedRelation: "unions"; referencedColumns: ["id"] },
          { foreignKeyName: "tournaments_country_id_fkey"; columns: ["country_id"]; referencedRelation: "countries"; referencedColumns: ["id"] },
          { foreignKeyName: "tournaments_sport_id_fkey"; columns: ["sport_id"]; referencedRelation: "sports"; referencedColumns: ["id"] }
        ]
      }
      unions: {
        Row: {
          branding: Json | null
          country: string | null
          created_at: string
          id: string
          name: string
          season_ids: string[] | null
        }
        Insert: {
          branding?: Json | null
          country?: string | null
          created_at?: string
          id: string
          name: string
          season_ids?: string[] | null
        }
        Update: {
          branding?: Json | null
          country?: string | null
          created_at?: string
          id?: string
          name?: string
          season_ids?: string[] | null
        }
        Relationships: []
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          id: string
          last_login_at: string | null
          name: string | null
          role: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          id: string
          last_login_at?: string | null
          name?: string | null
          role?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          id?: string
          last_login_at?: string | null
          name?: string | null
          role?: string
        }
        Relationships: []
      }
      user_export_presets: {
        Row: {
          created_at: string
          id: string
          name: string
          name_normalized: string
          payload: Json
          preset_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id: string
          name: string
          name_normalized: string
          payload?: Json
          preset_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          name_normalized?: string
          payload?: Json
          preset_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          { foreignKeyName: "user_export_presets_user_id_fkey"; columns: ["user_id"]; referencedRelation: "users"; referencedColumns: ["id"] }
        ]
      }
      admin_audit_log: {
        Row: {
          id: string
          created_at: string
          actor_user_id: string
          entity_type: string
          entity_id: string
          action: string
          changes: Json
          request_id: string | null
          source: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          actor_user_id: string
          entity_type: string
          entity_id: string
          action?: string
          changes: Json
          request_id?: string | null
          source?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          actor_user_id?: string
          entity_type?: string
          entity_id?: string
          action?: string
          changes?: Json
          request_id?: string | null
          source?: string | null
        }
        Relationships: []
      }
      club_aliases: {
        Row: {
          id: string
          club_id: string
          alias: string
          created_at: string
        }
        Insert: {
          id?: string
          club_id: string
          alias: string
          created_at?: string
        }
        Update: {
          id?: string
          club_id?: string
          alias?: string
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: "club_aliases_club_id_fkey"; columns: ["club_id"]; referencedRelation: "clubs"; referencedColumns: ["id"] }
        ]
      }
      club_profile: {
        Row: {
          club_id: string
          admin_contact_name: string | null
          admin_contact_email: string | null
          admin_contact_phone: string | null
          website: string | null
          instagram: string | null
          x_url: string | null
          youtube: string | null
          tiktok: string | null
          venue_name: string | null
          venue_address: string | null
          venue_capacity: number | null
          venue_notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          club_id: string
          admin_contact_name?: string | null
          admin_contact_email?: string | null
          admin_contact_phone?: string | null
          website?: string | null
          instagram?: string | null
          x_url?: string | null
          youtube?: string | null
          tiktok?: string | null
          venue_name?: string | null
          venue_address?: string | null
          venue_capacity?: number | null
          venue_notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          club_id?: string
          admin_contact_name?: string | null
          admin_contact_email?: string | null
          admin_contact_phone?: string | null
          website?: string | null
          instagram?: string | null
          x_url?: string | null
          youtube?: string | null
          tiktok?: string | null
          venue_name?: string | null
          venue_address?: string | null
          venue_capacity?: number | null
          venue_notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "club_profile_club_id_fkey"; columns: ["club_id"]; referencedRelation: "clubs"; referencedColumns: ["id"] }
        ]
      }
      club_secondary_unions: {
        Row: {
          id: string
          club_id: string
          union_id: string
          created_at: string
        }
        Insert: {
          id?: string
          club_id: string
          union_id: string
          created_at?: string
        }
        Update: {
          id?: string
          club_id?: string
          union_id?: string
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: "club_secondary_unions_club_id_fkey"; columns: ["club_id"]; referencedRelation: "clubs"; referencedColumns: ["id"] },
          { foreignKeyName: "club_secondary_unions_union_id_fkey"; columns: ["union_id"]; referencedRelation: "unions"; referencedColumns: ["id"] }
        ]
      }
      club_venues: {
        Row: {
          id: string
          club_id: string
          name: string
          address: string | null
          city: string | null
          maps_link: string | null
          is_primary: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          club_id: string
          name: string
          address?: string | null
          city?: string | null
          maps_link?: string | null
          is_primary?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          club_id?: string
          name?: string
          address?: string | null
          city?: string | null
          maps_link?: string | null
          is_primary?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "club_venues_club_id_fkey"; columns: ["club_id"]; referencedRelation: "clubs"; referencedColumns: ["id"] }
        ]
      }
      players: {
        Row: {
          id: string
          name: string | null
          position: string | null
          nationality: string | null
          club_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name?: string | null
          position?: string | null
          nationality?: string | null
          club_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string | null
          position?: string | null
          nationality?: string | null
          club_id?: string | null
          created_at?: string
        }
        Relationships: []
      }
      squad_members: {
        Row: {
          id: string
          division_id: string
          person_id: string
          position: string
          role: 'titular' | 'suplente' | 'desarrollo'
          jersey_number: number | null
          status: 'disponible' | 'lesionado' | 'suspendido' | 'convocado' | 'baja'
          order: number
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          division_id: string
          person_id: string
          position: string
          role?: 'titular' | 'suplente' | 'desarrollo'
          jersey_number?: number | null
          status?: 'disponible' | 'lesionado' | 'suspendido' | 'convocado' | 'baja'
          order?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          division_id?: string
          person_id?: string
          position?: string
          role?: 'titular' | 'suplente' | 'desarrollo'
          jersey_number?: number | null
          status?: 'disponible' | 'lesionado' | 'suspendido' | 'convocado' | 'baja'
          order?: number
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: "squad_members_person_id_fkey"; columns: ["person_id"]; referencedRelation: "people"; referencedColumns: ["id"] }
        ]
      }
    }
    Views: Record<string, GenericSupabaseView>
    Functions: Record<string, GenericSupabaseFunction> & {
      generate_rounds_for_phase: {
        Args: { p_phase_id: string; p_num_rounds: number }
        Returns: undefined
      }
      get_my_favorites_enriched: {
        Args: Record<string, never>
        Returns: Json
      }
      get_my_favorites_enriched_v2: {
        Args: { p_limit?: number; p_cursor?: string }
        Returns: Json
      }
      get_table_columns: {
        Args: { table_name: string }
        Returns: Json
      }
      get_table_constraints: {
        Args: { table_name: string }
        Returns: Json
      }
      get_user_favorites: {
        Args: { p_entity_type?: string }
        Returns: Json
      }
      get_all_tournaments: {
        Args: {
          p_viewer_user_id?: string | null
          p_include_hidden?: boolean
        }
        Returns: {
          id: string
          name: string
          slug: string | null
          sport_id: string | null
          sport_name: string | null
          country_id: string | null
          country_name: string | null
          organization_id: string | null
          organization_name: string | null
          logo_url: string | null
          is_popular: boolean
          is_active: boolean
          display_order: number | null
          priority: number | null
          followers_count: number
          is_followed_by_user: boolean
          created_at: string
          updated_at: string
          original_name: string | null
          display_name: string | null
          is_api_managed: boolean
          data_source: string | null
          category: string | null
          age_grade: string | null
          format: string | null
          status: string | null
          season_id: string | null
          union_id: string | null
          external_id: string | null
        }[]
      }
      toggle_tournament_follow: {
        Args: {
          p_tournament_id: string
        }
        Returns: boolean
      }
      toggle_favorite: {
        Args: { p_entity_type: string; p_entity_id: string }
        Returns: Json
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

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never
