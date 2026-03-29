import { createClient } from '@supabase/supabase-js';
import { detectBrand } from './brandConfig';

/**
 * Supabase (VEOLY-AI build)
 *
 * Manual update when the VEOLY-AI Supabase project is ready:
 * 1) Default URL below (`veoly.url`): replace `https://supa.monoklix.com` with your project URL, e.g. `https://supa.veoly-ai.com`
 *    (or the official Supabase subdomain `https://xxxxx.supabase.co`).
 * 2) Default anon key (`DEFAULT_ANON` / `veoly.anonKey`): use the correct VEOLY-AI project `anon` key.
 * 3) Prefer setting secrets in `.env` so they are not committed:
 *      VITE_SUPABASE_URL=...
 *      VITE_SUPABASE_ANON_KEY=...
 *    Environment values always override the defaults here.
 *
 * Until migration: still using MONOKLIX Supabase (`supa.monoklix.com`) as below.
 */
const env = import.meta.env as { VITE_SUPABASE_URL?: string; VITE_SUPABASE_ANON_KEY?: string };

/** Demo placeholder — replace when moving to production Supabase (see notes above). */
const DEFAULT_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE';

const SUPABASE_CONFIGS = {
  veoly: {
    // TODO(VEOLY-AI): change default URL on migration — temporary MONOKLIX
    url: env.VITE_SUPABASE_URL || 'https://supa.monoklix.com',
    anonKey: env.VITE_SUPABASE_ANON_KEY || DEFAULT_ANON,
  },
};

const currentBrand = detectBrand();
const config = SUPABASE_CONFIGS[currentBrand];

// Define types for your database for type-safe queries
export interface Database {
  public: {
    Tables: {
      master_api_key: {
        Row: {
          id: number
          created_at: string
          api_key: string
        }
        Insert: {
          id?: number
          created_at?: string
          api_key: string
        }
        Update: {
          api_key?: string
        }
        Relationships: []
      }
      token_new_active: {
        Row: {
          id: number
          created_at: string
          token: string
          status: string | null
          total_user: number | null
        }
        Insert: {
          id?: number
          created_at?: string
          token: string
          status?: string | null
          total_user?: number | null
        }
        Update: {
          token?: string
          status?: string | null
          total_user?: number | null
        }
        Relationships: []
      }
      token_imagen_only_active: {
        Row: {
          id: number
          created_at: string
          token: string
          status: string | null
          total_user: number | null
        }
        Insert: {
          id?: number
          created_at?: string
          token: string
          status?: string | null
          total_user?: number | null
        }
        Update: {
          token?: string
          status?: string | null
          total_user?: number | null
        }
        Relationships: []
      }
      users: {
        Row: { // The data coming from the database
          id: string
          created_at: string
          full_name: string | null
          email: string
          phone: string
          // FIX: Use string literals instead of circular enum reference for correct type inference
          // UPDATED: Added special_user
          role: 'admin' | 'user' | 'special_user'
          // FIX: Use string literals to include 'subscription' and 'trial' statuses
          status: 'pending_payment' | 'inactive' | 'lifetime' | 'admin' | 'subscription' | 'trial'
          api_key: string | null
          avatar_url: string | null
          subscription_expiry: string | null
          total_image: number | null
          total_video: number | null
          last_seen_at: string | null
          force_logout_at: string | null
          app_version: string | null
          personal_auth_token: string | null
          personal_auth_token_updated_at: string | null
          proxy_server: string | null
          batch_02: string | null
          last_device: string | null
          telegram_id: string | null
          recaptcha_token: string | null
          email_code: string | null
          /** Optional per-user code issued by admin; login requires a match when set (see loginUser). */
          access_code: string | null
          // NEW COLUMNS (from Supabase schema):
          cookie_file: string | null
          cookie_files: string[] | null // jsonb array
          notes: string | null
          webhook_url: string | null
          usage_count: number | null
          last_used: string | null // timestamptz (different from last_seen_at)
          registered_at: string | null // timestamptz
          expires_at: string | null // timestamptz — Token Ultra + package credit validity
          credit_balance: number | null
          flow_account_code: string | null // Different from email_code
          token_ultra_status: 'active' | 'expired' | 'expiring_soon' | null // Token Ultra subscription status
          allow_master_token: boolean | null // Whether user can use master recaptcha token (null = true by default)
        }
        Insert: { // The data you can insert
          id?: string // id is auto-generated
          created_at?: string
          full_name?: string | null
          email: string
          phone: string
          // FIX: Use string literals to include 'subscription' and 'trial' statuses
          role?: 'admin' | 'user' | 'special_user'
          // FIX: Use string literals to include 'subscription' and 'trial' statuses
          status?: 'pending_payment' | 'inactive' | 'lifetime' | 'admin' | 'subscription' | 'trial'
          api_key?: string | null
          avatar_url?: string | null
          subscription_expiry?: string | null
          total_image?: number | null
          total_video?: number | null
          last_seen_at?: string | null
          force_logout_at?: string | null
          app_version?: string | null
          personal_auth_token?: string | null
          personal_auth_token_updated_at?: string | null
          proxy_server?: string | null
          batch_02?: string | null
          last_device?: string | null
          telegram_id?: string | null
          recaptcha_token?: string | null
          email_code?: string | null
          access_code?: string | null
          // NEW COLUMNS (from Supabase schema):
          cookie_file?: string | null
          cookie_files?: string[] | null
          notes?: string | null
          webhook_url?: string | null
          usage_count?: number | null
          last_used?: string | null
          registered_at?: string | null
          expires_at?: string | null
          credit_balance?: number | null
          flow_account_code?: string | null
        }
        Update: { // The data you can update
          full_name?: string | null
          email?: string
          phone?: string
          // FIX: Use string literals to include 'subscription' and 'trial' statuses
          role?: 'admin' | 'user' | 'special_user'
          // FIX: Use string literals to include 'subscription' and 'trial' statuses
          status?: 'pending_payment' | 'inactive' | 'lifetime' | 'admin' | 'subscription' | 'trial'
          api_key?: string | null
          avatar_url?: string | null
          subscription_expiry?: string | null
          total_image?: number | null
          total_video?: number | null
          last_seen_at?: string | null
          force_logout_at?: string | null
          app_version?: string | null
          personal_auth_token?: string | null
          personal_auth_token_updated_at?: string | null
          proxy_server?: string | null
          batch_02?: string | null
          last_device?: string | null
          telegram_id?: string | null
          recaptcha_token?: string | null
          email_code?: string | null
          access_code?: string | null
          // NEW COLUMNS (from Supabase schema):
          cookie_file?: string | null
          cookie_files?: string[] | null
          notes?: string | null
          webhook_url?: string | null
          usage_count?: number | null
          last_used?: string | null
          registered_at?: string | null
          expires_at?: string | null
          credit_balance?: number | null
          flow_account_code?: string | null
          token_ultra_status?: 'active' | 'expired' | 'expiring_soon' | null
          allow_master_token?: boolean | null
        }
        // FIX: Added Relationships array to fix Supabase type inference issues, resolving 'never' types.
        Relationships: []
      }
      activity_log: {
        Row: {
          id: number
          created_at: string
          user_id: string
          activity_type: string
          username: string | null
          email: string | null
          // New structured fields
          model: string | null
          prompt: string | null
          output: string | null
          token_count: number | null
          status: string | null
          error_message: string | null
        }
        Insert: {
          id?: number
          created_at?: string
          user_id: string
          username: string
          email: string
          activity_type: string
          // New structured fields (all optional)
          model?: string | null
          prompt?: string | null
          output?: string | null
          token_count?: number | null
          status?: string | null
          error_message?: string | null
        }
        Update: {}
        Relationships: [
          {
            foreignKeyName: 'activity_log_user_id_fkey'
            columns: ['user_id']
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }
      prompt_viral_my: {
        Row: {
          id: number
          created_at: string
          title: string
          author: string
          image_url: string
          prompt: string
        }
        Insert: {
          id?: number
          created_at?: string
          title: string
          author: string
          image_url: string
          prompt: string
        }
        Update: {
          title?: string
          author?: string
          image_url?: string
          prompt?: string
        }
        Relationships: []
      }
      proxy_server_throttle: {
        Row: {
          id: number;
          server_url: string;
          last_acquired_at: string;
        };
        Insert: {
          id?: number;
          server_url: string;
          last_acquired_at?: string;
        };
        Update: {
          id?: number;
          server_url?: string;
          last_acquired_at?: string;
        };
        Relationships: [];
      }
      proxy_servers: {
        Row: {
          id: number
          created_at: string
          url: string
          status: 'active' | 'maintenance' | 'disabled'
          region: string | null
        }
        Insert: {
          id?: number
          created_at?: string
          url: string
          status?: 'active' | 'maintenance' | 'disabled'
          region?: string | null
        }
        Update: {
          url?: string
          status?: 'active' | 'maintenance' | 'disabled'
          region?: string | null
        }
        Relationships: []
      }
      master_recaptcha_tokens: {
        Row: {
          id: number
          api_key: string
          status: 'active' | 'inactive'
          description: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          api_key: string
          status?: 'active' | 'inactive'
          description?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          api_key?: string
          status?: 'active' | 'inactive'
          description?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      ultra_ai_email_pool: {
        Row: {
          id: number
          email: string
          password: string
          code: string
          current_users_count: number
          status: 'active' | 'inactive'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          email: string
          password: string
          code: string
          current_users_count?: number
          status?: 'active' | 'inactive'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          email?: string
          password?: string
          code?: string
          current_users_count?: number
          status?: 'active' | 'inactive'
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      api_requests: {
        Row: {
          id: number
          email: string
          user_id: string | null
          status: 'success' | 'failed'
          error_message: string | null
          credits: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          email: string
          user_id?: string | null
          status: 'success' | 'failed'
          error_message?: string | null
          credits?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          email?: string
          user_id?: string | null
          status?: 'success' | 'failed'
          error_message?: string | null
          credits?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'fk_api_requests_user_id'
            columns: ['user_id']
            referencedRelation: 'users'
            referencedColumns: ['id']
          }
        ]
      }
      cookie_usage_stats: {
        Row: {
          cookie_filename: string
          usage_count: number
          last_used: string | null
          first_used: string | null
          flow_account_code: string | null
          total_tokens_generated: number
          created_at: string
          updated_at: string
        }
        Insert: {
          cookie_filename: string
          usage_count?: number
          last_used?: string | null
          first_used?: string | null
          flow_account_code?: string | null
          total_tokens_generated?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          cookie_filename?: string
          usage_count?: number
          last_used?: string | null
          first_used?: string | null
          flow_account_code?: string | null
          total_tokens_generated?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      request_generation_slot: {
        Args: {
          cooldown_seconds: number
          server_url: string
        }
        Returns: boolean
      }
      increment_token_if_available: {
        Args: {
          token_to_check: string;
        };
        Returns: boolean;
      };
      increment_imagen_token_if_available: {
        Args: {
          token_to_check: string;
        };
        Returns: boolean;
      };
    }
    Enums: {
      user_role: 'admin' | 'user' | 'special_user'
      user_status: 'pending_payment' | 'inactive' | 'lifetime' | 'admin' | 'subscription' | 'trial'
      proxy_server_status: 'active' | 'maintenance' | 'disabled'
    }
    CompositeTypes: {}
  }
}

// Create Supabase client with brand-specific config
export const supabase = createClient<Database>(config.url, config.anonKey);