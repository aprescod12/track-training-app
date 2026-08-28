export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
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
            referencedRelation: "team_workout_summary_v"
            referencedColumns: ["workout_id"]
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
      coach_athlete_assignments: {
        Row: {
          active: boolean
          athlete_membership_id: string
          coach_membership_id: string
          created_at: string
          created_by: string
          ended_at: string | null
          id: string
          is_primary: boolean
          team_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          athlete_membership_id: string
          coach_membership_id: string
          created_at?: string
          created_by: string
          ended_at?: string | null
          id?: string
          is_primary?: boolean
          team_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          athlete_membership_id?: string
          coach_membership_id?: string
          created_at?: string
          created_by?: string
          ended_at?: string | null
          id?: string
          is_primary?: boolean
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_athlete_assignments_athlete_same_team_fkey"
            columns: ["team_id", "athlete_membership_id"]
            isOneToOne: false
            referencedRelation: "team_memberships"
            referencedColumns: ["team_id", "id"]
          },
          {
            foreignKeyName: "coach_athlete_assignments_coach_same_team_fkey"
            columns: ["team_id", "coach_membership_id"]
            isOneToOne: false
            referencedRelation: "team_memberships"
            referencedColumns: ["team_id", "id"]
          },
          {
            foreignKeyName: "coach_athlete_assignments_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_training_permissions: {
        Row: {
          can_prescribe: boolean
          can_review: boolean
          coach_membership_id: string
          created_at: string
          granted_by: string | null
          team_id: string
          updated_at: string
          workout_type: string
        }
        Insert: {
          can_prescribe?: boolean
          can_review?: boolean
          coach_membership_id: string
          created_at?: string
          granted_by?: string | null
          team_id: string
          updated_at?: string
          workout_type: string
        }
        Update: {
          can_prescribe?: boolean
          can_review?: boolean
          coach_membership_id?: string
          created_at?: string
          granted_by?: string | null
          team_id?: string
          updated_at?: string
          workout_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_training_permissions_membership_same_team_fkey"
            columns: ["team_id", "coach_membership_id"]
            isOneToOne: false
            referencedRelation: "team_memberships"
            referencedColumns: ["team_id", "id"]
          },
        ]
      }
      entity_claims: {
        Row: {
          claimant_user_id: string
          created_at: string
          id: string
          organization_id: string | null
          requested_role: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          team_id: string | null
          verification_request_id: string | null
        }
        Insert: {
          claimant_user_id: string
          created_at?: string
          id?: string
          organization_id?: string | null
          requested_role: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          team_id?: string | null
          verification_request_id?: string | null
        }
        Update: {
          claimant_user_id?: string
          created_at?: string
          id?: string
          organization_id?: string | null
          requested_role?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          team_id?: string | null
          verification_request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entity_claims_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_claims_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_claims_verification_request_id_fkey"
            columns: ["verification_request_id"]
            isOneToOne: false
            referencedRelation: "verification_requests"
            referencedColumns: ["id"]
          },
        ]
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
      field_attempts: {
        Row: {
          attempt_number: number
          created_at: string
          entry_id: string
          id: string
          mark_m: number | null
          notes: string | null
          outcome: string
        }
        Insert: {
          attempt_number: number
          created_at?: string
          entry_id: string
          id?: string
          mark_m?: number | null
          notes?: string | null
          outcome: string
        }
        Update: {
          attempt_number?: number
          created_at?: string
          entry_id?: string
          id?: string
          mark_m?: number | null
          notes?: string | null
          outcome?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_attempts_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "workout_entries"
            referencedColumns: ["id"]
          },
        ]
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
      organization_affiliation_requests: {
        Row: {
          approved_by: string | null
          created_at: string
          id: string
          organization_id: string
          requested_by: string
          resolved_at: string | null
          status: string
          team_id: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          id?: string
          organization_id: string
          requested_by: string
          resolved_at?: string | null
          status?: string
          team_id: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          requested_by?: string
          resolved_at?: string | null
          status?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_affiliation_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_affiliation_requests_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          invited_by: string | null
          joined_at: string | null
          organization_id: string
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          organization_id: string
          role: string
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          organization_id?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          archived_at: string | null
          city: string | null
          country: string | null
          created_at: string
          created_by: string
          id: string
          name: string
          organization_type: string
          slug: string
          state_region: string | null
          updated_at: string
          verification_status: string
          verified_at: string | null
          website: string | null
        }
        Insert: {
          archived_at?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by: string
          id?: string
          name: string
          organization_type: string
          slug: string
          state_region?: string | null
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          website?: string | null
        }
        Update: {
          archived_at?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          organization_type?: string
          slug?: string
          state_region?: string | null
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          website?: string | null
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
      team_group_memberships: {
        Row: {
          created_at: string
          group_id: string
          team_id: string
          team_membership_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          team_id: string
          team_membership_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          team_id?: string
          team_membership_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_group_memberships_group_same_team_fkey"
            columns: ["team_id", "group_id"]
            isOneToOne: false
            referencedRelation: "team_groups"
            referencedColumns: ["team_id", "id"]
          },
          {
            foreignKeyName: "team_group_memberships_member_same_team_fkey"
            columns: ["team_id", "team_membership_id"]
            isOneToOne: false
            referencedRelation: "team_memberships"
            referencedColumns: ["team_id", "id"]
          },
          {
            foreignKeyName: "team_group_memberships_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_groups: {
        Row: {
          created_at: string
          created_by: string
          group_type: string | null
          id: string
          is_active: boolean
          name: string
          parent_group_id: string | null
          sort_order: number | null
          team_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          group_type?: string | null
          id?: string
          is_active?: boolean
          name: string
          parent_group_id?: string | null
          sort_order?: number | null
          team_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          group_type?: string | null
          id?: string
          is_active?: boolean
          name?: string
          parent_group_id?: string | null
          sort_order?: number | null
          team_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_groups_parent_same_team_fkey"
            columns: ["team_id", "parent_group_id"]
            isOneToOne: false
            referencedRelation: "team_groups"
            referencedColumns: ["team_id", "id"]
          },
          {
            foreignKeyName: "team_groups_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string | null
          expires_at: string | null
          id: string
          invited_by: string
          invited_user_id: string | null
          management_role: string
          member_type: string
          status: string
          team_id: string
          token_hash: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email?: string | null
          expires_at?: string | null
          id?: string
          invited_by: string
          invited_user_id?: string | null
          management_role?: string
          member_type: string
          status?: string
          team_id: string
          token_hash?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string | null
          expires_at?: string | null
          id?: string
          invited_by?: string
          invited_user_id?: string | null
          management_role?: string
          member_type?: string
          status?: string
          team_id?: string
          token_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_invitations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_memberships: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          invited_by: string | null
          joined_at: string | null
          management_role: string
          member_type: string
          role_title: string | null
          status: string
          team_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          management_role?: string
          member_type: string
          role_title?: string | null
          status: string
          team_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          management_role?: string
          member_type?: string
          role_title?: string | null
          status?: string
          team_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_memberships_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          archived_at: string | null
          city: string | null
          country: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          organization_id: string | null
          slug: string
          sport: string
          state_region: string | null
          updated_at: string
          verification_status: string
          verified_at: string | null
          visibility: string
        }
        Insert: {
          archived_at?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          organization_id?: string | null
          slug: string
          sport?: string
          state_region?: string | null
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          visibility?: string
        }
        Update: {
          archived_at?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string | null
          slug?: string
          sport?: string
          state_region?: string | null
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_requests: {
        Row: {
          evidence_file_path: string | null
          evidence_metadata: Json | null
          id: string
          organization_id: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string
          submitted_by: string
          team_id: string | null
          verification_method: string
        }
        Insert: {
          evidence_file_path?: string | null
          evidence_metadata?: Json | null
          id?: string
          organization_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          submitted_by: string
          team_id?: string | null
          verification_method: string
        }
        Update: {
          evidence_file_path?: string | null
          evidence_metadata?: Json | null
          id?: string
          organization_id?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string
          team_id?: string | null
          verification_method?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_requests_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_assignment_entries: {
        Row: {
          assignment_id: string
          attempts: number | null
          created_at: string
          distance_m: number | null
          event_code: string | null
          exercise_id: string | null
          exercise_name_snapshot: string
          id: string
          implement_weight_kg: number | null
          intensity_text: string | null
          label: string | null
          notes: string | null
          recovery_seconds: number | null
          reps: number | null
          sets: number | null
          sort_order: number
          target_mark_m: number | null
          target_time_text: string | null
          target_weight: number | null
        }
        Insert: {
          assignment_id: string
          attempts?: number | null
          created_at?: string
          distance_m?: number | null
          event_code?: string | null
          exercise_id?: string | null
          exercise_name_snapshot: string
          id?: string
          implement_weight_kg?: number | null
          intensity_text?: string | null
          label?: string | null
          notes?: string | null
          recovery_seconds?: number | null
          reps?: number | null
          sets?: number | null
          sort_order: number
          target_mark_m?: number | null
          target_time_text?: string | null
          target_weight?: number | null
        }
        Update: {
          assignment_id?: string
          attempts?: number | null
          created_at?: string
          distance_m?: number | null
          event_code?: string | null
          exercise_id?: string | null
          exercise_name_snapshot?: string
          id?: string
          implement_weight_kg?: number | null
          intensity_text?: string | null
          label?: string | null
          notes?: string | null
          recovery_seconds?: number | null
          reps?: number | null
          sets?: number | null
          sort_order?: number
          target_mark_m?: number | null
          target_time_text?: string | null
          target_weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_assignment_entries_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "athlete_assignment_inbox_v"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "workout_assignment_entries_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "coach_assignment_dashboard_v"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "workout_assignment_entries_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "workout_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_assignment_entries_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["exercise_id"]
          },
        ]
      }
      workout_assignment_recipients: {
        Row: {
          assigned_at: string
          assignment_id: string
          athlete_membership_id: string
          created_at: string
          first_viewed_at: string | null
          id: string
          team_id: string
        }
        Insert: {
          assigned_at?: string
          assignment_id: string
          athlete_membership_id: string
          created_at?: string
          first_viewed_at?: string | null
          id?: string
          team_id: string
        }
        Update: {
          assigned_at?: string
          assignment_id?: string
          athlete_membership_id?: string
          created_at?: string
          first_viewed_at?: string | null
          id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_assignment_recipients_assignment_same_team_fkey"
            columns: ["team_id", "assignment_id"]
            isOneToOne: false
            referencedRelation: "athlete_assignment_inbox_v"
            referencedColumns: ["team_id", "assignment_id"]
          },
          {
            foreignKeyName: "workout_assignment_recipients_assignment_same_team_fkey"
            columns: ["team_id", "assignment_id"]
            isOneToOne: false
            referencedRelation: "coach_assignment_dashboard_v"
            referencedColumns: ["team_id", "assignment_id"]
          },
          {
            foreignKeyName: "workout_assignment_recipients_assignment_same_team_fkey"
            columns: ["team_id", "assignment_id"]
            isOneToOne: false
            referencedRelation: "workout_assignments"
            referencedColumns: ["team_id", "id"]
          },
          {
            foreignKeyName: "workout_assignment_recipients_athlete_same_team_fkey"
            columns: ["team_id", "athlete_membership_id"]
            isOneToOne: false
            referencedRelation: "team_memberships"
            referencedColumns: ["team_id", "id"]
          },
        ]
      }
      workout_assignment_submissions: {
        Row: {
          assignment_recipient_id: string
          athlete_membership_id: string
          athlete_note: string | null
          coach_note: string | null
          completion_status: string
          id: string
          reviewed_at: string | null
          reviewed_by_membership_id: string | null
          submitted_at: string
          team_id: string
          unavailable_reason: string | null
          updated_at: string
          workout_id: string | null
        }
        Insert: {
          assignment_recipient_id: string
          athlete_membership_id: string
          athlete_note?: string | null
          coach_note?: string | null
          completion_status: string
          id?: string
          reviewed_at?: string | null
          reviewed_by_membership_id?: string | null
          submitted_at?: string
          team_id: string
          unavailable_reason?: string | null
          updated_at?: string
          workout_id?: string | null
        }
        Update: {
          assignment_recipient_id?: string
          athlete_membership_id?: string
          athlete_note?: string | null
          coach_note?: string | null
          completion_status?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by_membership_id?: string | null
          submitted_at?: string
          team_id?: string
          unavailable_reason?: string | null
          updated_at?: string
          workout_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_assignment_submissions_athlete_same_team_fkey"
            columns: ["team_id", "athlete_membership_id"]
            isOneToOne: false
            referencedRelation: "team_memberships"
            referencedColumns: ["team_id", "id"]
          },
          {
            foreignKeyName: "workout_assignment_submissions_recipient_same_team_fkey"
            columns: ["team_id", "assignment_recipient_id"]
            isOneToOne: false
            referencedRelation: "workout_assignment_recipients"
            referencedColumns: ["team_id", "id"]
          },
          {
            foreignKeyName: "workout_assignment_submissions_reviewer_same_team_fkey"
            columns: ["team_id", "reviewed_by_membership_id"]
            isOneToOne: false
            referencedRelation: "team_memberships"
            referencedColumns: ["team_id", "id"]
          },
          {
            foreignKeyName: "workout_assignment_submissions_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "team_workout_summary_v"
            referencedColumns: ["workout_id"]
          },
          {
            foreignKeyName: "workout_assignment_submissions_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workout_summary_v"
            referencedColumns: ["workout_id"]
          },
          {
            foreignKeyName: "workout_assignment_submissions_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_assignment_targets: {
        Row: {
          assignment_id: string
          athlete_membership_id: string | null
          created_at: string
          group_id: string | null
          id: string
          target_type: string
          team_id: string
        }
        Insert: {
          assignment_id: string
          athlete_membership_id?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          target_type: string
          team_id: string
        }
        Update: {
          assignment_id?: string
          athlete_membership_id?: string | null
          created_at?: string
          group_id?: string | null
          id?: string
          target_type?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_assignment_targets_assignment_same_team_fkey"
            columns: ["team_id", "assignment_id"]
            isOneToOne: false
            referencedRelation: "athlete_assignment_inbox_v"
            referencedColumns: ["team_id", "assignment_id"]
          },
          {
            foreignKeyName: "workout_assignment_targets_assignment_same_team_fkey"
            columns: ["team_id", "assignment_id"]
            isOneToOne: false
            referencedRelation: "coach_assignment_dashboard_v"
            referencedColumns: ["team_id", "assignment_id"]
          },
          {
            foreignKeyName: "workout_assignment_targets_assignment_same_team_fkey"
            columns: ["team_id", "assignment_id"]
            isOneToOne: false
            referencedRelation: "workout_assignments"
            referencedColumns: ["team_id", "id"]
          },
          {
            foreignKeyName: "workout_assignment_targets_athlete_same_team_fkey"
            columns: ["team_id", "athlete_membership_id"]
            isOneToOne: false
            referencedRelation: "team_memberships"
            referencedColumns: ["team_id", "id"]
          },
          {
            foreignKeyName: "workout_assignment_targets_group_same_team_fkey"
            columns: ["team_id", "group_id"]
            isOneToOne: false
            referencedRelation: "team_groups"
            referencedColumns: ["team_id", "id"]
          },
        ]
      }
      workout_assignments: {
        Row: {
          assigned_at: string
          assigned_by_membership_id: string
          cancelled_at: string | null
          closed_at: string | null
          created_at: string
          due_at: string | null
          id: string
          instructions: string | null
          scheduled_date: string
          status: string
          team_id: string
          template_id: string
          title_snapshot: string
          updated_at: string
          workout_type_snapshot: string
        }
        Insert: {
          assigned_at?: string
          assigned_by_membership_id: string
          cancelled_at?: string | null
          closed_at?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          instructions?: string | null
          scheduled_date: string
          status?: string
          team_id: string
          template_id: string
          title_snapshot: string
          updated_at?: string
          workout_type_snapshot: string
        }
        Update: {
          assigned_at?: string
          assigned_by_membership_id?: string
          cancelled_at?: string | null
          closed_at?: string | null
          created_at?: string
          due_at?: string | null
          id?: string
          instructions?: string | null
          scheduled_date?: string
          status?: string
          team_id?: string
          template_id?: string
          title_snapshot?: string
          updated_at?: string
          workout_type_snapshot?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_assignments_assigner_same_team_fkey"
            columns: ["team_id", "assigned_by_membership_id"]
            isOneToOne: false
            referencedRelation: "team_memberships"
            referencedColumns: ["team_id", "id"]
          },
          {
            foreignKeyName: "workout_assignments_template_same_team_fkey"
            columns: ["team_id", "template_id"]
            isOneToOne: false
            referencedRelation: "workout_templates"
            referencedColumns: ["team_id", "id"]
          },
        ]
      }
      workout_entries: {
        Row: {
          created_at: string
          distance_m: number | null
          event_code: string | null
          exercise: string | null
          exercise_id: string | null
          id: string
          implement_weight_kg: number | null
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
          event_code?: string | null
          exercise?: string | null
          exercise_id?: string | null
          id?: string
          implement_weight_kg?: number | null
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
          event_code?: string | null
          exercise?: string | null
          exercise_id?: string | null
          id?: string
          implement_weight_kg?: number | null
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
            referencedRelation: "team_workout_summary_v"
            referencedColumns: ["workout_id"]
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
      workout_template_entries: {
        Row: {
          attempts: number | null
          created_at: string
          distance_m: number | null
          event_code: string | null
          exercise_id: string | null
          exercise_name_snapshot: string
          id: string
          implement_weight_kg: number | null
          intensity_text: string | null
          label: string | null
          notes: string | null
          recovery_seconds: number | null
          reps: number | null
          sets: number | null
          sort_order: number
          target_mark_m: number | null
          target_time_text: string | null
          target_weight: number | null
          template_id: string
          updated_at: string
        }
        Insert: {
          attempts?: number | null
          created_at?: string
          distance_m?: number | null
          event_code?: string | null
          exercise_id?: string | null
          exercise_name_snapshot: string
          id?: string
          implement_weight_kg?: number | null
          intensity_text?: string | null
          label?: string | null
          notes?: string | null
          recovery_seconds?: number | null
          reps?: number | null
          sets?: number | null
          sort_order: number
          target_mark_m?: number | null
          target_time_text?: string | null
          target_weight?: number | null
          template_id: string
          updated_at?: string
        }
        Update: {
          attempts?: number | null
          created_at?: string
          distance_m?: number | null
          event_code?: string | null
          exercise_id?: string | null
          exercise_name_snapshot?: string
          id?: string
          implement_weight_kg?: number | null
          intensity_text?: string | null
          label?: string | null
          notes?: string | null
          recovery_seconds?: number | null
          reps?: number | null
          sets?: number | null
          sort_order?: number
          target_mark_m?: number | null
          target_time_text?: string | null
          target_weight?: number | null
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_template_entries_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["exercise_id"]
          },
          {
            foreignKeyName: "workout_template_entries_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workout_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_templates: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by_membership_id: string
          description: string | null
          id: string
          is_active: boolean
          team_id: string
          title: string
          updated_at: string
          workout_type: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by_membership_id: string
          description?: string | null
          id?: string
          is_active?: boolean
          team_id: string
          title: string
          updated_at?: string
          workout_type: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by_membership_id?: string
          description?: string | null
          id?: string
          is_active?: boolean
          team_id?: string
          title?: string
          updated_at?: string
          workout_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_templates_creator_same_team_fkey"
            columns: ["team_id", "created_by_membership_id"]
            isOneToOne: false
            referencedRelation: "team_memberships"
            referencedColumns: ["team_id", "id"]
          },
          {
            foreignKeyName: "workout_templates_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      workouts: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          team_id: string | null
          title: string
          user_id: string
          workout_date: string
          workout_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          team_id?: string | null
          title: string
          user_id?: string
          workout_date: string
          workout_type?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          team_id?: string | null
          title?: string
          user_id?: string
          workout_date?: string
          workout_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "workouts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
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
      athlete_assignment_inbox_v: {
        Row: {
          assigned_at: string | null
          assignment_id: string | null
          assignment_recipient_id: string | null
          assignment_status: string | null
          assignment_updated_at: string | null
          athlete_membership_id: string | null
          athlete_note: string | null
          coach_note: string | null
          completion_status: string | null
          due_at: string | null
          instructions: string | null
          reviewed_at: string | null
          scheduled_date: string | null
          submission_id: string | null
          submission_updated_at: string | null
          submitted_at: string | null
          team_id: string | null
          team_name: string | null
          title_snapshot: string | null
          unavailable_reason: string | null
          workout_id: string | null
          workout_type_snapshot: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_assignment_submissions_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "team_workout_summary_v"
            referencedColumns: ["workout_id"]
          },
          {
            foreignKeyName: "workout_assignment_submissions_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workout_summary_v"
            referencedColumns: ["workout_id"]
          },
          {
            foreignKeyName: "workout_assignment_submissions_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_assignment_dashboard_v: {
        Row: {
          assigned_at: string | null
          assignment_id: string | null
          assignment_recipient_id: string | null
          assignment_status: string | null
          assignment_updated_at: string | null
          athlete_full_name: string | null
          athlete_membership_id: string | null
          athlete_note: string | null
          athlete_user_id: string | null
          athlete_username: string | null
          coach_note: string | null
          completion_status: string | null
          due_at: string | null
          instructions: string | null
          reviewed_at: string | null
          reviewed_by_membership_id: string | null
          scheduled_date: string | null
          submission_id: string | null
          submission_updated_at: string | null
          submitted_at: string | null
          team_id: string | null
          team_name: string | null
          title_snapshot: string | null
          unavailable_reason: string | null
          workout_id: string | null
          workout_type_snapshot: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workout_assignment_submissions_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "team_workout_summary_v"
            referencedColumns: ["workout_id"]
          },
          {
            foreignKeyName: "workout_assignment_submissions_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workout_summary_v"
            referencedColumns: ["workout_id"]
          },
          {
            foreignKeyName: "workout_assignment_submissions_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      field_event_bests_v: {
        Row: {
          best_mark_m: number | null
          event_code: string | null
          implement_weight_kg: number | null
          user_id: string | null
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
      team_workout_summary_v: {
        Row: {
          distance_m_total: number | null
          team_id: string | null
          total_sets: number | null
          user_id: string | null
          workout_date: string | null
          workout_id: string | null
          workout_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workouts_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workouts_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
      accept_team_invitation: {
        Args: { p_invitation_id: string }
        Returns: string
      }
      assign_coach_to_athlete: {
        Args: {
          p_athlete_membership_id: string
          p_coach_membership_id: string
          p_is_primary?: boolean
          p_team_id: string
        }
        Returns: string
      }
      attach_workout_to_assignment: {
        Args: {
          p_assignment_recipient_id: string
          p_athlete_note?: string
          p_completion_status: string
          p_workout_id: string
        }
        Returns: string
      }
      cancel_workout_assignment: {
        Args: { p_assignment_id: string }
        Returns: string
      }
      close_workout_assignment: {
        Args: { p_assignment_id: string }
        Returns: string
      }
      create_organization: {
        Args: {
          p_city?: string
          p_country?: string
          p_name: string
          p_organization_type: string
          p_slug: string
          p_state_region?: string
          p_website?: string
        }
        Returns: string
      }
      create_team: {
        Args: {
          p_city?: string
          p_country?: string
          p_description?: string
          p_member_type: string
          p_name: string
          p_organization_id?: string
          p_slug: string
          p_state_region?: string
          p_visibility?: string
        }
        Returns: string
      }
      create_workout_assignment: {
        Args: {
          p_athlete_membership_ids?: string[]
          p_due_at?: string
          p_group_ids?: string[]
          p_instructions?: string
          p_scheduled_date: string
          p_target_team?: boolean
          p_team_id: string
          p_template_id: string
        }
        Returns: string
      }
      end_coach_athlete_assignment: {
        Args: { p_assignment_id: string }
        Returns: string
      }
      is_username_available: { Args: { candidate: string }; Returns: boolean }
      parse_time_to_seconds: { Args: { t: string }; Returns: number }
      recompute_exercise_pr: {
        Args: { p_exercise_id: string; p_user_id: string }
        Returns: undefined
      }
      request_organization_affiliation: {
        Args: { p_organization_id: string; p_team_id: string }
        Returns: string
      }
      request_verification: {
        Args: {
          p_evidence_file_path?: string
          p_evidence_metadata?: Json
          p_organization_id?: string
          p_team_id?: string
          p_verification_method: string
        }
        Returns: string
      }
      resolve_entity_claim: {
        Args: { p_approve: boolean; p_claim_id: string; p_resolved_by: string }
        Returns: string
      }
      resolve_organization_affiliation: {
        Args: { p_approve: boolean; p_request_id: string }
        Returns: string
      }
      resolve_verification_request: {
        Args: {
          p_approve: boolean
          p_request_id: string
          p_review_notes?: string
          p_reviewed_by: string
        }
        Returns: string
      }
      review_workout_assignment_submission: {
        Args: { p_coach_note?: string; p_submission_id: string }
        Returns: string
      }
      submit_entity_claim: {
        Args: {
          p_organization_id?: string
          p_requested_role: string
          p_team_id?: string
          p_verification_request_id?: string
        }
        Returns: string
      }
      submit_workout_assignment: {
        Args: {
          p_assignment_recipient_id: string
          p_athlete_note?: string
          p_completion_status: string
          p_unavailable_reason?: string
          p_workout_id?: string
        }
        Returns: string
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

