import type { AgentMessage } from "@earendil-works/pi-agent-core"
import type {
  Character,
  ComicProject,
  WorldItem,
} from "@/components/comic-canvas/model"

import type { AssetPayload } from "@/components/catalog/model"

import type { AnimeTables } from "./anime/database"
import type { BookFunctions, BookTables } from "./books/database"
import type { StyleAnalysis } from "./comic-import/style"
import type { Labs } from "./tools/catalog"
import type { SubscriptionCache } from "./credits"
import type {
  DeepDiveStatus,
  Fact,
  Finding,
  LogLine,
  Source,
} from "./deepdive/model"
import type { DetectorState } from "./machines/detect"
import type { Kind, Manuscript } from "@/lib/desk/model"
import type { Novel } from "./novel/model"
import type {
  Item,
  DismissReason,
  MachineConfig,
  MachineOutput,
  OutputPlatform,
  PostSource,
  PublishMode,
  PublishReceipt,
  RetractReason,
  Signal,
  SourceId,
  RunDecision,
} from "./machines/model"
import type { DeskState } from "./machines/standards"
import type { Arena, Stance } from "./machines/stance"
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
      comic_manuscripts: {
        Row: ComicManuscriptRow
        Insert: {
          id?: string
          user_id?: string
          kind: Kind
          title?: string
          words?: number
          data: Manuscript
          revision?: number
        }
        Update: {
          title?: string
          words?: number
          data?: Manuscript
          revision?: number
        }
        Relationships: []
      }
      comic_manuscript_drafts: {
        Row: ComicManuscriptDraftRow
        Insert: {
          id?: string
          manuscript_id: string
          user_id?: string
          label?: string
          words?: number
          data: Manuscript
        }
        Update: Record<string, never>
        Relationships: []
      }
      comic_novels: {
        Row: ComicNovelRow
        Insert: {
          id?: string
          user_id?: string
          title?: string
          data: Novel
          cover?: string | null
          revision?: number
        }
        Update: {
          title?: string
          data?: Novel
          cover?: string | null
          revision?: number
        }
        Relationships: []
      }
      comic_novel_releases: {
        Row: ComicNovelReleaseRow
        Insert: {
          novel_id: string
          user_id?: string
          slug: string
          title?: string
          synopsis?: string
          cover?: string | null
          data: Novel
          published_at?: string
        }
        Update: {
          slug?: string
          title?: string
          synopsis?: string
          cover?: string | null
          data?: Novel
          published_at?: string
        }
        Relationships: []
      }
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
          evidence?: string
          take?: string
          take_note?: string | null
          desk?: DeskState | null
          block_rule?: string | null
          discord_status?: DiscordStatus | null
          discord_next_at?: string | null
        }
        Update: {
          status?: MachineDraftRow["status"]
          project_id?: string | null
          text?: string
          held?: string | null
          receipts?: PublishReceipt[]
          published_at?: string | null
          dismiss_reason?: DismissReason | null
          desk?: DeskState | null
          retracted_at?: string | null
          retract_reason?: RetractReason | null
          discord_status?: DiscordStatus | null
          discord_message_id?: string | null
          discord_webhook_id?: string | null
          discord_attempts?: number
          discord_next_at?: string | null
        }
        Relationships: []
      }
      comic_machine_runs: {
        Row: MachineRunRow
        Insert: Pick<MachineRunRow, "machine_id" | "user_id" | "decision"> &
          Partial<Omit<MachineRunRow, "id" | "created_at">>
        Update: Partial<Omit<MachineRunRow, "id" | "machine_id" | "user_id">>
        Relationships: []
      }
      comic_machines_control: {
        Row: MachineControlRow
        Insert: Partial<MachineControlRow>
        Update: Partial<Pick<MachineControlRow, "halted" | "reason">>
        Relationships: []
      }
      comic_arena_calendars: {
        Row: ArenaCalendarRow
        Insert: ArenaCalendarRow
        Update: Partial<ArenaCalendarRow>
        Relationships: []
      }
      comic_machine_line_notes: {
        Row: MachineLineNoteRow
        Insert: Omit<MachineLineNoteRow, "id" | "created_at">
        Update: never
        Relationships: []
      }
      comic_machine_discord: {
        Row: MachineDiscordRow
        Insert: Pick<
          MachineDiscordRow,
          "machine_id" | "user_id" | "webhook_ciphertext" | "webhook_hint"
        > &
          Partial<MachineDiscordRow>
        Update: Partial<Omit<MachineDiscordRow, "machine_id" | "user_id">>
        Relationships: []
      }
      comic_machine_feed_state: {
        Row: MachineFeedStateRow
        Insert: Pick<
          MachineFeedStateRow,
          "machine_id" | "user_id" | "feed_key"
        > &
          Partial<Omit<MachineFeedStateRow, "updated_at">>
        Update: Partial<
          Omit<MachineFeedStateRow, "machine_id" | "user_id" | "feed_key">
        >
        Relationships: []
      }
      comic_machine_items: {
        Row: MachineItemRow
        Insert: Omit<
          MachineItemRow,
          "id" | "status" | "role" | "created_at"
        > & {
          status?: MachineItemRow["status"]
          role?: MachineItemRow["role"]
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
      comic_styles: {
        Row: ComicStyleRow
        Insert: {
          user_id: string
          name: string
          pages: string[]
          rights_confirmed_at: string
        }
        Update: {
          name?: string
          status?: ComicStyleRow["status"]
          analysis?: StyleAnalysis | null
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
    } & BookTables &
      AnimeTables
    Views: {}
    Functions: BookFunctions & {
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
export type ComicStyleRow = {
  id: string
  user_id: string
  name: string
  status: "draft" | "ready"
  rights_confirmed_at: string
  pages: string[]
  analysis: StyleAnalysis | null
  created_at: string
  updated_at: string
}

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
  role: "fact" | "foil"
  created_at: string
}

export type MachineFeedStateRow = {
  machine_id: string
  user_id: string
  feed_key: string
  seen: string[]
  outcome: "ok" | "busy" | "unreadable" | "failed"
  failures: number
  last_read_at: string | null
  last_ok_at: string | null
  last_item_at: string | null
  last_item_title: string | null
  updated_at: string
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
    | "expired"
    | "blocked"
    | "retracted"
  project_id: string | null
  prompt: string | null
  sources: PostSource[]
  link: string | null
  image_url: string | null
  held: string | null
  platform: OutputPlatform | null
  receipts: PublishReceipt[]
  published_at: string | null
  // What the post stood on when it was written, for checking an edit.
  evidence: string
  dismiss_reason: DismissReason | null
  // The take as the agent wrote it, kept even when it didn't go out.
  take: string
  // Why the take was left out.
  take_note: string | null
  // What the standards desk said. Null on machines it doesn't read.
  desk: DeskState | null
  block_rule: string | null
  retracted_at: string | null
  retract_reason: RetractReason | null
  // Where this post is on its way to Discord, if the machine has that output.
  discord_status: DiscordStatus | null
  discord_message_id: string | null
  discord_webhook_id: string | null
  discord_attempts: number
  discord_next_at: string | null
  created_at: string
}

// pending, on its way. sent, in the channel. failed, gave up. withdrawn, nothing
// left there. left, taken back here and still there, so a person has to delete it.
export type DiscordStatus = "pending" | "sent" | "failed" | "withdrawn" | "left"

// Only the server reads this table. The webhook is a credential, so a page gets
// `discordOutputs` from discord.server.ts and never this row.
export type MachineDiscordRow = {
  machine_id: string
  user_id: string
  webhook_ciphertext: string
  // The end of the webhook's id, which is no secret, and never of its token.
  webhook_hint: string
  state: "active" | "disabled"
  retry_at: string | null
  last_sent_at: string | null
  last_test_at: string | null
  created_at: string
  updated_at: string
}

export type ArenaCalendarRow = {
  arena: Arena
  reviewed_until: string
  reviewed_by: string
  windows: unknown
}

// One line per declared stance, written by the guard trigger.
export type MachineLineNoteRow = {
  id: string
  machine_id: string | null
  user_id: string
  from_stance: Stance | null
  to_stance: Stance | null
  created_at: string
}

export type MachineRunRow = {
  id: string
  machine_id: string
  user_id: string
  decision: RunDecision
  reason: string
  credits: number
  prompt: string | null
  job: string | null
  agent_text: string | null
  draft_id: string | null
  shown: Record<string, number>
  cited: Record<string, number>
  created_at: string
}

export type MachineControlRow = {
  id: boolean
  halted: boolean
  reason: string
  updated_at: string
}

export interface Viewer {
  id: string
  email: string
  name: string
  // Public URL of their profile picture, if they set one.
  avatarUrl: string | null
  // Features they turned on in Settings, under Labs.
  labs: Labs
}

export const COMICS_BUCKET = "comics"
export const NOVEL_AUDIO_BUCKET = "novel-audio"

export type ComicManuscriptRow = {
  id: string
  user_id: string
  kind: Kind
  title: string
  words: number
  data: Manuscript
  revision: number
  created_at: string
  updated_at: string
}

export type ComicManuscriptDraftRow = {
  id: string
  manuscript_id: string
  user_id: string
  label: string
  words: number
  data: Manuscript
  created_at: string
}

export type ComicNovelRow = {
  id: string
  user_id: string
  title: string
  data: Novel
  cover: string | null
  revision: number
  created_at: string
  updated_at: string
}

export type ComicNovelReleaseRow = {
  novel_id: string
  user_id: string
  slug: string
  title: string
  synopsis: string
  cover: string | null
  data: Novel
  plays: number
  published_at: string
}
export const COMIC_STYLES_BUCKET = "comic-style-refs"
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
