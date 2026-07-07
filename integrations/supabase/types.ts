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
      audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: string
          meta: Json
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          meta?: Json
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          meta?: Json
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      file_statuses: {
        Row: {
          closed_at: string | null
          created_at: string
          file_name: string
          id: string
          note: string
          reopened_at: string | null
          status: Database["public"]["Enums"]["file_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          file_name: string
          id?: string
          note?: string
          reopened_at?: string | null
          status?: Database["public"]["Enums"]["file_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          file_name?: string
          id?: string
          note?: string
          reopened_at?: string | null
          status?: Database["public"]["Enums"]["file_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      form_files: {
        Row: {
          archived_at: string | null
          created_at: string
          display_name: string | null
          file_name: string
          id: string
          last_opened_at: string
          schema_json: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          display_name?: string | null
          file_name: string
          id?: string
          last_opened_at?: string
          schema_json: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          display_name?: string | null
          file_name?: string
          id?: string
          last_opened_at?: string
          schema_json?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      form_files_done: {
        Row: {
          created_at: string
          done_map: Json
          file_name: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          done_map?: Json
          file_name: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          done_map?: Json
          file_name?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      form_files_review: {
        Row: {
          created_at: string
          file_name: string
          id: string
          review_map: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          review_map?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          review_map?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      gocanvas_accounts: {
        Row: {
          auth_type: string
          base_url: string
          client_id: string | null
          client_secret: string | null
          created_at: string
          id: string
          is_default: boolean
          label: string
          password: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          auth_type: string
          base_url?: string
          client_id?: string | null
          client_secret?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          label: string
          password?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          auth_type?: string
          base_url?: string
          client_id?: string | null
          client_secret?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          password?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      org_settings: {
        Row: {
          allow_public_links: boolean
          allow_team_creation_by_non_admins: boolean
          allowed_views: string[]
          default_team_id: string | null
          default_view: string
          id: number
          light_theme: string
          ui_font: string
          updated_at: string
          zebra_rows: boolean
        }
        Insert: {
          allow_public_links?: boolean
          allow_team_creation_by_non_admins?: boolean
          allowed_views?: string[]
          default_team_id?: string | null
          default_view?: string
          id?: number
          light_theme?: string
          ui_font?: string
          updated_at?: string
          zebra_rows?: boolean
        }
        Update: {
          allow_public_links?: boolean
          allow_team_creation_by_non_admins?: boolean
          allowed_views?: string[]
          default_team_id?: string | null
          default_view?: string
          id?: number
          light_theme?: string
          ui_font?: string
          updated_at?: string
          zebra_rows?: boolean
        }
        Relationships: []
      }
      pending_invites: {
        Row: {
          created_at: string
          email: string
          id: string
          invited_by: string | null
          team_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          team_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_invites_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          preferred_view: string | null
          status: Database["public"]["Enums"]["account_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          preferred_view?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          preferred_view?: string | null
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      review_share_responses: {
        Row: {
          comment: string
          created_at: string
          entry_key: string
          id: string
          resolved: boolean
          responder_label: string
          responder_session_id: string | null
          responder_user_id: string | null
          revision: number
          share_id: string
          updated_at: string
        }
        Insert: {
          comment?: string
          created_at?: string
          entry_key: string
          id?: string
          resolved?: boolean
          responder_label: string
          responder_session_id?: string | null
          responder_user_id?: string | null
          revision: number
          share_id: string
          updated_at?: string
        }
        Update: {
          comment?: string
          created_at?: string
          entry_key?: string
          id?: string
          resolved?: boolean
          responder_label?: string
          responder_session_id?: string | null
          responder_user_id?: string | null
          revision?: number
          share_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_share_responses_share_id_fkey"
            columns: ["share_id"]
            isOneToOne: false
            referencedRelation: "review_shares"
            referencedColumns: ["id"]
          },
        ]
      }
      review_shares: {
        Row: {
          author_user_id: string
          created_at: string
          expires_at: string | null
          file_name: string
          form_schema: Json
          id: string
          permission: string
          public_link_enabled: boolean
          recipient_email: string | null
          recipient_user_id: string | null
          revisions: number[]
          revoked_at: string | null
          token: string
          updated_at: string
        }
        Insert: {
          author_user_id: string
          created_at?: string
          expires_at?: string | null
          file_name: string
          form_schema: Json
          id?: string
          permission?: string
          public_link_enabled?: boolean
          recipient_email?: string | null
          recipient_user_id?: string | null
          revisions?: number[]
          revoked_at?: string | null
          token?: string
          updated_at?: string
        }
        Update: {
          author_user_id?: string
          created_at?: string
          expires_at?: string | null
          file_name?: string
          form_schema?: Json
          id?: string
          permission?: string
          public_link_enabled?: boolean
          recipient_email?: string | null
          recipient_user_id?: string | null
          revisions?: number[]
          revoked_at?: string | null
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["team_member_role"]
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["team_member_role"]
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["team_member_role"]
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _restore_allowed_tables: { Args: never; Returns: string[] }
      admin_bulk_invite: {
        Args: { p_emails: string[]; p_team_id?: string }
        Returns: Json
      }
      admin_dashboard_stats: { Args: never; Returns: Json }
      admin_impersonation_snapshot: {
        Args: { p_user_id: string }
        Returns: Json
      }
      admin_list_file_statuses: {
        Args: {
          p_search?: string
          p_status?: Database["public"]["Enums"]["file_status"]
        }
        Returns: {
          closed_at: string
          created_at: string
          file_name: string
          id: string
          note: string
          owner_email: string
          owner_name: string
          reopened_at: string
          status: Database["public"]["Enums"]["file_status"]
          updated_at: string
          user_id: string
        }[]
      }
      admin_list_pending_invites: {
        Args: never
        Returns: {
          created_at: string
          email: string
          id: string
          invited_by: string
          invited_by_email: string
          team_id: string
          team_name: string
        }[]
      }
      admin_list_shares: {
        Args: { p_search?: string }
        Returns: {
          author_email: string
          author_name: string
          author_user_id: string
          created_at: string
          expires_at: string
          file_name: string
          id: string
          public_link_enabled: boolean
          recipient_email: string
          recipient_name: string
          recipient_user_id: string
          response_count: number
          revisions: number[]
          revoked_at: string
          token: string
          updated_at: string
        }[]
      }
      admin_restore_insert: {
        Args: { p_rows: Json; p_table: string }
        Returns: number
      }
      admin_restore_truncate: {
        Args: { p_tables: string[] }
        Returns: undefined
      }
      admin_revoke_share: { Args: { p_share_id: string }; Returns: undefined }
      find_profile_by_email: {
        Args: { p_email: string }
        Returns: {
          display_name: string
          email: string
          user_id: string
        }[]
      }
      get_review_share_by_token: { Args: { p_token: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_team_member: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      is_team_owner: {
        Args: { _team_id: string; _user_id: string }
        Returns: boolean
      }
      list_all_profiles: {
        Args: never
        Returns: {
          created_at: string
          display_name: string
          email: string
          roles: Database["public"]["Enums"]["app_role"][]
          status: Database["public"]["Enums"]["account_status"]
          user_id: string
        }[]
      }
      list_shares_received: {
        Args: never
        Returns: {
          author_display_name: string
          author_email: string
          created_at: string
          expires_at: string
          file_name: string
          id: string
          revisions: number[]
          token: string
          updated_at: string
        }[]
      }
      list_team_recipients: {
        Args: { p_team_id: string }
        Returns: {
          display_name: string
          email: string
          role: Database["public"]["Enums"]["team_member_role"]
          user_id: string
        }[]
      }
      log_audit: {
        Args: {
          p_action: string
          p_meta?: Json
          p_target_id: string
          p_target_type: string
        }
        Returns: string
      }
      set_file_status: {
        Args: {
          p_file_name: string
          p_note?: string
          p_status: Database["public"]["Enums"]["file_status"]
        }
        Returns: string
      }
      share_add_revision: { Args: { p_token: string }; Returns: number }
      share_apply_done: {
        Args: { p_identifier: string; p_token: string; p_value: boolean }
        Returns: undefined
      }
      share_apply_review: {
        Args: {
          p_entry: Json
          p_entry_key: string
          p_revision: number
          p_token: string
        }
        Returns: undefined
      }
      share_set_project_note: {
        Args: { p_comment: string; p_revision: number; p_token: string }
        Returns: undefined
      }
      upsert_review_share_response: {
        Args: {
          p_comment: string
          p_entry_key: string
          p_label: string
          p_resolved: boolean
          p_revision: number
          p_session_id: string
          p_token: string
        }
        Returns: string
      }
    }
    Enums: {
      account_status: "pending" | "active" | "blocked" | "suspended"
      app_role: "admin" | "user" | "owner"
      file_status: "open" | "closed" | "reopened" | "archived"
      team_member_role: "owner" | "member"
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
      account_status: ["pending", "active", "blocked", "suspended"],
      app_role: ["admin", "user", "owner"],
      file_status: ["open", "closed", "reopened", "archived"],
      team_member_role: ["owner", "member"],
    },
  },
} as const
