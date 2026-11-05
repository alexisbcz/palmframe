// The Newsroom's templates: what a story is shaped like. Shared by server and
// browser, so nothing here may import a model or a key. The prompts and style
// rules for each live in desks.server.ts.
import type { Limits } from "@/lib/deepdive/model"

export const TEMPLATE_IDS = [
  "wire",
  "breakdown",
  "explainer",
  "feature",
  "profile",
  "pulse",
  "roundup",
  "analysis",
  "listicle",
] as const

export type TemplateId = (typeof TEMPLATE_IDS)[number]

// What the agent may reach for. Shown as chips; every template can use all of
// them, the list is what each one leans on.
export type SourceKind = "news" | "web" | "social" | "video" | "brand" | "x"

export interface Template {
  id: TemplateId
  // A masthead, never translated.
  name: string
  limits: Limits
  sources: SourceKind[]
  // Minutes a run usually takes, for the composer.
  minutes: [number, number]
  // The cover drawn when no picture is: a typographic treatment in CSS.
  look: {
    paper: string
    ink: string
    accent: string
    // The face the masthead and headline use on the cover.
    face: "grotesk" | "serif" | "mono" | "condensed"
  }
  // Leads that show the template at its best, for the composer's suggestions.
  leads: string[]
}

export const TEMPLATES: Template[] = [
  {
    id: "wire",
    name: "Wire",
    limits: {
      minWords: 250,
      maxWords: 550,
      minFacts: 6,
      minDomains: 3,
      minSocial: 0,
    },
    sources: ["news", "web", "x"],
    minutes: [3, 6],
    look: {
      paper: "#f2efe6",
      ink: "#111",
      accent: "#e0261b",
      face: "condensed",
    },
    leads: [
      "What happened in the last 48 hours with the EU AI Act's general-purpose model rules",
      "The latest on the Starship flight test",
    ],
  },
  {
    id: "breakdown",
    name: "The Breakdown",
    limits: {
      minWords: 600,
      maxWords: 1300,
      minFacts: 8,
      minDomains: 3,
      minSocial: 0,
    },
    sources: ["web", "brand", "x", "news"],
    minutes: [6, 12],
    look: {
      paper: "#ffd23f",
      ink: "#141414",
      accent: "#141414",
      face: "grotesk",
    },
    leads: [
      "How Liquid Death makes money selling canned water",
      "https://x.com/levelsio",
    ],
  },
  {
    id: "explainer",
    name: "Explainer",
    limits: {
      minWords: 550,
      maxWords: 1100,
      minFacts: 8,
      minDomains: 4,
      minSocial: 0,
    },
    sources: ["news", "web"],
    minutes: [5, 10],
    look: {
      paper: "#e9f0ff",
      ink: "#0f1d3d",
      accent: "#2f6bff",
      face: "grotesk",
    },
    leads: [
      "Why are egg prices swinging so much?",
      "What is a sovereign AI fund, and who has one?",
    ],
  },
  {
    id: "feature",
    name: "Longform",
    limits: {
      minWords: 1200,
      maxWords: 2200,
      minFacts: 12,
      minDomains: 5,
      minSocial: 0,
    },
    sources: ["news", "web", "video", "x"],
    minutes: [10, 20],
    look: {
      paper: "#151412",
      ink: "#f3ede1",
      accent: "#c8a15a",
      face: "serif",
    },
    leads: [
      "The race to build the first commercial fusion plant",
      "The people who repair the internet's undersea cables",
    ],
  },
  {
    id: "profile",
    name: "Profile",
    limits: {
      minWords: 700,
      maxWords: 1400,
      minFacts: 9,
      minDomains: 4,
      minSocial: 1,
    },
    sources: ["x", "brand", "web", "video"],
    minutes: [6, 12],
    look: {
      paper: "#f6efe9",
      ink: "#2b1a14",
      accent: "#d2512d",
      face: "serif",
    },
    leads: ["Arthur Mensch and Mistral AI", "https://x.com/karpathy"],
  },
  {
    id: "pulse",
    name: "Pulse",
    limits: {
      minWords: 450,
      maxWords: 950,
      minFacts: 8,
      minDomains: 3,
      minSocial: 4,
    },
    sources: ["social", "video", "x", "news"],
    minutes: [5, 10],
    look: { paper: "#0d0d10", ink: "#f4f4f6", accent: "#c6ff3d", face: "mono" },
    leads: [
      "Why everyone is posting about Mistral's cat model names",
      "The 'quiet cracking' trend on TikTok",
    ],
  },
  {
    id: "roundup",
    name: "The Roundup",
    limits: {
      minWords: 400,
      maxWords: 950,
      minFacts: 8,
      minDomains: 5,
      minSocial: 0,
    },
    sources: ["news", "web", "x"],
    minutes: [5, 10],
    look: {
      paper: "#eef3ea",
      ink: "#14261a",
      accent: "#1f8a4c",
      face: "condensed",
    },
    leads: [
      "This week in AI: the five developments that mattered",
      "Today's European tech news",
    ],
  },
  {
    id: "analysis",
    name: "Analysis",
    limits: {
      minWords: 700,
      maxWords: 1400,
      minFacts: 8,
      minDomains: 4,
      minSocial: 0,
    },
    sources: ["news", "web", "video"],
    minutes: [6, 12],
    look: {
      paper: "#f1ede6",
      ink: "#22201c",
      accent: "#7a3cff",
      face: "serif",
    },
    leads: [
      "Is open-weight AI a business or a loss leader?",
      "What the EU's new cloud rules mean for American hyperscalers",
    ],
  },
  {
    id: "listicle",
    name: "The List",
    limits: {
      minWords: 500,
      maxWords: 1100,
      minFacts: 8,
      minDomains: 4,
      minSocial: 0,
    },
    sources: ["web", "news", "social"],
    minutes: [5, 10],
    look: {
      paper: "#ff5a36",
      ink: "#170a05",
      accent: "#170a05",
      face: "grotesk",
    },
    leads: [
      "Seven things to know about the new iPhone's repairability",
      "Five startups quietly winning in climate software",
    ],
  },
]

export const templateById = (id: string | null | undefined) =>
  TEMPLATES.find((t) => t.id === id) ?? null

export const isTemplateId = (v: unknown): v is TemplateId =>
  TEMPLATE_IDS.includes(v as TemplateId)
