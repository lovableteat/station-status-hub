export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
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
          id: string
          order_num: number
          station_id: string
          title: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          order_num?: number
          station_id: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          order_num?: number
          station_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
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
          id: string
          item_name: string
          item_order: number
          station_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          estimated_minutes?: number | null
          id?: string
          item_name: string
          item_order: number
          station_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          estimated_minutes?: number | null
          id?: string
          item_name?: string
          item_order?: number
          station_id?: string
        }
        Relationships: [
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
          id: string
          station_name: string
          station_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          estimated_hours?: number | null
          id?: string
          station_name: string
          station_order: number
        }
        Update: {
          created_at?: string
          description?: string | null
          estimated_hours?: number | null
          id?: string
          station_name?: string
          station_order?: number
        }
        Relationships: []
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
          changed_at: string
          changed_by: string | null
          id: string
          item_id: string
          new_notes: string | null
          new_progress_percent: number | null
          new_status: string | null
          old_notes: string | null
          old_progress_percent: number | null
          old_status: string | null
          station_id: string
          system_id: string
        }
        Insert: {
          change_type: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          item_id: string
          new_notes?: string | null
          new_progress_percent?: number | null
          new_status?: string | null
          old_notes?: string | null
          old_progress_percent?: number | null
          old_status?: string | null
          station_id: string
          system_id: string
        }
        Update: {
          change_type?: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          item_id?: string
          new_notes?: string | null
          new_progress_percent?: number | null
          new_status?: string | null
          old_notes?: string | null
          old_progress_percent?: number | null
          old_status?: string | null
          station_id?: string
          system_id?: string
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
          created_at: string
          current_station: string | null
          id: string
          model: string | null
          overall_progress: number | null
          serial_number: string | null
          status: string | null
          system_name: string
          updated_at: string
        }
        Insert: {
          actual_completed_at?: string | null
          actual_started_at?: string | null
          assigned_engineer?: string | null
          created_at?: string
          current_station?: string | null
          id?: string
          model?: string | null
          overall_progress?: number | null
          serial_number?: string | null
          status?: string | null
          system_name: string
          updated_at?: string
        }
        Update: {
          actual_completed_at?: string | null
          actual_started_at?: string | null
          assigned_engineer?: string | null
          created_at?: string
          current_station?: string | null
          id?: string
          model?: string | null
          overall_progress?: number | null
          serial_number?: string | null
          status?: string | null
          system_name?: string
          updated_at?: string
        }
        Relationships: []
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
          tool_name?: string
          updated_at?: string | null
          upload_status?: string | null
          uploaded_at?: string | null
          uploaded_by?: string | null
          version?: string | null
        }
        Relationships: []
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
      [_ in never]: never
    }
    Functions: {
      authenticate_user: {
        Args: { username_input: string; password_input: string }
        Returns: {
          user_id: string
          username: string
          role: string
          success: boolean
        }[]
      }
      calculate_daily_production_stats: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      hash_password: {
        Args: { password: string }
        Returns: string
      }
      verify_password: {
        Args: { password: string; hash: string }
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
