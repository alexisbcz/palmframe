import type { Article, Fact, Finding, Source } from "@/lib/deepdive/model"

// The contract behind agentic media. One researched Story is the single source
// of truth; every format is a rendering of it, so a carousel can never claim
// what the article couldn't. Format and asset work plugs in here.

// What research produces. Everything downstream is checked against this.
export interface Story {
  id: string
  lead: string
  title: string
  dek: string
  // The canonical article, already through Vale and the fact-checker.
  article: Article
  facts: Fact[]
  sources: Source[]
}

export const FORMATS = [
  "blog",
  "substack",
  "linkedin",
  "x_thread",
  "instagram_carousel",
  "youtube",
] as const
export type FormatId = (typeof FORMATS)[number]

// A picture a format asks for. `data` must come from the Story's facts.
export type AssetSpec =
  | {
      kind: "figure"
      chart: "bar" | "line" | "stat" | "comparison" | "waterfall"
      title: string
      unit?: string
      series: { label: string; value: number; estimate?: boolean }[]
      sourceUrl: string
    }
  | {
      kind: "map"
      title: string
      places: { name: string; lat: number; lng: number; value?: string }[]
      sourceUrl: string
    }
  | { kind: "illustration"; scene: string; alt: string }

export interface RenderedAsset {
  spec: AssetSpec
  // PNG in the machine-images bucket, ready for any platform.
  url: string
  width: number
  height: number
  alt: string
}

// One rendered format. `parts` is ordered: paragraphs of a post, posts of a
// thread, slides of a carousel, scenes of a video.
export interface Part {
  text: string
  asset?: AssetSpec
  // The finished picture, once the format has passed its checks.
  rendered?: RenderedAsset
  // Spoken words and on-screen direction, for video.
  voiceover?: string
}

export interface Rendition {
  format: FormatId
  title: string
  parts: Part[]
  // Caption, description, hashtags: whatever the platform wants beside it.
  meta: Record<string, string>
}

export interface FormatCheck {
  findings: Finding[]
  // Blocking problems, in plain words the writer agent can act on.
  problems: string[]
}

// Each format supplies exactly this, in lib/media/formats/<id>.ts, and is
// listed in lib/media/formats/index.ts.
export interface FormatDefinition {
  id: FormatId
  // Rules for the model that adapts the Story to this format.
  brief: string
  // Shape and limits, checked in plain code. Claims are checked separately
  // against the Story, by the shared fact-checker.
  check: (r: Rendition) => FormatCheck
  // Vale rules that apply on top of the shared Hustle style.
  valeRules?: Record<string, string>
}
