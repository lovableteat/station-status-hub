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
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          content: string
          created_at: string
          id: string
          is_active: boolean
          title: string
          type: string | null
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_active?: boolean
          title: string
          type?: string | null
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          title?: string
          type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          api_key: string
          created_at: string
          created_by: string | null
          description: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          key_name: string
          last_used_at: string | null
          permissions: Json
          updated_at: string
          usage_count: number
        }
        Insert: {
          api_key: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_name: string
          last_used_at?: string | null
          permissions?: Json
          updated_at?: string
          usage_count?: number
        }
        Update: {
          api_key?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_name?: string
          last_used_at?: string | null
          permissions?: Json
          updated_at?: string
          usage_count?: number
        }
        Relationships: []
      }
      bug_attachments: {
        Row: {
          bug_id: string | null
          created_at: string | null
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
        }
        Insert: {
          bug_id?: string | null
          created_at?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
        }
        Update: {
          bug_id?: string | null
          created_at?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bug_attachments_bug_id_fkey"
            columns: ["bug_id"]
            isOneToOne: false
            referencedRelation: "bugs"
            referencedColumns: ["id"]
          },
        ]
      }
      bugs: {
        Row: {
          assigned_to: string | null
          created_at: string | null
          created_by: string | null
          debug_status: string | null
          description: string
          id: string
          priority: string | null
          solution: string | null
          station_id: string | null
          status_update: string | null
          system_id: string | null
          test_item_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          created_by?: string | null
          debug_status?: string | null
          description: string
          id?: string
          priority?: string | null
          solution?: string | null
          station_id?: string | null
          status_update?: string | null
          system_id?: string | null
          test_item_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          created_by?: string | null
          debug_status?: string | null
          description?: string
          id?: string
          priority?: string | null
          solution?: string | null
          station_id?: string | null
          status_update?: string | null
          system_id?: string | null
          test_item_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bugs_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bugs_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bugs_test_item_id_fkey"
            columns: ["test_item_id"]
            isOneToOne: false
            referencedRelation: "test_items"
            referencedColumns: ["id"]
          },
        ]
      }
      code_snippets: {
        Row: {
          category: string
          code_content: string
          created_at: string
          description: string | null
          id: string
          language: string
          sop_content: string | null
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          code_content: string
          created_at?: string
          description?: string | null
          id?: string
          language?: string
          sop_content?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          code_content?: string
          created_at?: string
          description?: string | null
          id?: string
          language?: string
          sop_content?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      columns: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          position: number
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          position?: number
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          position?: number
        }
        Relationships: []
      }
      command_library: {
        Row: {
          category: string
          command: string
          created_at: string
          created_by: string | null
          description: string
          examples: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          platform: string
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          category?: string
          command: string
          created_at?: string
          created_by?: string | null
          description: string
          examples?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          platform?: string
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          category?: string
          command?: string
          created_at?: string
          created_by?: string | null
          description?: string
          examples?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          platform?: string
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      component_categories: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          name: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      component_specs: {
        Row: {
          category_id: string
          color: string | null
          created_at: string
          datasheet_url: string | null
          dimensions: Json
          electrical_specs: Json | null
          id: string
          image_url: string | null
          is_active: boolean
          keep_out_zone: number | null
          manufacturer_id: string
          mounting_type: string | null
          name: string
          package_type: string | null
          physical_specs: Json | null
          pin_configuration: Json | null
          type: string
          updated_at: string
        }
        Insert: {
          category_id: string
          color?: string | null
          created_at?: string
          datasheet_url?: string | null
          dimensions?: Json
          electrical_specs?: Json | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          keep_out_zone?: number | null
          manufacturer_id: string
          mounting_type?: string | null
          name: string
          package_type?: string | null
          physical_specs?: Json | null
          pin_configuration?: Json | null
          type: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          color?: string | null
          created_at?: string
          datasheet_url?: string | null
          dimensions?: Json
          electrical_specs?: Json | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          keep_out_zone?: number | null
          manufacturer_id?: string
          mounting_type?: string | null
          name?: string
          package_type?: string | null
          physical_specs?: Json | null
          pin_configuration?: Json | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "component_specs_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "component_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "component_specs_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_components: {
        Row: {
          category: string | null
          color: string | null
          created_at: string
          height: number
          id: string
          keep_out_zone: number | null
          manufacturer: string | null
          max_height: number
          name: string
          type: string
          updated_at: string
          width: number
        }
        Insert: {
          category?: string | null
          color?: string | null
          created_at?: string
          height: number
          id?: string
          keep_out_zone?: number | null
          manufacturer?: string | null
          max_height: number
          name: string
          type: string
          updated_at?: string
          width: number
        }
        Update: {
          category?: string | null
          color?: string | null
          created_at?: string
          height?: number
          id?: string
          keep_out_zone?: number | null
          manufacturer?: string | null
          max_height?: number
          name?: string
          type?: string
          updated_at?: string
          width?: number
        }
        Relationships: []
      }
      daily_production_stats: {
        Row: {
          completed_systems: number
          created_at: string
          date: string
          id: string
          target_systems: number
          updated_at: string
          work_day: boolean
        }
        Insert: {
          completed_systems?: number
          created_at?: string
          date?: string
          id?: string
          target_systems?: number
          updated_at?: string
          work_day?: boolean
        }
        Update: {
          completed_systems?: number
          created_at?: string
          date?: string
          id?: string
          target_systems?: number
          updated_at?: string
          work_day?: boolean
        }
        Relationships: []
      }
      dashboard_item_exclusions: {
        Row: {
          created_at: string
          id: string
          item_id: string
          reason: string | null
          station_id: string | null
          system_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          reason?: string | null
          station_id?: string | null
          system_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          reason?: string | null
          station_id?: string | null
          system_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_item_exclusions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "test_flow_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_item_exclusions_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "test_flow_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_item_exclusions_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "test_systems"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers_and_tools: {
        Row: {
          comment: string | null
          created_at: string | null
          file_name: string
          file_path: string | null
          file_size: number | null
          id: string
          required: boolean | null
          tool_name: string
          version: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          file_name: string
          file_path?: string | null
          file_size?: number | null
          id?: string
          required?: boolean | null
          tool_name: string
          version?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          file_name?: string
          file_path?: string | null
          file_size?: number | null
          id?: string
          required?: boolean | null
          tool_name?: string
          version?: string | null
        }
        Relationships: []
      }
      engineers: {
        Row: {
          created_at: string | null
          email: string | null
          employee_id: string | null
          id: string
          name: string
          status: string | null
          team: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          employee_id?: string | null
          id?: string
          name: string
          status?: string | null
          team: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          employee_id?: string | null
          id?: string
          name?: string
          status?: string | null
          team?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      export_logs: {
        Row: {
          export_date: string | null
          export_type: string | null
          file_name: string | null
          filter_params: Json | null
          id: string
          user_id: string | null
        }
        Insert: {
          export_date?: string | null
          export_type?: string | null
          file_name?: string | null
          filter_params?: Json | null
          id?: string
          user_id?: string | null
        }
        Update: {
          export_date?: string | null
          export_type?: string | null
          file_name?: string | null
          filter_params?: Json | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "export_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      hyperlinks: {
        Row: {
          category: string
          created_at: string | null
          description: string
          id: string
          link: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string | null
          description: string
          id?: string
          link: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string
          id?: string
          link?: string
          user_id?: string
        }
        Relationships: []
      }
      issue_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          issue_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          issue_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          issue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "issue_attachments_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "issue_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issue_attachments_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "issues"
            referencedColumns: ["id"]
          },
        ]
      }
      issues: {
        Row: {
          assigned_to: string | null
          category: string | null
          created_at: string
          description: string
          id: string
          mentioned_users: string[] | null
          priority: string
          priority_manual: boolean
          process_notes: string | null
          project_id: string
          relate: string | null
          solution: string | null
          station_id: string | null
          status: string
          system_id: string | null
          tags: string[] | null
          test_item_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string | null
          created_at?: string
          description: string
          id?: string
          mentioned_users?: string[] | null
          priority?: string
          priority_manual?: boolean
          process_notes?: string | null
          project_id: string
          relate?: string | null
          solution?: string | null
          station_id?: string | null
          status?: string
          system_id?: string | null
          tags?: string[] | null
          test_item_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: string | null
          created_at?: string
          description?: string
          id?: string
          mentioned_users?: string[] | null
          priority?: string
          priority_manual?: boolean
          process_notes?: string | null
          project_id?: string
          relate?: string | null
          solution?: string | null
          station_id?: string | null
          status?: string
          system_id?: string | null
          tags?: string[] | null
          test_item_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "issues_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "test_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "test_flow_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "test_systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issues_test_item_id_fkey"
            columns: ["test_item_id"]
            isOneToOne: false
            referencedRelation: "test_flow_items"
            referencedColumns: ["id"]
          },
        ]
      }
      keep_alive_check: {
        Row: {
          id: number | null
        }
        Insert: {
          id?: number | null
        }
        Update: {
          id?: number | null
        }
        Relationships: []
      }
      login_audit: {
        Row: {
          display_name: string | null
          id: string
          ip_address: string | null
          login_time: string
          role: string
          success: boolean
          user_agent: string | null
          user_id: string
          username: string
        }
        Insert: {
          display_name?: string | null
          id?: string
          ip_address?: string | null
          login_time?: string
          role: string
          success?: boolean
          user_agent?: string | null
          user_id: string
          username: string
        }
        Update: {
          display_name?: string | null
          id?: string
          ip_address?: string | null
          login_time?: string
          role?: string
          success?: boolean
          user_agent?: string | null
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      manufacturers: {
        Row: {
          country: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
          website: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      notification_analytics: {
        Row: {
          action: string
          id: string
          metadata: Json | null
          notification_id: string
          timestamp: string
          user_id: string
        }
        Insert: {
          action: string
          id?: string
          metadata?: Json | null
          notification_id: string
          timestamp?: string
          user_id: string
        }
        Update: {
          action?: string
          id?: string
          metadata?: Json | null
          notification_id?: string
          timestamp?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string
          notification_id: string
          participant_ids: string[]
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string
          notification_id: string
          participant_ids?: string[]
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string
          notification_id?: string
          participant_ids?: string[]
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          category: string
          created_at: string
          delivery_method: string[] | null
          enabled: boolean
          id: string
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          delivery_method?: string[] | null
          enabled?: boolean
          id?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          delivery_method?: string[] | null
          enabled?: boolean
          id?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_replies: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          content: string | null
          created_at: string
          id: string
          notification_id: string
          reply_type: string
          sender_id: string
          status: string
          updated_at: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          content?: string | null
          created_at?: string
          id?: string
          notification_id: string
          reply_type?: string
          sender_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          content?: string | null
          created_at?: string
          id?: string
          notification_id?: string
          reply_type?: string
          sender_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_templates: {
        Row: {
          category: string
          created_at: string
          id: string
          is_active: boolean | null
          message_template: string
          metadata_schema: Json | null
          priority: string | null
          template_key: string
          title_template: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          message_template: string
          metadata_schema?: Json | null
          priority?: string | null
          template_key: string
          title_template: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          message_template?: string
          metadata_schema?: Json | null
          priority?: string | null
          template_key?: string
          title_template?: string
          updated_at?: string
        }
        Relationships: []
      }
      production_metrics: {
        Row: {
          completed_today: number | null
          created_at: string | null
          daily_target: number | null
          date: string | null
          defect_rate: number | null
          hourly_throughput: number | null
          id: string
          oee: number | null
          quality_score: number | null
          updated_at: string | null
        }
        Insert: {
          completed_today?: number | null
          created_at?: string | null
          daily_target?: number | null
          date?: string | null
          defect_rate?: number | null
          hourly_throughput?: number | null
          id?: string
          oee?: number | null
          quality_score?: number | null
          updated_at?: string | null
        }
        Update: {
          completed_today?: number | null
          created_at?: string | null
          daily_target?: number | null
          date?: string | null
          defect_rate?: number | null
          hourly_throughput?: number | null
          id?: string
          oee?: number | null
          quality_score?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      production_targets: {
        Row: {
          created_at: string
          daily_target: number
          id: string
          target_date: string
          updated_at: string
          weekly_target: number
        }
        Insert: {
          created_at?: string
          daily_target?: number
          id?: string
          target_date?: string
          updated_at?: string
          weekly_target?: number
        }
        Update: {
          created_at?: string
          daily_target?: number
          id?: string
          target_date?: string
          updated_at?: string
          weekly_target?: number
        }
        Relationships: []
      }
      project_tasks: {
        Row: {
          assigned_to: string | null
          created_at: string | null
          dependencies: Json | null
          end_date: string | null
          id: string
          priority: string | null
          progress: number | null
          start_date: string | null
          task_name: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          dependencies?: Json | null
          end_date?: string | null
          id?: string
          priority?: string | null
          progress?: number | null
          start_date?: string | null
          task_name: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          dependencies?: Json | null
          end_date?: string | null
          id?: string
          priority?: string | null
          progress?: number | null
          start_date?: string | null
          task_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      project_templates: {
        Row: {
          board_height: number | null
          board_width: number | null
          components: Json | null
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          board_height?: number | null
          board_width?: number | null
          components?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          board_height?: number | null
          board_width?: number | null
          components?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          board_height: number | null
          board_width: number | null
          components: Json | null
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          board_height?: number | null
          board_width?: number | null
          components?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          board_height?: number | null
          board_width?: number | null
          components?: Json | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      station_contents: {
        Row: {
          content: string | null
          created_at: string
          flow_version_id: string
          id: string
          order_num: number
          project_id: string
          station_id: string
          title: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          flow_version_id: string
          id?: string
          order_num?: number
          project_id: string
          station_id: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          created_at?: string
          flow_version_id?: string
          id?: string
          order_num?: number
          project_id?: string
          station_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "station_contents_flow_version_id_fkey"
            columns: ["flow_version_id"]
            isOneToOne: false
            referencedRelation: "test_flow_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_contents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "test_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_contents_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "test_flow_stations"
            referencedColumns: ["id"]
          },
        ]
      }
      station_time_analytics: {
        Row: {
          actual_hours: number
          created_at: string | null
          efficiency_ratio: number | null
          estimated_hours: number
          id: string
          station_id: string
          system_id: string
        }
        Insert: {
          actual_hours: number
          created_at?: string | null
          efficiency_ratio?: number | null
          estimated_hours: number
          id?: string
          station_id: string
          system_id: string
        }
        Update: {
          actual_hours?: number
          created_at?: string | null
          efficiency_ratio?: number | null
          estimated_hours?: number
          id?: string
          station_id?: string
          system_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "station_time_analytics_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "test_flow_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_time_analytics_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "test_systems"
            referencedColumns: ["id"]
          },
        ]
      }
      station_time_records: {
        Row: {
          created_at: string
          end_time: string | null
          id: string
          project_id: string
          start_time: string | null
          station_id: string
          station_name: string
          system_id: string
          total_hours: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_time?: string | null
          id?: string
          project_id: string
          start_time?: string | null
          station_id: string
          station_name: string
          system_id: string
          total_hours?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_time?: string | null
          id?: string
          project_id?: string
          start_time?: string | null
          station_id?: string
          station_name?: string
          system_id?: string
          total_hours?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "station_time_records_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "test_flow_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_time_records_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "test_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_time_records_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "test_systems"
            referencedColumns: ["id"]
          },
        ]
      }
      station_time_settings: {
        Row: {
          actual_completion_time: string | null
          created_at: string
          estimated_end_time: string | null
          estimated_start_time: string | null
          id: string
          station_id: string
          system_id: string
          updated_at: string
        }
        Insert: {
          actual_completion_time?: string | null
          created_at?: string
          estimated_end_time?: string | null
          estimated_start_time?: string | null
          id?: string
          station_id: string
          system_id: string
          updated_at?: string
        }
        Update: {
          actual_completion_time?: string | null
          created_at?: string
          estimated_end_time?: string | null
          estimated_start_time?: string | null
          id?: string
          station_id?: string
          system_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_station_time_settings_station"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "test_flow_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_station_time_settings_system"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "test_systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_time_settings_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "test_flow_stations"
            referencedColumns: ["id"]
          },
        ]
      }
      stations: {
        Row: {
          created_at: string | null
          id: string
          location: string | null
          name: string
          owner: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          location?: string | null
          name: string
          owner?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          location?: string | null
          name?: string
          owner?: string | null
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          settings: Json
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          id?: string
          settings?: Json
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          settings?: Json
          updated_at?: string
        }
        Relationships: []
      }
      system_units: {
        Row: {
          assigned_to: string | null
          basic_info: Json | null
          created_at: string | null
          current_station: string | null
          encountered_issues: string | null
          id: string
          model: string | null
          name: string
          notes: string | null
          progress: number | null
          serial_number: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          basic_info?: Json | null
          created_at?: string | null
          current_station?: string | null
          encountered_issues?: string | null
          id?: string
          model?: string | null
          name: string
          notes?: string | null
          progress?: number | null
          serial_number: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          basic_info?: Json | null
          created_at?: string | null
          current_station?: string | null
          encountered_issues?: string | null
          id?: string
          model?: string | null
          name?: string
          notes?: string | null
          progress?: number | null
          serial_number?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      system_users: {
        Row: {
          created_at: string
          created_by: string | null
          display_name: string | null
          id: string
          password_hash: string
          permissions: Json | null
          role: string
          status: string | null
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          id?: string
          password_hash: string
          permissions?: Json | null
          role?: string
          status?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          id?: string
          password_hash?: string
          permissions?: Json | null
          role?: string
          status?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      systems: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      task_status: {
        Row: {
          assigned_to: string | null
          created_at: string | null
          end_time: string | null
          id: string
          progress_percentage: number | null
          remark: string | null
          start_time: string | null
          status: string | null
          system_id: string | null
          test_item_id: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          end_time?: string | null
          id?: string
          progress_percentage?: number | null
          remark?: string | null
          start_time?: string | null
          status?: string | null
          system_id?: string | null
          test_item_id?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          end_time?: string | null
          id?: string
          progress_percentage?: number | null
          remark?: string | null
          start_time?: string | null
          status?: string | null
          system_id?: string | null
          test_item_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_status_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_status_test_item_id_fkey"
            columns: ["test_item_id"]
            isOneToOne: false
            referencedRelation: "test_items"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee: string | null
          attachment_names: string[] | null
          attachment_urls: string[] | null
          column_id: string | null
          created_at: string
          custom_fields: Json | null
          description: string | null
          due_date: string | null
          id: string
          image_urls: string[] | null
          milestone: string | null
          position: number
          result_url: string | null
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          assignee?: string | null
          attachment_names?: string[] | null
          attachment_urls?: string[] | null
          column_id?: string | null
          created_at?: string
          custom_fields?: Json | null
          description?: string | null
          due_date?: string | null
          id?: string
          image_urls?: string[] | null
          milestone?: string | null
          position?: number
          result_url?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          assignee?: string | null
          attachment_names?: string[] | null
          attachment_urls?: string[] | null
          column_id?: string | null
          created_at?: string
          custom_fields?: Json | null
          description?: string | null
          due_date?: string | null
          id?: string
          image_urls?: string[] | null
          milestone?: string | null
          position?: number
          result_url?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_column_id_fkey"
            columns: ["column_id"]
            isOneToOne: false
            referencedRelation: "columns"
            referencedColumns: ["id"]
          },
        ]
      }
      test_export_logs: {
        Row: {
          created_at: string | null
          export_params: Json | null
          export_type: string
          exported_by: string | null
          file_name: string | null
          id: string
        }
        Insert: {
          created_at?: string | null
          export_params?: Json | null
          export_type: string
          exported_by?: string | null
          file_name?: string | null
          id?: string
        }
        Update: {
          created_at?: string | null
          export_params?: Json | null
          export_type?: string
          exported_by?: string | null
          file_name?: string | null
          id?: string
        }
        Relationships: []
      }
      test_flow_items: {
        Row: {
          created_at: string
          description: string | null
          estimated_minutes: number | null
          flow_version_id: string
          id: string
          item_name: string
          item_order: number
          project_id: string
          station_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          estimated_minutes?: number | null
          flow_version_id: string
          id?: string
          item_name: string
          item_order: number
          project_id: string
          station_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          estimated_minutes?: number | null
          flow_version_id?: string
          id?: string
          item_name?: string
          item_order?: number
          project_id?: string
          station_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_flow_items_flow_version_id_fkey"
            columns: ["flow_version_id"]
            isOneToOne: false
            referencedRelation: "test_flow_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_flow_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "test_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_flow_items_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "test_flow_stations"
            referencedColumns: ["id"]
          },
        ]
      }
      test_flow_stations: {
        Row: {
          created_at: string
          description: string | null
          estimated_hours: number | null
          flow_version_id: string
          id: string
          project_id: string
          station_name: string
          station_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          estimated_hours?: number | null
          flow_version_id: string
          id?: string
          project_id: string
          station_name: string
          station_order: number
        }
        Update: {
          created_at?: string
          description?: string | null
          estimated_hours?: number | null
          flow_version_id?: string
          id?: string
          project_id?: string
          station_name?: string
          station_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "test_flow_stations_flow_version_id_fkey"
            columns: ["flow_version_id"]
            isOneToOne: false
            referencedRelation: "test_flow_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_flow_stations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "test_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      test_flow_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          label: string | null
          notes: string | null
          project_id: string
          published_at: string | null
          status: string
          updated_at: string
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          notes?: string | null
          project_id: string
          published_at?: string | null
          status?: string
          updated_at?: string
          version_number: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          notes?: string | null
          project_id?: string
          published_at?: string | null
          status?: string
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "test_flow_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "test_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      test_items: {
        Row: {
          created_at: string | null
          detail: string | null
          estimated_days: number | null
          id: string
          name: string
          station_id: string | null
          weight: number | null
        }
        Insert: {
          created_at?: string | null
          detail?: string | null
          estimated_days?: number | null
          id?: string
          name: string
          station_id?: string | null
          weight?: number | null
        }
        Update: {
          created_at?: string | null
          detail?: string | null
          estimated_days?: number | null
          id?: string
          name?: string
          station_id?: string | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "test_items_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      test_progress: {
        Row: {
          actual_hours: number | null
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          id: string
          item_id: string
          notes: string | null
          project_id: string
          progress_percent: number | null
          started_at: string | null
          station_id: string
          status: string | null
          system_id: string
          updated_at: string
        }
        Insert: {
          actual_hours?: number | null
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          item_id: string
          notes?: string | null
          project_id: string
          progress_percent?: number | null
          started_at?: string | null
          station_id: string
          status?: string | null
          system_id: string
          updated_at?: string
        }
        Update: {
          actual_hours?: number | null
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          item_id?: string
          notes?: string | null
          project_id?: string
          progress_percent?: number | null
          started_at?: string | null
          station_id?: string
          status?: string | null
          system_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_progress_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "test_flow_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_progress_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "test_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_progress_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "test_flow_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_progress_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "test_systems"
            referencedColumns: ["id"]
          },
        ]
      }
      test_progress_audit: {
        Row: {
          change_type: string
          created_at: string
          id: string
          item_id: string
          new_values: Json | null
          old_values: Json | null
          station_id: string
          system_id: string
          user_id: string | null
        }
        Insert: {
          change_type: string
          created_at?: string
          id?: string
          item_id: string
          new_values?: Json | null
          old_values?: Json | null
          station_id: string
          system_id: string
          user_id?: string | null
        }
        Update: {
          change_type?: string
          created_at?: string
          id?: string
          item_id?: string
          new_values?: Json | null
          old_values?: Json | null
          station_id?: string
          system_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      test_projects: {
        Row: {
          active_flow_version_id: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          id: string
          is_archived: boolean
          name: string
          owner_user_id: string | null
          planned_end_date: string | null
          planned_start_date: string | null
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          active_flow_version_id?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_archived?: boolean
          name: string
          owner_user_id?: string | null
          planned_end_date?: string | null
          planned_start_date?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          active_flow_version_id?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_archived?: boolean
          name?: string
          owner_user_id?: string | null
          planned_end_date?: string | null
          planned_start_date?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_projects_active_flow_version_id_fkey"
            columns: ["active_flow_version_id"]
            isOneToOne: false
            referencedRelation: "test_flow_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_projects_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "system_users"
            referencedColumns: ["id"]
          },
        ]
      }
      test_project_code_assignments: {
        Row: {
          code_snippet_id: string
          created_at: string
          notes: string | null
          project_id: string
        }
        Insert: {
          code_snippet_id: string
          created_at?: string
          notes?: string | null
          project_id: string
        }
        Update: {
          code_snippet_id?: string
          created_at?: string
          notes?: string | null
          project_id?: string
        }
        Relationships: []
      }
      test_project_command_assignments: {
        Row: {
          command_id: string
          created_at: string
          notes: string | null
          project_id: string
        }
        Insert: {
          command_id: string
          created_at?: string
          notes?: string | null
          project_id: string
        }
        Update: {
          command_id?: string
          created_at?: string
          notes?: string | null
          project_id?: string
        }
        Relationships: []
      }
      test_project_tool_assignments: {
        Row: {
          created_at: string
          is_required: boolean
          notes: string | null
          pinned_version: string | null
          project_id: string
          tool_id: string
        }
        Insert: {
          created_at?: string
          is_required?: boolean
          notes?: string | null
          pinned_version?: string | null
          project_id: string
          tool_id: string
        }
        Update: {
          created_at?: string
          is_required?: boolean
          notes?: string | null
          pinned_version?: string | null
          project_id?: string
          tool_id?: string
        }
        Relationships: []
      }
      test_stations: {
        Row: {
          created_at: string | null
          description: string | null
          efficiency_rate: number | null
          failed_tests: number | null
          id: string
          location: string | null
          name: string
          passed_tests: number | null
          total_tests: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          efficiency_rate?: number | null
          failed_tests?: number | null
          id?: string
          location?: string | null
          name: string
          passed_tests?: number | null
          total_tests?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          efficiency_rate?: number | null
          failed_tests?: number | null
          id?: string
          location?: string | null
          name?: string
          passed_tests?: number | null
          total_tests?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      test_systems: {
        Row: {
          actual_completed_at: string | null
          actual_started_at: string | null
          assigned_engineer: string | null
          bmc_address: string | null
          bom_90: string | null
          cabinet: string | null
          created_at: string
          cuda_version: string | null
          current_station: string | null
          exclude_from_dashboard: boolean | null
          flow_version_id: string
          id: string
          model: string | null
          old_bmc_address: string | null
          os_mac_address: string | null
          overall_progress: number | null
          project_id: string
          serial_number: string | null
          status: string | null
          system_name: string
          team: string | null
          ubuntu_version: string | null
          updated_at: string
        }
        Insert: {
          actual_completed_at?: string | null
          actual_started_at?: string | null
          assigned_engineer?: string | null
          bmc_address?: string | null
          bom_90?: string | null
          cabinet?: string | null
          created_at?: string
          cuda_version?: string | null
          current_station?: string | null
          exclude_from_dashboard?: boolean | null
          flow_version_id: string
          id?: string
          model?: string | null
          old_bmc_address?: string | null
          os_mac_address?: string | null
          overall_progress?: number | null
          project_id: string
          serial_number?: string | null
          status?: string | null
          system_name: string
          team?: string | null
          ubuntu_version?: string | null
          updated_at?: string
        }
        Update: {
          actual_completed_at?: string | null
          actual_started_at?: string | null
          assigned_engineer?: string | null
          bmc_address?: string | null
          bom_90?: string | null
          cabinet?: string | null
          created_at?: string
          cuda_version?: string | null
          current_station?: string | null
          exclude_from_dashboard?: boolean | null
          flow_version_id?: string
          id?: string
          model?: string | null
          old_bmc_address?: string | null
          os_mac_address?: string | null
          overall_progress?: number | null
          project_id?: string
          serial_number?: string | null
          status?: string | null
          system_name?: string
          team?: string | null
          ubuntu_version?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "test_systems_flow_version_id_fkey"
            columns: ["flow_version_id"]
            isOneToOne: false
            referencedRelation: "test_flow_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_systems_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "test_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tools_management: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          download_count: number | null
          file_name: string | null
          file_path: string | null
          file_size: number | null
          id: string
          is_required: boolean | null
          sop_content: string | null
          tool_name: string
          updated_at: string | null
          upload_status: string | null
          uploaded_at: string | null
          uploaded_by: string | null
          version: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          download_count?: number | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          is_required?: boolean | null
          sop_content?: string | null
          tool_name: string
          updated_at?: string | null
          upload_status?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
          version?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          download_count?: number | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          is_required?: boolean | null
          sop_content?: string | null
          tool_name?: string
          updated_at?: string | null
          upload_status?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
          version?: string | null
        }
        Relationships: []
      }
      troubleshooting_records: {
        Row: {
          created_at: string
          description: string | null
          id: string
          issue_category: string | null
          issue_type: string
          occurred_at: string
          reported_by: string | null
          resolved_at: string | null
          resolved_by: string | null
          root_cause: string | null
          severity: string
          solution: string | null
          station_id: string | null
          status: string
          system_id: string | null
          tags: string[] | null
          test_item_id: string | null
          time_to_resolve_hours: number | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          issue_category?: string | null
          issue_type?: string
          occurred_at?: string
          reported_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          root_cause?: string | null
          severity?: string
          solution?: string | null
          station_id?: string | null
          status?: string
          system_id?: string | null
          tags?: string[] | null
          test_item_id?: string | null
          time_to_resolve_hours?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          issue_category?: string | null
          issue_type?: string
          occurred_at?: string
          reported_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          root_cause?: string | null
          severity?: string
          solution?: string | null
          station_id?: string | null
          status?: string
          system_id?: string | null
          tags?: string[] | null
          test_item_id?: string | null
          time_to_resolve_hours?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "troubleshooting_records_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "test_flow_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "troubleshooting_records_system_id_fkey"
            columns: ["system_id"]
            isOneToOne: false
            referencedRelation: "test_systems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "troubleshooting_records_test_item_id_fkey"
            columns: ["test_item_id"]
            isOneToOne: false
            referencedRelation: "test_flow_items"
            referencedColumns: ["id"]
          },
        ]
      }
      ui_table_preferences: {
        Row: {
          column_order: Json
          created_at: string
          id: string
          table_key: string
          updated_at: string
        }
        Insert: {
          column_order?: Json
          created_at?: string
          id?: string
          table_key: string
          updated_at?: string
        }
        Update: {
          column_order?: Json
          created_at?: string
          id?: string
          table_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_mentions: {
        Row: {
          content_id: string
          content_text: string | null
          content_type: string
          created_at: string
          id: string
          mention_id: string
          mentioned_by_user_id: string
          mentioned_user_id: string
        }
        Insert: {
          content_id: string
          content_text?: string | null
          content_type: string
          created_at?: string
          id?: string
          mention_id: string
          mentioned_by_user_id: string
          mentioned_user_id: string
        }
        Update: {
          content_id?: string
          content_text?: string | null
          content_type?: string
          created_at?: string
          id?: string
          mention_id?: string
          mentioned_by_user_id?: string
          mentioned_user_id?: string
        }
        Relationships: []
      }
      user_notifications: {
        Row: {
          action_url: string | null
          archived_at: string | null
          archived_by: string | null
          category: string | null
          conversation_id: string | null
          created_at: string
          expires_at: string | null
          grouped_id: string | null
          id: string
          is_read: boolean
          message: string
          metadata: Json | null
          notification_type: string
          priority: string | null
          read_at: string | null
          recipient_id: string
          reference_id: string | null
          reference_type: string | null
          reply_id: string | null
          require_confirmation: boolean | null
          sender_id: string
          status: string | null
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          action_url?: string | null
          archived_at?: string | null
          archived_by?: string | null
          category?: string | null
          conversation_id?: string | null
          created_at?: string
          expires_at?: string | null
          grouped_id?: string | null
          id?: string
          is_read?: boolean
          message: string
          metadata?: Json | null
          notification_type?: string
          priority?: string | null
          read_at?: string | null
          recipient_id: string
          reference_id?: string | null
          reference_type?: string | null
          reply_id?: string | null
          require_confirmation?: boolean | null
          sender_id: string
          status?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          action_url?: string | null
          archived_at?: string | null
          archived_by?: string | null
          category?: string | null
          conversation_id?: string | null
          created_at?: string
          expires_at?: string | null
          grouped_id?: string | null
          id?: string
          is_read?: boolean
          message?: string
          metadata?: Json | null
          notification_type?: string
          priority?: string | null
          read_at?: string | null
          recipient_id?: string
          reference_id?: string | null
          reference_type?: string | null
          reply_id?: string | null
          require_confirmation?: boolean | null
          sender_id?: string
          status?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_page_permissions: {
        Row: {
          granted_at: string | null
          granted_by: string | null
          id: string
          permission: Database["public"]["Enums"]["page_permission"]
          user_id: string
        }
        Insert: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          permission: Database["public"]["Enums"]["page_permission"]
          user_id: string
        }
        Update: {
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          permission?: Database["public"]["Enums"]["page_permission"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_page_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "system_users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          permissions: Json | null
          role: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          permissions?: Json | null
          role: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          permissions?: Json | null
          role?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          account: string
          created_at: string | null
          email: string | null
          id: string
          last_login: string | null
          name: string
          password_hash: string
          role: string | null
        }
        Insert: {
          account: string
          created_at?: string | null
          email?: string | null
          id?: string
          last_login?: string | null
          name: string
          password_hash: string
          role?: string | null
        }
        Update: {
          account?: string
          created_at?: string | null
          email?: string | null
          id?: string
          last_login?: string | null
          name?: string
          password_hash?: string
          role?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      active_notifications: {
        Row: {
          action_url: string | null
          archived_at: string | null
          archived_by: string | null
          category: string | null
          conversation_id: string | null
          created_at: string | null
          expires_at: string | null
          grouped_id: string | null
          id: string | null
          is_read: boolean | null
          message: string | null
          metadata: Json | null
          notification_type: string | null
          priority: string | null
          read_at: string | null
          recipient_id: string | null
          reference_id: string | null
          reference_type: string | null
          reply_id: string | null
          require_confirmation: boolean | null
          sender_id: string | null
          status: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          action_url?: string | null
          archived_at?: string | null
          archived_by?: string | null
          category?: string | null
          conversation_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          grouped_id?: string | null
          id?: string | null
          is_read?: boolean | null
          message?: string | null
          metadata?: Json | null
          notification_type?: string | null
          priority?: string | null
          read_at?: string | null
          recipient_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          reply_id?: string | null
          require_confirmation?: boolean | null
          sender_id?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          action_url?: string | null
          archived_at?: string | null
          archived_by?: string | null
          category?: string | null
          conversation_id?: string | null
          created_at?: string | null
          expires_at?: string | null
          grouped_id?: string | null
          id?: string | null
          is_read?: boolean | null
          message?: string | null
          metadata?: Json | null
          notification_type?: string | null
          priority?: string | null
          read_at?: string | null
          recipient_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          reply_id?: string | null
          require_confirmation?: boolean | null
          sender_id?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      issue_details: {
        Row: {
          assigned_engineer: string | null
          assigned_to: string | null
          created_at: string | null
          description: string | null
          id: string | null
          priority: string | null
          station_name: string | null
          station_order: number | null
          status: string | null
          system_name: string | null
          test_item_description: string | null
          test_item_name: string | null
          title: string | null
          updated_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
        authenticate_user: {
          Args: { password_input: string; username_input: string }
          Returns: {
            display_name: string
            role: string
            success: boolean
            user_id: string
            username: string
          }[]
        }
        calculate_daily_production_stats: { Args: never; Returns: undefined }
        cleanup_old_notifications: { Args: never; Returns: undefined }
        create_test_project: {
          Args: {
            p_clone_from_project_id?: string | null
            p_description?: string | null
            p_name: string
          }
          Returns: {
            active_flow_version_id: string | null
            completed_at: string | null
            created_at: string
            description: string | null
            id: string
            is_archived: boolean
            name: string
            owner_user_id: string | null
            planned_end_date: string | null
            planned_start_date: string | null
            started_at: string | null
            status: string
            updated_at: string
          }
        }
        create_test_flow_draft: {
          Args: { p_created_by?: string | null; p_project_id: string }
          Returns: {
            created_at: string
            created_by: string | null
            id: string
            label: string | null
            notes: string | null
            project_id: string
            published_at: string | null
            status: string
            updated_at: string
            version_number: number
          }
        }
        discard_test_flow_draft: {
          Args: { p_project_id: string }
          Returns: boolean
        }
        get_test_project_summaries: {
          Args: never
          Returns: {
            active_machine_count: number
            flow_version_label: string | null
            machine_count: number
            open_issue_count: number
            project_id: string
          }[]
        }
        publish_test_flow_version: {
          Args: { p_project_id: string; p_version_id: string }
          Returns: {
            created_at: string
            created_by: string | null
            id: string
            label: string | null
            notes: string | null
            project_id: string
            published_at: string | null
            status: string
            updated_at: string
            version_number: number
          }
        }
        reorder_test_flow_items: {
          Args: {
            p_flow_version_id: string
            p_item_ids: string[]
            p_project_id: string
            p_station_id: string
          }
          Returns: undefined
        }
        reorder_test_flow_stations: {
          Args: {
            p_flow_version_id: string
            p_project_id: string
            p_station_ids: string[]
          }
          Returns: undefined
        }
        delete_test_system: { Args: { p_system_id: string }; Returns: undefined }
        generate_api_key: { Args: never; Returns: string }
      get_notification_stats: {
        Args: { user_uuid: string }
        Returns: {
          categories_breakdown: Json
          high_priority_unread: number
          total_notifications: number
          unread_notifications: number
          urgent_priority_unread: number
        }[]
      }
      hash_password: { Args: { password: string }; Returns: string }
      validate_and_update_api_key: {
        Args: { key_to_check: string }
        Returns: Json
      }
      verify_password: {
        Args: { hash: string; password: string }
        Returns: boolean
      }
    }
    Enums: {
      page_permission:
        | "dashboard_view"
        | "dashboard_edit"
        | "test_tracker_view"
        | "test_tracker_edit"
        | "issues_view"
        | "issues_edit"
        | "production_view"
        | "production_edit"
        | "data_center_view"
        | "data_center_edit"
        | "tools_view"
        | "tools_edit"
        | "admin_view"
        | "admin_edit"
        | "comparison_view"
        | "comparison_edit"
        | "l11_cabinet_view"
        | "l11_cabinet_edit"
        | "api_management_view"
        | "api_management_edit"
        | "troubleshooting_view"
        | "troubleshooting_edit"
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
      page_permission: [
        "dashboard_view",
        "dashboard_edit",
        "test_tracker_view",
        "test_tracker_edit",
        "issues_view",
        "issues_edit",
        "production_view",
        "production_edit",
        "data_center_view",
        "data_center_edit",
        "tools_view",
        "tools_edit",
        "admin_view",
        "admin_edit",
        "comparison_view",
        "comparison_edit",
        "l11_cabinet_view",
        "l11_cabinet_edit",
        "api_management_view",
        "api_management_edit",
        "troubleshooting_view",
        "troubleshooting_edit",
      ],
    },
  },
} as const
