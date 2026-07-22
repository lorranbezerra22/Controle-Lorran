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
      account_yields: {
        Row: {
          account_id: string
          amount: number
          created_at: string
          date: string
          description: string | null
          id: string
          updated_at: string
        }
        Insert: {
          account_id: string
          amount: number
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          amount?: number
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_yields_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          account_name: string
          balance: number
          bank: string | null
          created_at: string
          id: string
          updated_at: string
          user_id: string
          yield_percentage: number
        }
        Insert: {
          account_name: string
          balance?: number
          bank?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
          yield_percentage?: number
        }
        Update: {
          account_name?: string
          balance?: number
          bank?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
          yield_percentage?: number
        }
        Relationships: []
      }
      card_installment_payments: {
        Row: {
          account_id: string | null
          amount: number
          created_at: string
          id: string
          installment_id: string
          notes: string | null
          paid_at: string
          person: string | null
          transaction_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          created_at?: string
          id?: string
          installment_id: string
          notes?: string | null
          paid_at?: string
          person?: string | null
          transaction_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          created_at?: string
          id?: string
          installment_id?: string
          notes?: string | null
          paid_at?: string
          person?: string | null
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_installment_payments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_installment_payments_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "card_installments"
            referencedColumns: ["id"]
          },
        ]
      }
      card_installments: {
        Row: {
          amount: number
          card_id: string
          created_at: string
          due_at: string
          id: string
          import_batch_id: string | null
          installment_number: number
          notes: string | null
          paid_amount: number | null
          paid_by: string | null
          purchase_id: string
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          card_id: string
          created_at?: string
          due_at: string
          id?: string
          import_batch_id?: string | null
          installment_number: number
          notes?: string | null
          paid_amount?: number | null
          paid_by?: string | null
          purchase_id: string
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          card_id?: string
          created_at?: string
          due_at?: string
          id?: string
          import_batch_id?: string | null
          installment_number?: number
          notes?: string | null
          paid_amount?: number | null
          paid_by?: string | null
          purchase_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_installments_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_installments_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_installments_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "card_purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      card_purchases: {
        Row: {
          brand: string | null
          card_id: string
          category_id: string | null
          created_at: string
          description: string
          id: string
          import_batch_id: string | null
          installments_count: number
          person: string | null
          purchase_date: string
          total_amount: number
          user_id: string
        }
        Insert: {
          brand?: string | null
          card_id: string
          category_id?: string | null
          created_at?: string
          description: string
          id?: string
          import_batch_id?: string | null
          installments_count?: number
          person?: string | null
          purchase_date: string
          total_amount: number
          user_id: string
        }
        Update: {
          brand?: string | null
          card_id?: string
          category_id?: string | null
          created_at?: string
          description?: string
          id?: string
          import_batch_id?: string | null
          installments_count?: number
          person?: string | null
          purchase_date?: string
          total_amount?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_purchases_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_purchases_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_purchases_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      cards: {
        Row: {
          bank: string | null
          closing_day: number
          color: string | null
          created_at: string
          credit_limit: number
          due_day: number
          id: string
          last_digits: string | null
          metadata: Json | null
          name: string
          user_id: string
        }
        Insert: {
          bank?: string | null
          closing_day: number
          color?: string | null
          created_at?: string
          credit_limit?: number
          due_day: number
          id?: string
          last_digits?: string | null
          metadata?: Json | null
          name: string
          user_id: string
        }
        Update: {
          bank?: string | null
          closing_day?: number
          color?: string | null
          created_at?: string
          credit_limit?: number
          due_day?: number
          id?: string
          last_digits?: string | null
          metadata?: Json | null
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          budget: number | null
          created_at: string
          essential: boolean
          icon: string | null
          id: string
          kind: string
          name: string
          user_id: string
        }
        Insert: {
          budget?: number | null
          created_at?: string
          essential?: boolean
          icon?: string | null
          id?: string
          kind?: string
          name: string
          user_id: string
        }
        Update: {
          budget?: number | null
          created_at?: string
          essential?: boolean
          icon?: string | null
          id?: string
          kind?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      financial_request_history: {
        Row: {
          action: string
          changes: Json
          created_at: string
          id: string
          request_id: string
          user_id: string
        }
        Insert: {
          action: string
          changes?: Json
          created_at?: string
          id?: string
          request_id: string
          user_id: string
        }
        Update: {
          action?: string
          changes?: Json
          created_at?: string
          id?: string
          request_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_request_history_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "financial_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_requests: {
        Row: {
          ai_confidence: number | null
          ai_reason: string | null
          amount: number
          approved_transaction_id: string | null
          attachments: Json
          created_at: string
          description: string
          due_at: string | null
          id: string
          import_batch_id: string | null
          installments_count: number
          is_recurring: boolean
          kind: string
          notes: string | null
          person: string | null
          posted_at: string | null
          purchase_date: string | null
          recurring_day: number | null
          rejected_reason: string | null
          source: string
          splits: Json
          status: string
          suggested_account_id: string | null
          suggested_card_id: string | null
          suggested_category_id: string | null
          tags: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_confidence?: number | null
          ai_reason?: string | null
          amount: number
          approved_transaction_id?: string | null
          attachments?: Json
          created_at?: string
          description: string
          due_at?: string | null
          id?: string
          import_batch_id?: string | null
          installments_count?: number
          is_recurring?: boolean
          kind?: string
          notes?: string | null
          person?: string | null
          posted_at?: string | null
          purchase_date?: string | null
          recurring_day?: number | null
          rejected_reason?: string | null
          source?: string
          splits?: Json
          status?: string
          suggested_account_id?: string | null
          suggested_card_id?: string | null
          suggested_category_id?: string | null
          tags?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_confidence?: number | null
          ai_reason?: string | null
          amount?: number
          approved_transaction_id?: string | null
          attachments?: Json
          created_at?: string
          description?: string
          due_at?: string | null
          id?: string
          import_batch_id?: string | null
          installments_count?: number
          is_recurring?: boolean
          kind?: string
          notes?: string | null
          person?: string | null
          posted_at?: string | null
          purchase_date?: string | null
          recurring_day?: number | null
          rejected_reason?: string | null
          source?: string
          splits?: Json
          status?: string
          suggested_account_id?: string | null
          suggested_card_id?: string | null
          suggested_category_id?: string | null
          tags?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_requests_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_requests_suggested_account_id_fkey"
            columns: ["suggested_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_requests_suggested_card_id_fkey"
            columns: ["suggested_card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_requests_suggested_category_id_fkey"
            columns: ["suggested_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      global_settings: {
        Row: {
          id: string
          key: string
          updated_at: string | null
          value: string | null
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string | null
          value?: string | null
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string | null
          value?: string | null
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          created_at: string
          id: string
          source_filename: string | null
          summary: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          source_filename?: string | null
          summary?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          source_filename?: string | null
          summary?: Json
          user_id?: string
        }
        Relationships: []
      }
      loan_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          loan_id: string
          notes: string | null
          paid_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          loan_id: string
          notes?: string | null
          paid_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          loan_id?: string
          notes?: string | null
          paid_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_payments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          borrower_name: string
          card_cost: number
          cost_basis: number | null
          created_at: string
          due_date: string | null
          fixed_rate: number
          funding_source: string
          id: string
          installments: number
          interest_rate: number
          interest_type: string
          notes: string | null
          potential_gain: number
          principal: number
          start_date: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          borrower_name: string
          card_cost?: number
          cost_basis?: number | null
          created_at?: string
          due_date?: string | null
          fixed_rate?: number
          funding_source?: string
          id?: string
          installments?: number
          interest_rate?: number
          interest_type?: string
          notes?: string | null
          potential_gain?: number
          principal: number
          start_date?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          borrower_name?: string
          card_cost?: number
          cost_basis?: number | null
          created_at?: string
          due_date?: string | null
          fixed_rate?: number
          funding_source?: string
          id?: string
          installments?: number
          interest_rate?: number
          interest_type?: string
          notes?: string | null
          potential_gain?: number
          principal?: number
          start_date?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      milhas_earnings: {
        Row: {
          bonus_percent: number | null
          cost: number | null
          created_at: string
          id: string
          month: string
          note: string | null
          parity: number | null
          points: number
          program_id: string
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bonus_percent?: number | null
          cost?: number | null
          created_at?: string
          id?: string
          month: string
          note?: string | null
          parity?: number | null
          points?: number
          program_id: string
          source: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bonus_percent?: number | null
          cost?: number | null
          created_at?: string
          id?: string
          month?: string
          note?: string | null
          parity?: number | null
          points?: number
          program_id?: string
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "milhas_earnings_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "milhas_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      milhas_programs: {
        Row: {
          balance: number
          category: string
          color: string
          created_at: string
          id: string
          monthly_goal: number | null
          name: string
          updated_at: string
          user_id: string
          value_per_thousand: number
        }
        Insert: {
          balance?: number
          category: string
          color?: string
          created_at?: string
          id?: string
          monthly_goal?: number | null
          name: string
          updated_at?: string
          user_id: string
          value_per_thousand?: number
        }
        Update: {
          balance?: number
          category?: string
          color?: string
          created_at?: string
          id?: string
          monthly_goal?: number | null
          name?: string
          updated_at?: string
          user_id?: string
          value_per_thousand?: number
        }
        Relationships: []
      }
      milhas_redemptions: {
        Row: {
          cash_equivalent: number | null
          cash_value: number | null
          created_at: string
          date: string
          destination: string | null
          id: string
          miles_cost: number | null
          note: string | null
          points: number
          program_id: string
          screenshot_url: string | null
          taxes: number | null
          travel_date: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cash_equivalent?: number | null
          cash_value?: number | null
          created_at?: string
          date: string
          destination?: string | null
          id?: string
          miles_cost?: number | null
          note?: string | null
          points?: number
          program_id: string
          screenshot_url?: string | null
          taxes?: number | null
          travel_date?: string | null
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cash_equivalent?: number | null
          cash_value?: number | null
          created_at?: string
          date?: string
          destination?: string | null
          id?: string
          miles_cost?: number | null
          note?: string | null
          points?: number
          program_id?: string
          screenshot_url?: string | null
          taxes?: number | null
          travel_date?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "milhas_redemptions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "milhas_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      milhas_transfers: {
        Row: {
          bonus_percent: number
          cash_value: number
          created_at: string
          date: string
          from_program_id: string
          id: string
          note: string | null
          points_received: number
          points_sent: number
          to_program_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bonus_percent?: number
          cash_value?: number
          created_at?: string
          date: string
          from_program_id: string
          id?: string
          note?: string | null
          points_received?: number
          points_sent?: number
          to_program_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bonus_percent?: number
          cash_value?: number
          created_at?: string
          date?: string
          from_program_id?: string
          id?: string
          note?: string | null
          points_received?: number
          points_sent?: number
          to_program_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "milhas_transfers_from_program_id_fkey"
            columns: ["from_program_id"]
            isOneToOne: false
            referencedRelation: "milhas_programs"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          content: string
          created_at: string
          id: string
          pinned: boolean
          sheet_data: Json | null
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          pinned?: boolean
          sheet_data?: Json | null
          title?: string
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          pinned?: boolean
          sheet_data?: Json | null
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      people: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          phone: string | null
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      recurring_rules: {
        Row: {
          active: boolean
          amount: number
          category_id: string | null
          created_at: string
          day_of_month: number
          description: string
          id: string
          import_batch_id: string | null
          kind: string
          notes: string | null
          person: string | null
          start_month: string
          user_id: string
        }
        Insert: {
          active?: boolean
          amount: number
          category_id?: string | null
          created_at?: string
          day_of_month: number
          description: string
          id?: string
          import_batch_id?: string | null
          kind?: string
          notes?: string | null
          person?: string | null
          start_month?: string
          user_id: string
        }
        Update: {
          active?: boolean
          amount?: number
          category_id?: string | null
          created_at?: string
          day_of_month?: number
          description?: string
          id?: string
          import_batch_id?: string | null
          kind?: string
          notes?: string | null
          person?: string | null
          start_month?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_rules_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_access_members: {
        Row: {
          added_at: string
          user_id: string
        }
        Insert: {
          added_at?: string
          user_id: string
        }
        Update: {
          added_at?: string
          user_id?: string
        }
        Relationships: []
      }
      transaction_adjustments: {
        Row: {
          amount: number
          created_at: string
          id: string
          person: string
          transaction_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          person: string
          transaction_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          person?: string
          transaction_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_adjustments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string | null
          account_tayane_id: string | null
          amount: number
          card_id: string | null
          card_installment_id: string | null
          category_id: string | null
          created_at: string
          description: string
          due_at: string
          id: string
          import_batch_id: string | null
          is_fixed: boolean
          kind: string
          notes: string | null
          paid_by: string | null
          person: string | null
          posted_at: string
          rule_id: string | null
          rule_month: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          account_tayane_id?: string | null
          amount: number
          card_id?: string | null
          card_installment_id?: string | null
          category_id?: string | null
          created_at?: string
          description: string
          due_at: string
          id?: string
          import_batch_id?: string | null
          is_fixed?: boolean
          kind: string
          notes?: string | null
          paid_by?: string | null
          person?: string | null
          posted_at: string
          rule_id?: string | null
          rule_month?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          account_tayane_id?: string | null
          amount?: number
          card_id?: string | null
          card_installment_id?: string | null
          category_id?: string | null
          created_at?: string
          description?: string
          due_at?: string
          id?: string
          import_batch_id?: string | null
          is_fixed?: boolean
          kind?: string
          notes?: string | null
          paid_by?: string | null
          person?: string | null
          posted_at?: string
          rule_id?: string | null
          rule_month?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_account_tayane_id_fkey"
            columns: ["account_tayane_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_card_installment_id_fkey"
            columns: ["card_installment_id"]
            isOneToOne: false
            referencedRelation: "card_installments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "recurring_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_legs: {
        Row: {
          aircraft: string | null
          airline: string | null
          arrival_at: string | null
          class: string | null
          cost_per_thousand: number | null
          created_at: string
          days: number | null
          departure_at: string | null
          destination_iata: string
          emitted: boolean
          flight_time: string | null
          id: string
          origin_iata: string
          pax: number | null
          plan_id: string
          points_qty: number | null
          position: number
          program: string | null
          taxes: number | null
          total: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          aircraft?: string | null
          airline?: string | null
          arrival_at?: string | null
          class?: string | null
          cost_per_thousand?: number | null
          created_at?: string
          days?: number | null
          departure_at?: string | null
          destination_iata: string
          emitted?: boolean
          flight_time?: string | null
          id?: string
          origin_iata: string
          pax?: number | null
          plan_id: string
          points_qty?: number | null
          position?: number
          program?: string | null
          taxes?: number | null
          total?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          aircraft?: string | null
          airline?: string | null
          arrival_at?: string | null
          class?: string | null
          cost_per_thousand?: number | null
          created_at?: string
          days?: number | null
          departure_at?: string | null
          destination_iata?: string
          emitted?: boolean
          flight_time?: string | null
          id?: string
          origin_iata?: string
          pax?: number | null
          plan_id?: string
          points_qty?: number | null
          position?: number
          program?: string | null
          taxes?: number | null
          total?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "travel_legs_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "travel_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      travel_plans: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          notes: string | null
          start_date: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          start_date?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          notes?: string | null
          start_date?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_view: { Args: { row_uid: string }; Returns: boolean }
      generate_recurrences: {
        Args: { target_month: number; target_year: number }
        Returns: number
      }
      is_lorran_or_tayane: { Args: { u_id: string }; Returns: boolean }
      is_shared: { Args: { u_id: string }; Returns: boolean }
      signup_allowed: { Args: never; Returns: boolean }
      sync_auto_yield_transaction: {
        Args: { p_account_id: string; p_month: string }
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
