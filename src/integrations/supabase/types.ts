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
      order_status_history: {
        Row: {
          actor: string
          created_at: string
          id: string
          note: string
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          actor?: string
          created_at?: string
          id?: string
          note?: string
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          actor?: string
          created_at?: string
          id?: string
          note?: string
          order_id?: string
          status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount_nio: number
          cost_nio: number
          created_at: string
          customer_name: string
          customer_phone: string
          id: string
          order_code: string
          pack_id: string
          pack_label: string
          pack_sku: string
          paid_with_balance: boolean
          payment_method_code: string | null
          player_id: string
          product_id: string
          product_name: string
          profit_nio: number | null
          provider: string
          provider_order_id: string | null
          provider_response: Json | null
          status: Database["public"]["Enums"]["order_status"]
          status_reason: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount_nio: number
          cost_nio?: number
          created_at?: string
          customer_name?: string
          customer_phone?: string
          id?: string
          order_code?: string
          pack_id?: string
          pack_label?: string
          pack_sku?: string
          paid_with_balance?: boolean
          payment_method_code?: string | null
          player_id?: string
          product_id: string
          product_name: string
          profit_nio?: number | null
          provider?: string
          provider_order_id?: string | null
          provider_response?: Json | null
          status?: Database["public"]["Enums"]["order_status"]
          status_reason?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount_nio?: number
          cost_nio?: number
          created_at?: string
          customer_name?: string
          customer_phone?: string
          id?: string
          order_code?: string
          pack_id?: string
          pack_label?: string
          pack_sku?: string
          paid_with_balance?: boolean
          payment_method_code?: string | null
          player_id?: string
          product_id?: string
          product_name?: string
          profit_nio?: number | null
          provider?: string
          provider_order_id?: string | null
          provider_response?: Json | null
          status?: Database["public"]["Enums"]["order_status"]
          status_reason?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          account_number: string
          code: string
          created_at: string
          enabled: boolean
          holder: string
          id: string
          name: string
          note: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          account_number?: string
          code: string
          created_at?: string
          enabled?: boolean
          holder?: string
          id?: string
          name: string
          note?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          account_number?: string
          code?: string
          created_at?: string
          enabled?: boolean
          holder?: string
          id?: string
          name?: string
          note?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      payment_receipts: {
        Row: {
          ai_raw: Json | null
          ai_reason: string
          ai_verdict: string
          confidence: number | null
          created_at: string
          declared_amount_nio: number | null
          detected_amount_nio: number | null
          detected_bank: string | null
          detected_date: string | null
          detected_reference: string | null
          id: string
          order_id: string
          storage_path: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          ai_raw?: Json | null
          ai_reason?: string
          ai_verdict?: string
          confidence?: number | null
          created_at?: string
          declared_amount_nio?: number | null
          detected_amount_nio?: number | null
          detected_bank?: string | null
          detected_date?: string | null
          detected_reference?: string | null
          id?: string
          order_id: string
          storage_path: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          ai_raw?: Json | null
          ai_reason?: string
          ai_verdict?: string
          confidence?: number | null
          created_at?: string
          declared_amount_nio?: number | null
          detected_amount_nio?: number | null
          detected_bank?: string | null
          detected_date?: string | null
          detected_reference?: string | null
          id?: string
          order_id?: string
          storage_path?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_receipts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      raffle_winners: {
        Row: {
          amount_nio: number
          created_at: string
          created_by: string | null
          email: string
          full_name: string
          id: string
          participants: number
          user_id: string
          week_end: string
          week_start: string
        }
        Insert: {
          amount_nio?: number
          created_at?: string
          created_by?: string | null
          email?: string
          full_name?: string
          id?: string
          participants?: number
          user_id: string
          week_end: string
          week_start: string
        }
        Update: {
          amount_nio?: number
          created_at?: string
          created_by?: string | null
          email?: string
          full_name?: string
          id?: string
          participants?: number
          user_id?: string
          week_end?: string
          week_start?: string
        }
        Relationships: []
      }
      stock_accounts: {
        Row: {
          assigned_at: string | null
          assigned_user_id: string | null
          created_at: string
          email: string
          expires_at: string | null
          id: string
          notes: string
          order_id: string | null
          password: string
          pin: string
          profile: string
          service: string
          status: Database["public"]["Enums"]["stock_status"]
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_user_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string | null
          id?: string
          notes?: string
          order_id?: string | null
          password?: string
          pin?: string
          profile?: string
          service: string
          status?: Database["public"]["Enums"]["stock_status"]
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_user_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string | null
          id?: string
          notes?: string
          order_id?: string | null
          password?: string
          pin?: string
          profile?: string
          service?: string
          status?: Database["public"]["Enums"]["stock_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_accounts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          account_email: string
          account_id: string | null
          action: Database["public"]["Enums"]["stock_action"]
          admin_id: string | null
          created_at: string
          id: string
          note: string
          order_code: string
          order_id: string | null
          product_name: string
          service: string
          status_after: Database["public"]["Enums"]["stock_status"] | null
          status_before: Database["public"]["Enums"]["stock_status"] | null
          user_id: string | null
        }
        Insert: {
          account_email?: string
          account_id?: string | null
          action: Database["public"]["Enums"]["stock_action"]
          admin_id?: string | null
          created_at?: string
          id?: string
          note?: string
          order_code?: string
          order_id?: string | null
          product_name?: string
          service?: string
          status_after?: Database["public"]["Enums"]["stock_status"] | null
          status_before?: Database["public"]["Enums"]["stock_status"] | null
          user_id?: string | null
        }
        Update: {
          account_email?: string
          account_id?: string | null
          action?: Database["public"]["Enums"]["stock_action"]
          admin_id?: string | null
          created_at?: string
          id?: string
          note?: string
          order_code?: string
          order_id?: string | null
          product_name?: string
          service?: string
          status_after?: Database["public"]["Enums"]["stock_status"] | null
          status_before?: Database["public"]["Enums"]["stock_status"] | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "stock_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      store_settings: {
        Row: {
          data: Json
          id: string
          updated_at: string
        }
        Insert: {
          data?: Json
          id?: string
          updated_at?: string
        }
        Update: {
          data?: Json
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      topup_requests: {
        Row: {
          ai_amount_nio: number | null
          ai_bank: string
          ai_confidence: number
          ai_date: string
          ai_notes: string
          ai_reference: string
          ai_verdict: string
          amount_nio: number
          auto_source: string
          created_at: string
          external_tx_id: string | null
          id: string
          method_code: string
          method_name: string
          receipt_path: string
          reference: string
          review_reason: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["topup_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_amount_nio?: number | null
          ai_bank?: string
          ai_confidence?: number
          ai_date?: string
          ai_notes?: string
          ai_reference?: string
          ai_verdict?: string
          amount_nio: number
          auto_source?: string
          created_at?: string
          external_tx_id?: string | null
          id?: string
          method_code?: string
          method_name?: string
          receipt_path?: string
          reference?: string
          review_reason?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["topup_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_amount_nio?: number | null
          ai_bank?: string
          ai_confidence?: number
          ai_date?: string
          ai_notes?: string
          ai_reference?: string
          ai_verdict?: string
          amount_nio?: number
          auto_source?: string
          created_at?: string
          external_tx_id?: string | null
          id?: string
          method_code?: string
          method_name?: string
          receipt_path?: string
          reference?: string
          review_reason?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["topup_status"]
          updated_at?: string
          user_id?: string
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
      wallet_transactions: {
        Row: {
          amount_nio: number
          balance_after: number
          balance_before: number
          created_at: string
          created_by: string | null
          description: string
          id: string
          order_id: string | null
          reference: string
          status: string
          topup_request_id: string | null
          type: Database["public"]["Enums"]["wallet_tx_type"]
          user_id: string
        }
        Insert: {
          amount_nio: number
          balance_after: number
          balance_before: number
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          order_id?: string | null
          reference?: string
          status?: string
          topup_request_id?: string | null
          type: Database["public"]["Enums"]["wallet_tx_type"]
          user_id: string
        }
        Update: {
          amount_nio?: number
          balance_after?: number
          balance_before?: number
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          order_id?: string | null
          reference?: string
          status?: string
          topup_request_id?: string | null
          type?: Database["public"]["Enums"]["wallet_tx_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance_nio: number
          created_at: string
          total_spent_nio: number
          total_topped_up_nio: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance_nio?: number
          created_at?: string
          total_spent_nio?: number
          total_topped_up_nio?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance_nio?: number
          created_at?: string
          total_spent_nio?: number
          total_topped_up_nio?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          order_id: string | null
          payload: Json
          processed: boolean
          provider: string
          provider_order_id: string | null
        }
        Insert: {
          created_at?: string
          event_type?: string
          id?: string
          order_id?: string | null
          payload?: Json
          processed?: boolean
          provider?: string
          provider_order_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          order_id?: string | null
          payload?: Json
          processed?: boolean
          provider?: string
          provider_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_wallet_transaction: {
        Args: {
          _amount: number
          _created_by?: string
          _description?: string
          _order_id?: string
          _reference?: string
          _topup_request_id?: string
          _type: Database["public"]["Enums"]["wallet_tx_type"]
          _user_id: string
        }
        Returns: {
          amount_nio: number
          balance_after: number
          balance_before: number
          created_at: string
          created_by: string | null
          description: string
          id: string
          order_id: string | null
          reference: string
          status: string
          topup_request_id: string | null
          type: Database["public"]["Enums"]["wallet_tx_type"]
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "wallet_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      claim_stock_account: {
        Args: {
          _order_id: string
          _product_name?: string
          _service: string
          _user_id: string
        }
        Returns: {
          assigned_at: string | null
          assigned_user_id: string | null
          created_at: string
          email: string
          expires_at: string | null
          id: string
          notes: string
          order_id: string | null
          password: string
          pin: string
          profile: string
          service: string
          status: Database["public"]["Enums"]["stock_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "stock_accounts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      order_status:
        | "pending_payment"
        | "receipt_review"
        | "payment_rejected"
        | "payment_approved"
        | "provider_processing"
        | "completed"
        | "failed"
        | "refunded"
      stock_action:
        | "created"
        | "updated"
        | "status_changed"
        | "delivered"
        | "deleted"
      stock_status: "available" | "reserved" | "sold" | "suspended" | "expired"
      topup_status: "pending" | "approved" | "rejected" | "cancelled"
      wallet_tx_type: "topup" | "purchase" | "refund" | "bonus" | "adjustment"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "user"],
      order_status: [
        "pending_payment",
        "receipt_review",
        "payment_rejected",
        "payment_approved",
        "provider_processing",
        "completed",
        "failed",
        "refunded",
      ],
      stock_action: [
        "created",
        "updated",
        "status_changed",
        "delivered",
        "deleted",
      ],
      stock_status: ["available", "reserved", "sold", "suspended", "expired"],
      topup_status: ["pending", "approved", "rejected", "cancelled"],
      wallet_tx_type: ["topup", "purchase", "refund", "bonus", "adjustment"],
    },
  },
} as const
