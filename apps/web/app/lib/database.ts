import type { ComicProject } from "@/components/comic-canvas/model"

import type { SubscriptionCache } from "./credits"

// The slice of the shared database this app uses. The other tables belong
// to the palmframe editor.
export interface Database {
  public: {
    Tables: {
      comic_projects: {
        Row: ComicProjectRow
        Insert: {
          id?: string
          user_id?: string
          title?: string
          data: ComicProject
          cover?: string | null
          revision?: number
        }
        Update: {
          title?: string
          data?: ComicProject
          cover?: string | null
          revision?: number
          share_token?: string | null
        }
        Relationships: []
      }
      billing_customers: {
        Row: {
          user_id: string
          stripe_customer_id: string
          subscription: SubscriptionCache
          synced_at: string | null
          created_at: string
        }
        Insert: {
          user_id: string
          stripe_customer_id: string
          subscription?: SubscriptionCache
          synced_at?: string | null
        }
        Update: {
          subscription?: SubscriptionCache
          synced_at?: string | null
        }
        Relationships: []
      }
      credit_ledger: {
        Row: {
          id: number
          user_id: string
          delta: number
          kind: string
          ref: string | null
          idem_key: string
          key_id: string | null
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      api_keys: {
        Row: ApiKeyRow
        Insert: {
          name?: string
          prefix: string
          hash: string
          scopes?: string[]
          credit_limit?: number | null
          project_ids?: string[] | null
        }
        Update: {
          revoked_at?: string | null
          last_used_at?: string | null
          scopes?: string[]
          credit_limit?: number | null
          project_ids?: string[] | null
        }
        Relationships: []
      }
      api_jobs: {
        Row: ApiJobRow
        Insert: Omit<
          ApiJobRow,
          | "id"
          | "status"
          | "idempotency_key"
          | "result"
          | "error"
          | "started_at"
          | "finished_at"
          | "created_at"
          | "updated_at"
        >
        Update: Partial<
          Pick<
            ApiJobRow,
            | "status"
            | "idempotency_key"
            | "result"
            | "error"
            | "started_at"
            | "finished_at"
          >
        >
        Relationships: []
      }
      openrouter_connections: {
        Row: OpenRouterConnectionRow
        Insert: Omit<OpenRouterConnectionRow, "created_at" | "updated_at"> & {
          updated_at?: string
        }
        Update: Partial<Omit<OpenRouterConnectionRow, "user_id" | "created_at">>
        Relationships: []
      }
    }
    Views: {}
    Functions: {
      my_credits: { Args: Record<string, never>; Returns: number }
      spend_credits: {
        Args: { p_cost: number; p_kind: string; p_job: string }
        Returns: number
      }
      refund_credits: { Args: { p_job: string }; Returns: number }
      grant_credits: {
        Args: {
          p_user: string
          p_delta: number
          p_kind: string
          p_ref: string
          p_idem: string
        }
        Returns: boolean
      }
      credits_for: { Args: { p_user: string }; Returns: number }
      spend_credits_for: {
        Args: {
          p_user: string
          p_cost: number
          p_kind: string
          p_job: string
        }
        Returns: number
      }
      spend_credits_for_key: {
        Args: {
          p_user: string
          p_key: string
          p_cost: number
          p_kind: string
          p_job: string
        }
        Returns: number
      }
      refund_credits_for: {
        Args: { p_user: string; p_job: string }
        Returns: number
      }
    }
    Enums: {}
    CompositeTypes: {}
  }
}

export type ComicProjectRow = {
  id: string
  user_id: string
  title: string
  data: ComicProject
  cover: string | null
  revision: number
  slide_count: number
  // The secret part of the project's reader link; null when it has none.
  share_token: string | null
  created_at: string
  updated_at: string
}

// Developer API keys; only a hash of each is stored.
export type ApiKeyRow = {
  id: string
  user_id: string
  name: string
  prefix: string
  hash: string
  scopes: string[]
  credit_limit: number | null
  credits_spent: number
  project_ids: string[] | null
  last_used_at: string | null
  revoked_at: string | null
  created_at: string
}

export type ApiJobStatus =
  "estimated" | "queued" | "running" | "succeeded" | "failed" | "cancelled"

// An API estimate, and the job it becomes once started.
export type ApiJobRow = {
  id: string
  user_id: string
  key_id: string | null
  status: ApiJobStatus
  operation: string
  cost: number
  project_id: string
  page_id: string
  panel_id: string
  page_version: number
  params: Record<string, unknown>
  idempotency_key: string | null
  result: { image_url: string; seed: number; render_ms: number } | null
  error: string | null
  expires_at: string
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
}

// What the pages know about the signed-in person.
export interface Viewer {
  id: string
  email: string
  name: string
  // Public URL of their profile picture, if they set one.
  avatarUrl: string | null
}

export const COMICS_BUCKET = "comics"

export type OpenRouterConnectionRow = {
  user_id: string
  key_ciphertext: string
  key_hint: string
  enabled: boolean
  image_model: string
  text_model: string
  created_at: string
  updated_at: string
}
