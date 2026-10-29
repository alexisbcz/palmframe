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
          created_at: string
        }
        Insert: never
        Update: never
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
  created_at: string
  updated_at: string
}

// What the pages know about the signed-in person.
export interface Viewer {
  id: string
  email: string
  name: string
}

export const COMICS_BUCKET = "comics"
