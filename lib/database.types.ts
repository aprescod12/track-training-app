export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      achievements: {
        Row: {
          created_at: string
          dedupe_key: string | null
          exercise_id: string | null
          id: string
          meta: Json | null
          type: string
          user_id: string
          value_num: number | null
          value_text: string | null
          workout_id: string | null
        }
        Insert: {
          created_at?: string
          dedupe_key?: string | null
          exercise_id?: string | null
          id?: string
          meta?: Json | null
          type: string
          user_id: string
          value_num?: number | null
          value_text?: string | null
          workout_id?: string | null
        }
        Update: {
          created_at?: string
          dedupe_key?: string | null
          exercise_id?: string | null
          id?: string
          meta?: Json | null
          type?: string
          user_id?: string
          value_num?: number | null
          value_text?: string | null
          workout_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "achievements_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["exercise_id"]
          },
          {
            foreignKeyName: "achievements_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workout_summary_v"
            referencedColumns: ["workout_id"]
          },
          {
            foreignKeyName: "achievements_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          created_at: string
          ends_at: string | null
          id: string
          notes: string | null
          notification_id: string | null
          reminder_minutes: number | null
          starts_at: string
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          id?: string
          notes?: string | null
          notification_id?: string | null
          reminder_minutes?: number | null
          starts_at: string
          title: string
          user_id?: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          id?: string
          notes?: string | null
          notification_id?: string | null
          reminder_minutes?: number | null
          starts_at?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      entry_sets: {
        Row: {
          created_at: string
          entry_id: string
          id: string
          rep_number: number | null
          reps: number | null
          set_number: number
          time_text: string | null
          weight: number | null
        }
        Insert: {
          created_at?: string
          entry_id: string
          id?: string
          rep_number?: number | null
          reps?: number | null
          set_number: number
          time_text?: string | null
          weight?: number | null
        }
        Update: {
          created_at?: string
          entry_id?: string
          id?: string
          rep_number?: number | null
          reps?: number | null
          set_number?: number
          time_text?: string | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "entry_sets_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "workout_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_prs: {
        Row: {
          best_reps: number | null
          best_time_entry_id: string | null
          best_time_rep_number: number | null
          best_time_sec: number | null
          best_time_set_number: number | null
          best_time_text: string | null
          best_weight: number | null
          best_weight_entry_id: string | null
          best_weight_set_number: number | null
          exercise_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          best_reps?: number | null
          best_time_entry_id?: string | null
          best_time_rep_number?: number | null
          best_time_sec?: number | null
          best_time_set_number?: number | null
          best_time_text?: string | null
          best_weight?: number | null
          best_weight_entry_id?: string | null
          best_weight_set_number?: number | null
          exercise_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          best_reps?: number | null
          best_time_entry_id?: string | null
          best_time_rep_number?: number | null
          best_time_sec?: number | null
          best_time_set_number?: number | null
          best_time_text?: string | null
          best_weight?: number | null
          best_weight_entry_id?: string | null
          best_weight_set_number?: number | null
          exercise_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      exercises: {
        Row: {
          category: string | null
          created_at: string
          created_by: string | null
          distance_m: number | null
          exercise_id: string
          name: string
          score_type: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          distance_m?: number | null
          exercise_id?: string
          name: string
          score_type: string
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string | null
          distance_m?: number | null
          exercise_id?: string
          name?: string
          score_type?: string
        }
        Relationships: []
      }
      friendships: {
        Row: {
          created_at: string
          id: string
          requester_id: string
          status: string
          user_high: string
          user_low: string
        }
        Insert: {
          created_at?: string
          id?: string
          requester_id: string
          status?: string
          user_high: string
          user_low: string
        }
        Update: {
          created_at?: string
          id?: string
          requester_id?: string
          status?: string
          user_high?: string
          user_low?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          events: string[] | null
          featured_exercise_id: string | null
          full_name: string | null
          grad_year: number | null
          id: string
          role: string | null
          school: string | null
          team: string | null
          updated_at: string | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          events?: string[] | null
          featured_exercise_id?: string | null
          full_name?: string | null
          grad_year?: number | null
          id: string
          role?: string | null
          school?: string | null
          team?: string | null
          updated_at?: string | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          events?: string[] | null
          featured_exercise_id?: string | null
          full_name?: string | null
          grad_year?: number | null
          id?: string
          role?: string | null
          school?: string | null
          team?: string | null
          updated_at?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_featured_exercise_id_fkey"
            columns: ["featured_exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["exercise_id"]
          },
        ]
      }
      workout_entries: {
        Row: {
          created_at: string
          distance_m: number | null
          exercise: string | null
          exercise_id: string | null
          id: string
          label: string | null
          lift_reps: number[] | null
          lift_weights: number[] | null
          notes: string | null
          reps: number | null
          set_times: string[] | null
          sets: number | null
          time: string | null
          times: string[] | null
          user_id: string | null
          value: string | null
          weight: number | null
          workout_id: string
        }
        Insert: {
          created_at?: string
          distance_m?: number | null
          exercise?: string | null
          exercise_id?: string | null
          id?: string
          label?: string | null
          lift_reps?: number[] | null
          lift_weights?: number[] | null
          notes?: string | null
          reps?: number | null
          set_times?: string[] | null
          sets?: number | null
          time?: string | null
          times?: string[] | null
          user_id?: string | null
          value?: string | null
          weight?: number | null
          workout_id: string
        }
        Update: {
          created_at?: string
          distance_m?: number | null
          exercise?: string | null
          exercise_id?: string | null
          id?: string
          label?: string | null
          lift_reps?: number[] | null
          lift_weights?: number[] | null
          notes?: string | null
          reps?: number | null
          set_times?: string[] | null
          sets?: number | null
          time?: string | null
          times?: string[] | null
          user_id?: string | null
          value?: string | null
          weight?: number | null
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_entries_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["exercise_id"]
          },
          {
            foreignKeyName: "workout_entries_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_entries_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workout_summary_v"
            referencedColumns: ["workout_id"]
          },
          {
            foreignKeyName: "workout_entries_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      workouts: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          title: string
          user_id: string
          workout_date: string
          workout_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          title: string
          user_id?: string
          workout_date: string
          workout_type?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          title?: string
          user_id?: string
          workout_date?: string
          workout_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "workouts_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      workout_summary_v: {
        Row: {
          distance_m_total: number | null
          total_sets: number | null
          user_id: string | null
          workout_date: string | null
          workout_id: string | null
          workout_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workouts_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      is_friends: { Args: { owner: string; viewer: string }; Returns: boolean }
      is_username_available: { Args: { candidate: string }; Returns: boolean }
      parse_time_to_seconds: { Args: { t: string }; Returns: number }
      recompute_exercise_pr: {
        Args: { p_exercise_id: string; p_user_id: string }
        Returns: undefined
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
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends { Insert: infer I }
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
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends { Update: infer U }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
