// Row types for the Newsroom's publication tables. Written only by the server.

export type Platform = "linkedin" | "x" | "bluesky" | "facebook"

export type NewsroomRow = {
  id: string
  user_id: string
  slug: string
  name: string
  tagline: string
  accent: string
  live: boolean
  indexable: boolean
  theme: "paper" | "broadsheet" | "midnight" | "zine"
  created_at: string
  updated_at: string
}

export type SubscriberRow = {
  id: string
  newsroom_id: string
  email: string
  status: "subscribed" | "unsubscribed"
  token: string
  created_at: string
  unsubscribed_at: string | null
}

export type IssueRow = {
  id: string
  newsroom_id: string
  story_id: string
  subject: string
  status: "held" | "sending" | "sent" | "failed"
  provider: string
  recipients: number
  error: string
  created_at: string
  sent_at: string | null
}

export type PostRow = {
  id: string
  user_id: string
  story_id: string
  platform: Platform
  text: string
  status: "draft" | "scheduled" | "published" | "failed"
  provider: string
  provider_post_id: string | null
  scheduled_for: string | null
  error: string
  created_at: string
  updated_at: string
}

export type Cadence = "daily" | "weekdays" | "weekly"

export type BeatRow = {
  id: string
  user_id: string
  name: string
  lead: string
  template: string
  options: Record<string, unknown>
  cadence: Cadence
  weekday: number
  minute_of_day: number
  timezone: string
  enabled: boolean
  auto_publish: boolean
  auto_newsletter: boolean
  auto_social: boolean
  max_credits_per_week: number
  next_run_at: string | null
  last_run_at: string | null
  last_error: string
  created_at: string
  updated_at: string
}

type Table<Row, Required extends keyof Row> = {
  Row: Row
  Insert: Pick<Row, Required> & Partial<Row>
  Update: Partial<Row>
  Relationships: []
}

export type NewsroomTables = {
  comic_newsroom_beats: Table<BeatRow, "user_id" | "name" | "lead" | "template">
  comic_newsrooms: Table<NewsroomRow, "user_id" | "slug" | "name">
  comic_newsroom_subscribers: Table<SubscriberRow, "newsroom_id" | "email">
  comic_newsroom_issues: Table<IssueRow, "newsroom_id" | "story_id" | "subject">
  comic_newsroom_posts: Table<
    PostRow,
    "user_id" | "story_id" | "platform" | "text"
  >
}
