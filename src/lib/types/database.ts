// Auto-generated from Supabase project wphmeryxmfdxovvnichm.
// To regenerate after schema changes, use the Supabase MCP tool
// generate_typescript_types (or `supabase gen types typescript`) and replace this
// file WHOLESALE — do not hand-edit, it breaks the typed client (tables infer to `never`).

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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      assignments: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_required: boolean
          lesson_id: string
          rubric_json: Json | null
          title: string
          type: Database["public"]["Enums"]["assignment_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_required?: boolean
          lesson_id: string
          rubric_json?: Json | null
          title: string
          type: Database["public"]["Enums"]["assignment_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_required?: boolean
          lesson_id?: string
          rubric_json?: Json | null
          title?: string
          type?: Database["public"]["Enums"]["assignment_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      benchmarks: {
        Row: {
          category: string
          created_at: string
          higher_is_better: boolean
          id: string
          name: string
          position: number
          slug: string
          unit: string
        }
        Insert: {
          category: string
          created_at?: string
          higher_is_better?: boolean
          id?: string
          name: string
          position?: number
          slug: string
          unit: string
        }
        Update: {
          category?: string
          created_at?: string
          higher_is_better?: boolean
          id?: string
          name?: string
          position?: number
          slug?: string
          unit?: string
        }
        Relationships: []
      }
      certificates: {
        Row: {
          certificate_number: string
          course_id: string
          id: string
          issued_at: string
          pdf_url: string | null
          user_id: string
        }
        Insert: {
          certificate_number: string
          course_id: string
          id?: string
          issued_at?: string
          pdf_url?: string | null
          user_id: string
        }
        Update: {
          certificate_number?: string
          course_id?: string
          id?: string
          issued_at?: string
          pdf_url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificates_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_id: string
          body_markdown: string
          created_at: string
          id: string
          post_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body_markdown: string
          created_at?: string
          id?: string
          post_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body_markdown?: string
          created_at?: string
          id?: string
          post_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          cover_image_url: string | null
          created_at: string
          currency: string
          description: string | null
          estimated_hours: number | null
          hero_video_url: string | null
          id: string
          is_published: boolean
          price_cents: number
          slug: string
          subtitle: string | null
          title: string
          track: Database["public"]["Enums"]["course_track"]
          updated_at: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          estimated_hours?: number | null
          hero_video_url?: string | null
          id?: string
          is_published?: boolean
          price_cents?: number
          slug: string
          subtitle?: string | null
          title: string
          track: Database["public"]["Enums"]["course_track"]
          updated_at?: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          estimated_hours?: number | null
          hero_video_url?: string | null
          id?: string
          is_published?: boolean
          price_cents?: number
          slug?: string
          subtitle?: string | null
          title?: string
          track?: Database["public"]["Enums"]["course_track"]
          updated_at?: string
        }
        Relationships: []
      }
      email_signups: {
        Row: {
          created_at: string
          email: string
          id: string
          interest: string | null
          metadata: Json | null
          source: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          interest?: string | null
          metadata?: Json | null
          source?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          interest?: string | null
          metadata?: Json | null
          source?: string | null
        }
        Relationships: []
      }
      enrollments: {
        Row: {
          amount_paid_cents: number | null
          completed_at: string | null
          course_id: string
          currency: string | null
          enrolled_at: string
          id: string
          source: string | null
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          user_id: string
        }
        Insert: {
          amount_paid_cents?: number | null
          completed_at?: string | null
          course_id: string
          currency?: string | null
          enrolled_at?: string
          id?: string
          source?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          user_id: string
        }
        Update: {
          amount_paid_cents?: number | null
          completed_at?: string | null
          course_id?: string
          currency?: string | null
          enrolled_at?: string
          id?: string
          source?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          category: string | null
          created_at: string
          cues: string | null
          default_unit: Database["public"]["Enums"]["measurement_unit"]
          description: string | null
          equipment: string[] | null
          id: string
          name_en: string | null
          name_is: string
          pattern: Database["public"]["Enums"]["movement_pattern"]
          thumbnail_url: string | null
          updated_at: string
          video_url: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          cues?: string | null
          default_unit?: Database["public"]["Enums"]["measurement_unit"]
          description?: string | null
          equipment?: string[] | null
          id?: string
          name_en?: string | null
          name_is: string
          pattern: Database["public"]["Enums"]["movement_pattern"]
          thumbnail_url?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          cues?: string | null
          default_unit?: Database["public"]["Enums"]["measurement_unit"]
          description?: string | null
          equipment?: string[] | null
          id?: string
          name_en?: string | null
          name_is?: string
          pattern?: Database["public"]["Enums"]["movement_pattern"]
          thumbnail_url?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Relationships: []
      }
      lesson_progress: {
        Row: {
          completed_at: string | null
          last_watched_at: string
          lesson_id: string
          user_id: string
          watched_seconds: number
        }
        Insert: {
          completed_at?: string | null
          last_watched_at?: string
          lesson_id: string
          user_id: string
          watched_seconds?: number
        }
        Update: {
          completed_at?: string | null
          last_watched_at?: string
          lesson_id?: string
          user_id?: string
          watched_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          body_markdown: string | null
          created_at: string
          id: string
          image_urls: string[]
          is_free_preview: boolean
          module_id: string
          position: number
          title: string
          updated_at: string
          video_duration_seconds: number | null
          video_url: string | null
        }
        Insert: {
          body_markdown?: string | null
          created_at?: string
          id?: string
          image_urls?: string[]
          is_free_preview?: boolean
          module_id: string
          position: number
          title: string
          updated_at?: string
          video_duration_seconds?: number | null
          video_url?: string | null
        }
        Update: {
          body_markdown?: string | null
          created_at?: string
          id?: string
          image_urls?: string[]
          is_free_preview?: boolean
          module_id?: string
          position?: number
          title?: string
          updated_at?: string
          video_duration_seconds?: number | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "modules"
            referencedColumns: ["id"]
          },
        ]
      }
      modules: {
        Row: {
          course_id: string
          created_at: string
          description: string | null
          id: string
          position: number
          title: string
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          description?: string | null
          id?: string
          position: number
          title: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          description?: string | null
          id?: string
          position?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "modules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_bests: {
        Row: {
          achieved_on: string
          benchmark_id: string
          created_at: string
          id: string
          notes: string | null
          unit: string
          updated_at: string
          user_id: string
          value: number
        }
        Insert: {
          achieved_on?: string
          benchmark_id: string
          created_at?: string
          id?: string
          notes?: string | null
          unit: string
          updated_at?: string
          user_id: string
          value: number
        }
        Update: {
          achieved_on?: string
          benchmark_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          unit?: string
          updated_at?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "personal_bests_benchmark_id_fkey"
            columns: ["benchmark_id"]
            isOneToOne: false
            referencedRelation: "benchmarks"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          author_id: string
          body_markdown: string
          course_id: string | null
          created_at: string
          id: string
          is_pinned: boolean
          title: string | null
          updated_at: string
        }
        Insert: {
          author_id: string
          body_markdown: string
          course_id?: string | null
          created_at?: string
          id?: string
          is_pinned?: boolean
          title?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          body_markdown?: string
          course_id?: string | null
          created_at?: string
          id?: string
          is_pinned?: boolean
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          station_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          station_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          station_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          category: Database["public"]["Enums"]["program_category"]
          cloned_from_id: string | null
          created_at: string
          id: string
          is_public: boolean
          is_template: boolean
          level: Database["public"]["Enums"]["mb_level"]
          notes: string | null
          owner_id: string
          title: string
          updated_at: string
          weeks_json: Json
        }
        Insert: {
          category: Database["public"]["Enums"]["program_category"]
          cloned_from_id?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          is_template?: boolean
          level: Database["public"]["Enums"]["mb_level"]
          notes?: string | null
          owner_id: string
          title: string
          updated_at?: string
          weeks_json?: Json
        }
        Update: {
          category?: Database["public"]["Enums"]["program_category"]
          cloned_from_id?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          is_template?: boolean
          level?: Database["public"]["Enums"]["mb_level"]
          notes?: string | null
          owner_id?: string
          title?: string
          updated_at?: string
          weeks_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "programs_cloned_from_id_fkey"
            columns: ["cloned_from_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      station_classes: {
        Row: {
          created_at: string
          id: string
          level: string | null
          note: string | null
          start_time: string
          station_id: string
          weekday: number
        }
        Insert: {
          created_at?: string
          id?: string
          level?: string | null
          note?: string | null
          start_time: string
          station_id: string
          weekday: number
        }
        Update: {
          created_at?: string
          id?: string
          level?: string | null
          note?: string | null
          start_time?: string
          station_id?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "station_classes_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      stations: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          id: string
          intro: string | null
          maps_url: string | null
          name: string
          slug: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          id?: string
          intro?: string | null
          maps_url?: string | null
          name: string
          slug: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          id?: string
          intro?: string | null
          maps_url?: string | null
          name?: string
          slug?: string
        }
        Relationships: []
      }
      structures: {
        Row: {
          category: Database["public"]["Enums"]["program_category"]
          created_at: string
          group_key: string | null
          id: string
          levels: Json
          name: string
          preview: string
          source_id: string
        }
        Insert: {
          category: Database["public"]["Enums"]["program_category"]
          created_at?: string
          group_key?: string | null
          id?: string
          levels?: Json
          name: string
          preview: string
          source_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["program_category"]
          created_at?: string
          group_key?: string | null
          id?: string
          levels?: Json
          name?: string
          preview?: string
          source_id?: string
        }
        Relationships: []
      }
      submissions: {
        Row: {
          assignment_id: string
          attachments_json: Json | null
          created_at: string
          feedback: string | null
          id: string
          program_id: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          status: Database["public"]["Enums"]["submission_status"]
          submitted_at: string
          text_response: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          assignment_id: string
          attachments_json?: Json | null
          created_at?: string
          feedback?: string | null
          id?: string
          program_id?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["submission_status"]
          submitted_at?: string
          text_response?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          assignment_id?: string
          attachments_json?: Json | null
          created_at?: string
          feedback?: string | null
          id?: string
          program_id?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["submission_status"]
          submitted_at?: string
          text_response?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_plans: {
        Row: {
          created_at: string
          generated_pdf_url: string | null
          id: string
          level: Database["public"]["Enums"]["mb_level"]
          optisigns_pushed_at: string | null
          owner_id: string
          programs_json: Json
          station_id: string | null
          title: string | null
          updated_at: string
          week_starting: string
        }
        Insert: {
          created_at?: string
          generated_pdf_url?: string | null
          id?: string
          level: Database["public"]["Enums"]["mb_level"]
          optisigns_pushed_at?: string | null
          owner_id: string
          programs_json?: Json
          station_id?: string | null
          title?: string | null
          updated_at?: string
          week_starting: string
        }
        Update: {
          created_at?: string
          generated_pdf_url?: string | null
          id?: string
          level?: Database["public"]["Enums"]["mb_level"]
          optisigns_pushed_at?: string | null
          owner_id?: string
          programs_json?: Json
          station_id?: string | null
          title?: string | null
          updated_at?: string
          week_starting?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_plans_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_logs: {
        Row: {
          calories: number | null
          created_at: string
          id: string
          logged_on: string
          machine: string | null
          notes: string | null
          rpe: number | null
          scheduled_category: string | null
          scheduled_day: string | null
          structure_source_id: string | null
          updated_at: string
          user_id: string
          weights: string | null
        }
        Insert: {
          calories?: number | null
          created_at?: string
          id?: string
          logged_on?: string
          machine?: string | null
          notes?: string | null
          rpe?: number | null
          scheduled_category?: string | null
          scheduled_day?: string | null
          structure_source_id?: string | null
          updated_at?: string
          user_id: string
          weights?: string | null
        }
        Update: {
          calories?: number | null
          created_at?: string
          id?: string
          logged_on?: string
          machine?: string | null
          notes?: string | null
          rpe?: number | null
          scheduled_category?: string | null
          scheduled_day?: string | null
          structure_source_id?: string | null
          updated_at?: string
          user_id?: string
          weights?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      delete_member: { Args: { member: string }; Returns: undefined }
      is_active_member: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_coach_or_admin: { Args: never; Returns: boolean }
      is_enrolled_in: { Args: { target_course_id: string }; Returns: boolean }
      kcal_leaderboard: {
        Args: { p_station?: string | null; p_machine?: string | null }
        Returns: {
          user_id: string
          full_name: string | null
          station_id: string | null
          station_name: string | null
          total_kcal: number
          entries: number
        }[]
      }
      my_station_id: { Args: never; Returns: string }
      scheduled_structure_for: {
        Args: { d: string }
        Returns: {
          category: string
          scheduled_day: string
          source_id: string
        }[]
      }
      set_member_status: {
        Args: { member: string; new_status: string }
        Returns: undefined
      }
      shares_my_station: { Args: { target: string }; Returns: boolean }
    }
    Enums: {
      assignment_type: "program_submission" | "text" | "quiz"
      course_track: "metabolic_coach" | "foundations"
      mb_level: "MB1" | "MB2" | "MB3"
      measurement_unit: "reps" | "seconds" | "meters" | "calories"
      movement_pattern:
        | "squat"
        | "hinge"
        | "push"
        | "pull"
        | "carry"
        | "core"
        | "locomotion"
        | "other"
      program_category:
        | "strength"
        | "power"
        | "power_strength"
        | "burn"
        | "endurance"
      submission_status: "submitted" | "approved" | "needs_revision"
      user_role: "student" | "coach" | "admin"
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
    Enums: {
      assignment_type: ["program_submission", "text", "quiz"],
      course_track: ["metabolic_coach", "foundations"],
      mb_level: ["MB1", "MB2", "MB3"],
      measurement_unit: ["reps", "seconds", "meters", "calories"],
      movement_pattern: [
        "squat",
        "hinge",
        "push",
        "pull",
        "carry",
        "core",
        "locomotion",
        "other",
      ],
      program_category: [
        "strength",
        "power",
        "power_strength",
        "burn",
        "endurance",
      ],
      submission_status: ["submitted", "approved", "needs_revision"],
      user_role: ["student", "coach", "admin"],
    },
  },
} as const
