// Row types for Autopilot's tables. Written only by the server.
import type {
  AgentState,
  Mode,
  Platform,
  PostStatus,
  TranscriptItem,
} from "./model"

export type AgentRow = {
  id: string
  user_id: string
  name: string
  handle: string
  role: string
  squad: string
  brief: string
  voice: string
  topics: string[]
  platforms: Platform[]
  cadence: number
  posts_per_run: number
  mode: Mode
  hue: number
  enabled: boolean
  max_credits_per_week: number
  memory: string
  inbox: { id: string; text: string; at: string }[]
  live: TranscriptItem[]
  state: AgentState
  next_run_at: string | null
  last_run_at: string | null
  last_error: string
  leased_until: string | null
  runs: number
  spend: number
  created_at: string
  updated_at: string
}

export type AgentPostRow = {
  id: string
  user_id: string
  agent_id: string
  platform: Platform
  text: string
  angle: string
  sources: { title: string; url: string }[]
  status: PostStatus
  scheduled_for: string | null
  provider: string
  provider_post_id: string
  error: string
  created_at: string
  updated_at: string
}

export type AgentEventRow = {
  id: number
  user_id: string
  agent_id: string
  kind: string
  label: string
  created_at: string
}

type Table<Row, Required extends keyof Row> = {
  Row: Row
  Insert: Pick<Row, Required> & Partial<Row>
  Update: Partial<Row>
  Relationships: []
}

export type AutopilotTables = {
  comic_autopilot_agents: Table<AgentRow, "user_id" | "name" | "role" | "brief">
  comic_autopilot_posts: Table<
    AgentPostRow,
    "user_id" | "agent_id" | "platform" | "text"
  >
  comic_autopilot_events: Table<
    Omit<AgentEventRow, "id"> & { id?: number },
    "user_id" | "agent_id" | "kind"
  >
}
