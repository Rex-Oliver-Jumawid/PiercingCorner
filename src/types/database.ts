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
      clients: {
        Row: {
          created_at: string
          created_by: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          email?: string | null
          full_name: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          paid_at: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          recorded_by: string
          reference_number: string | null
          transaction_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          paid_at?: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          recorded_by?: string
          reference_number?: string | null
          transaction_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          paid_at?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          recorded_by?: string
          reference_number?: string | null
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "staff_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      piercer_availability: {
        Row: {
          created_at: string
          ends_at: string
          piercer_profile_id: string
          starts_at: string
          updated_at: string
          weekday: number
        }
        Insert: {
          created_at?: string
          ends_at: string
          piercer_profile_id: string
          starts_at: string
          updated_at?: string
          weekday: number
        }
        Update: {
          created_at?: string
          ends_at?: string
          piercer_profile_id?: string
          starts_at?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "piercer_availability_piercer_profile_id_fkey"
            columns: ["piercer_profile_id"]
            isOneToOne: false
            referencedRelation: "piercer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      piercer_profiles: {
        Row: {
          active: boolean
          created_at: string
          default_station_id: string | null
          display_name: string
          id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_station_id?: string | null
          display_name: string
          id?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          default_station_id?: string | null
          display_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "piercer_profiles_default_station_id_fkey"
            columns: ["default_station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      piercer_service_qualifications: {
        Row: {
          created_at: string
          piercer_profile_id: string
          service_id: string
        }
        Insert: {
          created_at?: string
          piercer_profile_id: string
          service_id: string
        }
        Update: {
          created_at?: string
          piercer_profile_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "piercer_service_qualifications_piercer_profile_id_fkey"
            columns: ["piercer_profile_id"]
            isOneToOne: false
            referencedRelation: "piercer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "piercer_service_qualifications_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          price: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          price: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          price: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          price: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      staff_accounts: {
        Row: {
          created_at: string
          display_name: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["account_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["account_status"]
          updated_at?: string
        }
        Relationships: []
      }
      stations: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      studio_exceptions: {
        Row: {
          closes_at: string | null
          created_at: string
          exception_date: string
          exception_type: Database["public"]["Enums"]["studio_exception_type"]
          id: string
          opens_at: string | null
          reason: string
          updated_at: string
        }
        Insert: {
          closes_at?: string | null
          created_at?: string
          exception_date: string
          exception_type: Database["public"]["Enums"]["studio_exception_type"]
          id?: string
          opens_at?: string | null
          reason: string
          updated_at?: string
        }
        Update: {
          closes_at?: string | null
          created_at?: string
          exception_date?: string
          exception_type?: Database["public"]["Enums"]["studio_exception_type"]
          id?: string
          opens_at?: string | null
          reason?: string
          updated_at?: string
        }
        Relationships: []
      }
      studio_hours: {
        Row: {
          closes_at: string | null
          is_open: boolean
          opens_at: string | null
          weekday: number
        }
        Insert: {
          closes_at?: string | null
          is_open: boolean
          opens_at?: string | null
          weekday: number
        }
        Update: {
          closes_at?: string | null
          is_open?: boolean
          opens_at?: string | null
          weekday?: number
        }
        Relationships: []
      }
      transaction_adjustments: {
        Row: {
          adjustment_type: Database["public"]["Enums"]["transaction_adjustment_type"]
          amount: number
          created_at: string
          id: string
          reason: string
          recorded_by: string
          transaction_id: string
        }
        Insert: {
          adjustment_type: Database["public"]["Enums"]["transaction_adjustment_type"]
          amount: number
          created_at?: string
          id?: string
          reason: string
          recorded_by?: string
          transaction_id: string
        }
        Update: {
          adjustment_type?: Database["public"]["Enums"]["transaction_adjustment_type"]
          amount?: number
          created_at?: string
          id?: string
          reason?: string
          recorded_by?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_adjustments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "staff_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_adjustments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transaction_items: {
        Row: {
          created_at: string
          id: string
          item_name_snapshot: string
          item_type: Database["public"]["Enums"]["transaction_item_type"]
          product_id: string | null
          quantity: number
          service_id: string | null
          transaction_id: string
          unit_price_snapshot: number
        }
        Insert: {
          created_at?: string
          id?: string
          item_name_snapshot: string
          item_type: Database["public"]["Enums"]["transaction_item_type"]
          product_id?: string | null
          quantity: number
          service_id?: string | null
          transaction_id: string
          unit_price_snapshot: number
        }
        Update: {
          created_at?: string
          id?: string
          item_name_snapshot?: string
          item_type?: Database["public"]["Enums"]["transaction_item_type"]
          product_id?: string | null
          quantity?: number
          service_id?: string | null
          transaction_id?: string
          unit_price_snapshot?: number
        }
        Relationships: [
          {
            foreignKeyName: "transaction_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_items_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_items_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          client_id: string
          client_name_snapshot: string
          completed_at: string | null
          created_at: string
          created_by: string
          id: string
          piercer_profile_id: string | null
          reference_code: string | null
          station_id: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          updated_at: string
        }
        Insert: {
          client_id: string
          client_name_snapshot: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          piercer_profile_id?: string | null
          reference_code?: string | null
          station_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          updated_at?: string
        }
        Update: {
          client_id?: string
          client_name_snapshot?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          piercer_profile_id?: string | null
          reference_code?: string | null
          station_id?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_summaries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_piercer_profile_id_fkey"
            columns: ["piercer_profile_id"]
            isOneToOne: false
            referencedRelation: "piercer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      waiver_templates: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          version: number
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          version: number
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "waiver_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      waivers: {
        Row: {
          client_name_snapshot: string
          created_at: string
          id: string
          pdf_storage_path: string
          recorded_by: string
          signature_storage_path: string
          signed_at: string
          transaction_id: string
          waiver_template_id: string
        }
        Insert: {
          client_name_snapshot: string
          created_at?: string
          id?: string
          pdf_storage_path: string
          recorded_by?: string
          signature_storage_path: string
          signed_at: string
          transaction_id: string
          waiver_template_id: string
        }
        Update: {
          client_name_snapshot?: string
          created_at?: string
          id?: string
          pdf_storage_path?: string
          recorded_by?: string
          signature_storage_path?: string
          signed_at?: string
          transaction_id?: string
          waiver_template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waivers_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "staff_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waivers_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waivers_waiver_template_id_fkey"
            columns: ["waiver_template_id"]
            isOneToOne: false
            referencedRelation: "waiver_templates"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      client_summaries: {
        Row: {
          created_at: string | null
          created_by: string | null
          email: string | null
          full_name: string | null
          id: string | null
          last_activity: string | null
          phone: string | null
          transaction_count: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          full_name?: string | null
          id?: string | null
          last_activity?: never
          phone?: string | null
          transaction_count?: never
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          full_name?: string | null
          id?: string | null
          last_activity?: never
          phone?: string | null
          transaction_count?: never
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      abandon_waiver_signing: {
        Args: { signing_event_id: string }
        Returns: undefined
      }
      accept_existing_transaction_waiver: {
        Args: { signing_event_id: string }
        Returns: {
          client_name: string
          created_at: string
          event_id: string
          id: string
          reference_code: string
          signed_at: string
          template_body: string
          template_id: string
          template_version: number
          total: number
        }[]
      }
      accept_new_service_waiver: {
        Args: {
          client_details: Json
          selected_product_ids: string[]
          selected_service_ids: string[]
          signing_event_id: string
        }
        Returns: {
          client_name: string
          created_at: string
          event_id: string
          id: string
          reference_code: string
          signed_at: string
          template_body: string
          template_id: string
          template_version: number
          total: number
        }[]
      }
      cancel_completed_transaction: {
        Args: {
          cancellation_reason: string
          selected_adjustment_type: Database["public"]["Enums"]["transaction_adjustment_type"]
          target_transaction_id: string
        }
        Returns: {
          adjustment_type: Database["public"]["Enums"]["transaction_adjustment_type"]
          amount: number
          created_at: string
          id: string
          reason: string
          recorded_by: string
          transaction_id: string
        }[]
      }
      create_client: {
        Args: {
          candidate_email?: string
          candidate_name: string
          candidate_phone?: string
        }
        Returns: {
          created_at: string
          created_by: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "clients"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      current_waiver_template_id: { Args: never; Returns: string }
      finalize_signed_waiver: {
        Args: {
          pdf_storage_path: string
          signature_storage_path: string
          signing_event_id: string
        }
        Returns: {
          id: string
          signed_at: string
          transaction_id: string
        }[]
      }
      finalize_transaction: {
        Args: {
          payment_reference: string
          selected_payment_method: Database["public"]["Enums"]["payment_method"]
          selected_product_ids: string[]
          selected_service_ids: string[]
          target_transaction_id: string
        }
        Returns: {
          id: string
          reference_code: string
        }[]
      }
      find_client_duplicates: {
        Args: {
          candidate_email?: string
          candidate_name: string
          candidate_phone?: string
          exclude_client_id?: string
        }
        Returns: {
          email: string
          full_name: string
          id: string
          phone: string
        }[]
      }
      get_assignable_piercers: {
        Args: { selected_service_ids: string[] }
        Returns: {
          default_station_id: string
          id: string
          name: string
        }[]
      }
      get_completed_sale: {
        Args: { target_transaction_id: string }
        Returns: {
          adjustment_history: Json
          adjustments: number
          client_name: string
          completed_at: string
          financial_status: string
          has_waiver: boolean
          id: string
          items: Json
          net_total: number
          paid: number
          payments: Json
          recorded_by_name: string
          reference_code: string
          total: number
        }[]
      }
      get_owner_overview: {
        Args: never
        Returns: {
          active_products: number
          active_services: number
          clients: number
          collected: number
          open_transactions: number
          today_transactions: number
          waiver_template_version: number
        }[]
      }
      get_recoverable_waiver_signing: {
        Args: { target_transaction_id: string }
        Returns: {
          client_name: string
          created_at: string
          event_id: string
          id: string
          reference_code: string
          signed_at: string
          template_body: string
          template_id: string
          template_version: number
          total: number
        }[]
      }
      get_report_summary: {
        Args: { from_date: string; to_date: string }
        Returns: {
          average_customer_visits_per_day: number
          average_transaction_value: number
          completed_transactions: number
          peak_hour: number
          peak_hour_average: number
          product_attach_rate: number
          repeat_client_rate: number
          repeat_clients: number
          revenue: number
          service_transactions: number
          unique_clients: number
        }[]
      }
      get_report_top_services: {
        Args: { from_date: string; to_date: string }
        Returns: {
          completed_quantity: number
          revenue: number
          service_id: string
          service_name: string
          service_share: number
        }[]
      }
      get_report_weekday_traffic: {
        Args: { from_date: string; to_date: string }
        Returns: {
          average_visits: number
          represented_days: number
          total_visits: number
          weekday: number
        }[]
      }
      get_sales_metrics: {
        Args: never
        Returns: {
          adjustments: number
          completed_transactions: number
          net_revenue: number
        }[]
      }
      get_transaction_waiver: {
        Args: { target_transaction_id: string }
        Returns: {
          id: string
          pdf_storage_path: string
          signature_storage_path: string
          signed_at: string
          template_version: number
        }[]
      }
      is_active_account: { Args: never; Returns: boolean }
      is_open_transaction: {
        Args: { target_transaction_id: string }
        Returns: boolean
      }
      is_owner: { Args: never; Returns: boolean }
      next_transaction_reference: { Args: never; Returns: string }
      piercer_is_assignable: {
        Args: {
          at_time: string
          selected_service_ids: string[]
          target_piercer_profile_id: string
        }
        Returns: boolean
      }
      prepare_waiver_signing: {
        Args: { target_transaction_id?: string }
        Returns: {
          client_name: string
          event_id: string
          expires_at: string
          template_body: string
          template_id: string
          template_version: number
          transaction_id: string
        }[]
      }
      record_product_sale: {
        Args: {
          client_details: Json
          payment_reference: string
          selected_payment_method: Database["public"]["Enums"]["payment_method"]
          selected_product_ids: string[]
        }
        Returns: {
          id: string
          reference_code: string
        }[]
      }
      replace_piercer_qualifications: {
        Args: {
          selected_service_ids: string[]
          target_piercer_profile_id: string
        }
        Returns: undefined
      }
      search_clients: {
        Args: { search_text?: string }
        Returns: {
          created_at: string | null
          created_by: string | null
          email: string | null
          full_name: string | null
          id: string | null
          last_activity: string | null
          phone: string | null
          transaction_count: number | null
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "client_summaries"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      search_completed_sales: {
        Args: {
          from_date?: string
          payment_method_filter?: Database["public"]["Enums"]["payment_method"]
          sale_type?: string
          search_text?: string
          to_date?: string
        }
        Returns: {
          adjustments: number
          client_name: string
          completed_at: string
          financial_status: string
          has_product: boolean
          has_service: boolean
          has_waiver: boolean
          id: string
          items: Json
          net_total: number
          paid: number
          payment_methods: string[]
          recorded_by_name: string
          reference_code: string
          total: number
        }[]
      }
      search_dashboard_transactions: {
        Args: { search_text?: string }
        Returns: {
          client_id: string
          client_name: string
          created_at: string
          has_waiver: boolean
          id: string
          items: Json
          payment_count: number
          recorded_by_name: string
          reference_code: string
          status: Database["public"]["Enums"]["transaction_status"]
          total: number
          updated_at: string
        }[]
      }
      update_client: {
        Args: {
          candidate_email?: string
          candidate_name: string
          candidate_phone?: string
          target_client_id: string
        }
        Returns: {
          created_at: string
          created_by: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "clients"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      account_status: "active" | "inactive"
      app_role: "owner" | "staff"
      payment_method:
        | "cash"
        | "gcash"
        | "maya"
        | "bank_transfer"
        | "card"
        | "other"
      studio_exception_type: "closed" | "reduced_hours"
      transaction_adjustment_type: "refund" | "void"
      transaction_item_type: "service" | "product"
      transaction_status: "pending" | "ongoing" | "completed" | "cancelled"
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
    Enums: {
      account_status: ["active", "inactive"],
      app_role: ["owner", "staff"],
      payment_method: [
        "cash",
        "gcash",
        "maya",
        "bank_transfer",
        "card",
        "other",
      ],
      studio_exception_type: ["closed", "reduced_hours"],
      transaction_adjustment_type: ["refund", "void"],
      transaction_item_type: ["service", "product"],
      transaction_status: ["pending", "ongoing", "completed", "cancelled"],
    },
  },
} as const
