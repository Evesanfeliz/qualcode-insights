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
      activity_log: {
        Row: {
          action_type: string
          created_at: string | null
          description: string
          id: string
          metadata: Json | null
          project_id: string
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string | null
          description: string
          id?: string
          metadata?: Json | null
          project_id: string
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string | null
          description?: string
          id?: string
          metadata?: Json | null
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      code_applications: {
        Row: {
          applied_by: string
          code_id: string
          created_at: string | null
          end_index: number
          id: string
          note: string | null
          segment_text: string
          start_index: number
          transcript_id: string
        }
        Insert: {
          applied_by: string
          code_id: string
          created_at?: string | null
          end_index: number
          id?: string
          note?: string | null
          segment_text: string
          start_index: number
          transcript_id: string
        }
        Update: {
          applied_by?: string
          code_id?: string
          created_at?: string | null
          end_index?: number
          id?: string
          note?: string | null
          segment_text?: string
          start_index?: number
          transcript_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "code_applications_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "code_applications_transcript_id_fkey"
            columns: ["transcript_id"]
            isOneToOne: false
            referencedRelation: "transcripts"
            referencedColumns: ["id"]
          },
        ]
      }
      codes: {
        Row: {
          ai_suggested: boolean | null
          color: string | null
          created_at: string | null
          created_by: string | null
          cycle: string | null
          definition: string | null
          example_quote: string | null
          exclusion_criteria: string | null
          id: string
          inclusion_criteria: string | null
          label: string
          parent_code_id: string | null
          project_id: string
          researcher_confirmed: boolean | null
        }
        Insert: {
          ai_suggested?: boolean | null
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          cycle?: string | null
          definition?: string | null
          example_quote?: string | null
          exclusion_criteria?: string | null
          id?: string
          inclusion_criteria?: string | null
          label: string
          parent_code_id?: string | null
          project_id: string
          researcher_confirmed?: boolean | null
        }
        Update: {
          ai_suggested?: boolean | null
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          cycle?: string | null
          definition?: string | null
          example_quote?: string | null
          exclusion_criteria?: string | null
          id?: string
          inclusion_criteria?: string | null
          label?: string
          parent_code_id?: string | null
          project_id?: string
          researcher_confirmed?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "codes_parent_code_id_fkey"
            columns: ["parent_code_id"]
            isOneToOne: false
            referencedRelation: "codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "codes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      memo_replies: {
        Row: {
          author_id: string
          author_type: string | null
          content: string
          created_at: string | null
          id: string
          memo_id: string
        }
        Insert: {
          author_id: string
          author_type?: string | null
          content: string
          created_at?: string | null
          id?: string
          memo_id: string
        }
        Update: {
          author_id?: string
          author_type?: string | null
          content?: string
          created_at?: string | null
          id?: string
          memo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memo_replies_memo_id_fkey"
            columns: ["memo_id"]
            isOneToOne: false
            referencedRelation: "memos"
            referencedColumns: ["id"]
          },
        ]
      }
      memos: {
        Row: {
          author_id: string
          content: Json | null
          created_at: string | null
          depth_score: string | null
          id: string
          linked_code_id: string | null
          linked_transcript_id: string | null
          memo_type: string | null
          project_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          author_id: string
          content?: Json | null
          created_at?: string | null
          depth_score?: string | null
          id?: string
          linked_code_id?: string | null
          linked_transcript_id?: string | null
          memo_type?: string | null
          project_id: string
          title: string
          updated_at?: string | null
        }
        Update: {
          author_id?: string
          content?: Json | null
          created_at?: string | null
          depth_score?: string | null
          id?: string
          linked_code_id?: string | null
          linked_transcript_id?: string | null
          memo_type?: string | null
          project_id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memos_linked_code_id_fkey"
            columns: ["linked_code_id"]
            isOneToOne: false
            referencedRelation: "codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memos_linked_transcript_id_fkey"
            columns: ["linked_transcript_id"]
            isOneToOne: false
            referencedRelation: "transcripts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          color_theme: string | null
          id: string
          joined_at: string | null
          project_id: string
          role: string | null
          user_id: string
        }
        Insert: {
          color_theme?: string | null
          id?: string
          joined_at?: string | null
          project_id: string
          role?: string | null
          user_id: string
        }
        Update: {
          color_theme?: string | null
          id?: string
          joined_at?: string | null
          project_id?: string
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          approach: string | null
          created_at: string | null
          domain_framework: string | null
          id: string
          reasoning_mode: string | null
          research_question: string | null
          status: string | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          approach?: string | null
          created_at?: string | null
          domain_framework?: string | null
          id?: string
          reasoning_mode?: string | null
          research_question?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          approach?: string | null
          created_at?: string | null
          domain_framework?: string | null
          id?: string
          reasoning_mode?: string | null
          research_question?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      transcripts: {
        Row: {
          assigned_to: string | null
          content: string
          created_at: string | null
          file_url: string | null
          id: string
          interview_date: string | null
          participant_pseudonym: string
          project_id: string
          status: string | null
          word_count: number | null
        }
        Insert: {
          assigned_to?: string | null
          content?: string
          created_at?: string | null
          file_url?: string | null
          id?: string
          interview_date?: string | null
          participant_pseudonym: string
          project_id: string
          status?: string | null
          word_count?: number | null
        }
        Update: {
          assigned_to?: string | null
          content?: string
          created_at?: string | null
          file_url?: string | null
          id?: string
          interview_date?: string | null
          participant_pseudonym?: string
          project_id?: string
          status?: string | null
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transcripts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_project_member: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      is_project_owner: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      user_accessible_project_ids: {
        Args: never
        Returns: {
          project_id: string
        }[]
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
