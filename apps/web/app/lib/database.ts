import type { AgentMessage } from "@earendil-works/pi-agent-core"
import type {
  Character,
  ComicProject,
  WorldItem,
} from "@/components/comic-canvas/model"

import type { AssetPayload } from "@/components/catalog/model"

import type { SubscriptionCache } from "./credits"
import type {
  DeepDiveStatus,
  Fact,
  Finding,
  LogLine,
  Source,
} from "./deepdive/model"
import type { DetectorState } from "./machines/detect"
import type {
  Item,
  MachineConfig,
  MachineOutput,
  OutputPlatform,
  PostSource,
  PublishMode,
  PublishReceipt,
  Signal,
  SourceId,
} from "./machines/model"
import type { FormatId, Part } from "./media/model"
import type {
  Board,
  BrandColor,
  BrandFont,
  BrandLogo,
  StudioSource,
} from "./studio/model"

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
          series_id?: string | null
          series_position?: number | null
        }
        Update: {
          title?: string
          data?: ComicProject
          cover?: string | null
          revision?: number
          share_token?: string | null
          series_id?: string | null
          series_position?: number | null
        }
        Relationships: []
      }
      comic_machines: {
        Row: MachineRow
        Insert: {
          name: string
          source: SourceId
          config: MachineConfig
          publish_mode?: PublishMode
          outputs?: MachineOutput[]
          public?: boolean
          slug?: string | null
          next_run_at?: string | null
        }
        Update: {
          name?: string
          source?: SourceId
          config?: MachineConfig
          enabled?: boolean
          state?: DetectorState
          last_run_at?: string | null
          last_error?: string | null
          next_run_at?: string | null
          publish_mode?: PublishMode
          outputs?: MachineOutput[]
          public?: boolean
          slug?: string | null
          failures?: number
        }
        Relationships: []
      }
      comic_machine_drafts: {
        Row: MachineDraftRow
        Insert: {
          machine_id: string
          user_id?: string
          signal_id: string
          signal?: Signal | null
          text: string
          scene?: string
          alt?: string
          prompt?: string | null
          sources?: PostSource[]
          link?: string | null
          image_url?: string | null
          held?: string | null
          platform?: OutputPlatform | null
          status?: MachineDraftRow["status"]
        }
        Update: {
          status?: MachineDraftRow["status"]
          project_id?: string | null
          text?: string
          held?: string | null
          receipts?: PublishReceipt[]
          published_at?: string | null
        }
        Relationships: []
      }
      comic_machine_items: {
        Row: MachineItemRow
        Insert: Omit<MachineItemRow, "id" | "status" | "created_at"> & {
          status?: MachineItemRow["status"]
        }
        Update: { status?: MachineItemRow["status"] }
        Relationships: []
      }
      comic_deep_dives: {
        Row: DeepDiveRow
        Insert: {
          user_id: string
          lead: string
          job: string
          machine_id?: string | null
        }
        Update: Partial<Omit<DeepDiveRow, "id" | "user_id" | "lead" | "job">>
        Relationships: []
      }
      comic_media_renditions: {
        Row: MediaRenditionRow
        Insert: {
          user_id: string
          deep_dive_id: string
          format: FormatId
          job: string
          machine_id?: string | null
        }
        Update: Partial<
          Pick<
            MediaRenditionRow,
            | "status"
            | "title"
            | "parts"
            | "meta"
            | "findings"
            | "problems"
            | "attempts"
            | "leased_until"
          >
        >
        Relationships: []
      }
      comic_brand_kits: {
        Row: BrandKitRow
        Insert: Omit<BrandKitRow, "id" | "user_id" | "created_at">
        Update: { voice?: string; active?: boolean }
        Relationships: []
      }
      comic_studio_boards: {
        Row: StudioBoardRow
        Insert: Omit<StudioBoardRow, "id" | "user_id" | "created_at">
        Update: { project_id?: string | null }
        Relationships: []
      }
      comic_series: {
        Row: ComicSeriesRow
        Insert: {
          title?: string
          characters?: Character[]
          world?: WorldItem[]
          facts?: string[]
        }
        Update: {
          title?: string
          characters?: Character[]
          world?: WorldItem[]
          facts?: string[]
          revision?: number
        }
        Relationships: []
      }
      comic_assets: {
        Row: ComicAssetRow
        Insert: Omit<
          ComicAssetRow,
          "id" | "hidden" | "created_at" | "updated_at"
        >
        Update: Partial<
          Pick<
            ComicAssetRow,
            | "is_public"
            | "hidden"
            | "author_name"
            | "name"
            | "description"
            | "genres"
            | "image"
            | "model"
            | "payload"
            | "project"
          >
        >
        Relationships: []
      }
      comic_asset_saves: {
        Row: { user_id: string; asset_id: string; created_at: string }
        Insert: { asset_id: string }
        Update: never
        Relationships: []
      }
      comic_asset_uses: {
        Row: { user_id: string; asset_id: string; created_at: string }
        Insert: { asset_id: string }
        Update: never
        Relationships: []
      }
      comic_asset_reports: {
        Row: {
          asset_id: string
          user_id: string
          reason: string
          created_at: string
        }
        Insert: { asset_id: string; user_id: string; reason: string }
        Update: never
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
      comic_asset_stats: {
        Args: Record<string, never>
        Returns: { asset_id: string; saves: number; uses: number }[]
      }
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
  // The series it belongs to and its place there; null outside a series.
  series_id: string | null
  series_position: number | null
  created_at: string
  updated_at: string
}

// Carousels of one account sharing a cast, a world and a list of facts.
export type ComicSeriesRow = {
  id: string
  user_id: string
  title: string
  characters: Character[]
  world: WorldItem[]
  facts: string[]
  revision: number
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
export type ComicAssetRow = {
  id: string
  user_id: string
  author_name: string | null
  kind: string
  name: string
  description: string
  genres: string[]
  color: string | null
  image: string | null
  model: string | null
  payload: AssetPayload
  project?: ComicProject | null
  source_project?: string | null
  is_public: boolean
  hidden: boolean
  created_at: string
  updated_at: string
}

export type BrandKitRow = {
  id: string
  user_id: string
  domain: string
  name: string
  slogan: string
  description: string
  colors: BrandColor[]
  logos: BrandLogo[]
  fonts: BrandFont[]
  voice: string
  active: boolean
  created_at: string
}

export type StudioBoardRow = {
  id: string
  user_id: string
  kind: StudioSource["kind"]
  title: string
  source: StudioSource
  board: Board
  brand_id: string | null
  project_id: string | null
  prompt: string | null
  created_at: string
}

export type MachineRow = {
  id: string
  user_id: string
  name: string
  source: SourceId
  config: MachineConfig
  enabled: boolean
  state: DetectorState
  last_run_at: string | null
  last_error: string | null
  next_run_at: string | null
  publish_mode: PublishMode
  outputs: MachineOutput[]
  failures: number
  slug: string | null
  public: boolean
  created_at: string
  updated_at: string
}

export type DeepDiveRow = {
  id: string
  user_id: string
  lead: string
  status: DeepDiveStatus
  title: string
  dek: string
  body: string
  messages: AgentMessage[]
  log: LogLine[]
  facts: Fact[]
  sources: Source[]
  findings: Finding[]
  problems: string[]
  submits: number
  slices: number
  leased_until: string | null
  job: string
  machine_id: string | null
  created_at: string
  updated_at: string
}

export type MediaRenditionRow = {
  id: string
  user_id: string
  deep_dive_id: string
  machine_id: string | null
  format: FormatId
  status: DeepDiveStatus
  title: string
  parts: Part[]
  meta: Record<string, string>
  findings: Finding[]
  problems: string[]
  attempts: number
  leased_until: string | null
  job: string
  created_at: string
  updated_at: string
}

export type MachineItemRow = {
  id: string
  machine_id: string
  user_id: string
  key: Item["key"]
  source: string
  title: string
  summary: string
  url: string
  published_at: string
  status: "new" | "used" | "skipped"
  created_at: string
}

export type MachineDraftRow = {
  id: string
  machine_id: string
  user_id: string
  signal_id: string
  signal: Signal | null
  text: string
  scene: string
  alt: string
  status:
    | "new"
    | "used"
    | "dismissed"
    | "approved"
    | "publishing"
    | "published"
    | "failed"
  project_id: string | null
  prompt: string | null
  sources: PostSource[]
  link: string | null
  image_url: string | null
  held: string | null
  platform: OutputPlatform | null
  receipts: PublishReceipt[]
  published_at: string | null
  created_at: string
}

export interface Viewer {
  id: string
  email: string
  name: string
  // Public URL of their profile picture, if they set one.
  avatarUrl: string | null
  // Features they turned on in Settings, under Labs.
  labs: { machines: boolean }
}

export const COMICS_BUCKET = "comics"
export const MACHINE_IMAGES_BUCKET = "machine-images"

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
