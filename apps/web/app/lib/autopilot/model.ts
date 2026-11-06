// Autopilot's shared vocabulary. Server and browser both import this, so it
// may not import anything server-only.

export const PLATFORMS = ["x", "linkedin", "bluesky", "threads"] as const
export type Platform = (typeof PLATFORMS)[number]

export const PLATFORM_NAME: Record<Platform, string> = {
  x: "X",
  linkedin: "LinkedIn",
  bluesky: "Bluesky",
  threads: "Threads",
}

// Characters a post may use on each network.
export const PLATFORM_LIMIT: Record<Platform, number> = {
  x: 280,
  linkedin: 3000,
  bluesky: 300,
  threads: 500,
}

export const MODES = ["review", "autopilot"] as const
export type Mode = (typeof MODES)[number]

export const CADENCES = [
  { minutes: 60, label: "Hourly" },
  { minutes: 180, label: "Every 3 hours" },
  { minutes: 360, label: "4× a day" },
  { minutes: 720, label: "Twice a day" },
  { minutes: 1440, label: "Daily" },
  { minutes: 10080, label: "Weekly" },
] as const

export const cadenceLabel = (minutes: number) =>
  CADENCES.find((c) => c.minutes === minutes)?.label ??
  (minutes < 60
    ? `Every ${minutes} min`
    : `Every ${Math.round(minutes / 60)} h`)

// What each kind of agent does. The brief is a starting point the user edits.
export interface Role {
  id: string
  name: string
  // One line for the template card.
  pitch: string
  brief: string
  voice: string
  platforms: Platform[]
  cadence: number
  // Which research tools it reaches for first.
  research: ("x" | "reddit" | "web" | "tiktok")[]
}

export const ROLES: Role[] = [
  {
    id: "trend_surfer",
    name: "Trend surfer",
    pitch:
      "Spots what's taking off on X and Reddit and posts a sharp take before it peaks.",
    brief:
      "Find the conversation that is accelerating right now in my niche and post a take on it while it's still early. Name the thing, say something specific about it, never summarise the news.",
    voice: "Quick, confident, a little dry. Short sentences. No hashtags.",
    platforms: ["x", "threads"],
    cadence: 180,
    research: ["x", "reddit"],
  },
  {
    id: "thought_leader",
    name: "Thought leader",
    pitch:
      "Turns the week's news into one considered LinkedIn post with a real opinion.",
    brief:
      "Write one LinkedIn post that takes a position on something that happened in my field this week. Open with the claim, back it with one concrete fact you found, end with a question people want to answer.",
    voice:
      "Warm, specific, first person. Line breaks between ideas. No buzzwords, no emoji bullets.",
    platforms: ["linkedin"],
    cadence: 1440,
    research: ["web", "reddit"],
  },
  {
    id: "newsjacker",
    name: "Newsjacker",
    pitch:
      "Reads the headlines and connects the biggest one back to your product.",
    brief:
      "Check the news for my niche. Pick the story my audience will be talking about today and post how it relates to what I build, without sounding like an ad.",
    voice: "Clear and newsy. Lead with the news, then the angle.",
    platforms: ["x", "linkedin"],
    cadence: 360,
    research: ["web", "x"],
  },
  {
    id: "meme_desk",
    name: "Meme desk",
    pitch: "Writes the joke everyone in your niche is about to make, first.",
    brief:
      'Find the running joke or shared frustration in my niche today and write a one-liner or a short format joke ("nobody: / me:", "POV:", fake changelog) about it.',
    voice: "Deadpan, online, lowercase is fine. One idea per post.",
    platforms: ["x", "bluesky", "threads"],
    cadence: 240,
    research: ["x", "reddit", "tiktok"],
  },
  {
    id: "teacher",
    name: "Daily teacher",
    pitch:
      "Posts one genuinely useful tip a day, drawn from what people are asking.",
    brief:
      "Look at the questions people ask about my niche on Reddit and X, pick one that keeps coming up, and answer it in a single post someone would bookmark.",
    voice: "Plain, helpful, concrete. Numbers and steps over adjectives.",
    platforms: ["x", "linkedin", "threads"],
    cadence: 1440,
    research: ["reddit", "x"],
  },
  {
    id: "contrarian",
    name: "Contrarian",
    pitch:
      "Finds the consensus of the day and argues the other side, with evidence.",
    brief:
      "Find the opinion everybody in my niche agrees with today. Argue, politely and with one piece of evidence, why it might be wrong.",
    voice: "Calm, precise, never rude. Concede what's true first.",
    platforms: ["x", "bluesky"],
    cadence: 720,
    research: ["x", "web"],
  },
  {
    id: "launch_crier",
    name: "Launch crier",
    pitch:
      "Keeps a launch alive for weeks with fresh angles, proof and replies to doubts.",
    brief:
      "I'm launching the product in my brief. Each run, find one new angle: a use case, an objection people raise, a comparison, a number. Post it.",
    voice:
      "Energetic but honest. Show, don't hype. One call to action at most.",
    platforms: ["x", "linkedin", "bluesky"],
    cadence: 720,
    research: ["x", "reddit", "web"],
  },
  {
    id: "data_nerd",
    name: "Data nerd",
    pitch:
      "Hunts for one surprising number in your field and explains why it matters.",
    brief:
      "Find one surprising statistic, benchmark or chart about my niche from a source you can cite. Post the number first, then why it matters in one or two lines.",
    voice: "Precise, curious, cites the source in plain words.",
    platforms: ["x", "linkedin"],
    cadence: 1440,
    research: ["web", "reddit"],
  },
]

export const roleOf = (id: string) =>
  ROLES.find((r) => r.id === id) ?? ROLES[0]!

export type AgentState = "idle" | "running" | "sleeping" | "failed"
export type PostStatus =
  "draft" | "scheduled" | "published" | "rejected" | "failed"

// One line of an agent's transcript, as the agent page shows it.
export type TranscriptItem =
  | { id: string; kind: "user"; text: string; at: number }
  | { id: string; kind: "assistant"; text: string; at: number }
  | { id: string; kind: "tool"; name: string; args: string; at: number }
  | {
      id: string
      kind: "result"
      name: string
      text: string
      error: boolean
      at: number
    }
