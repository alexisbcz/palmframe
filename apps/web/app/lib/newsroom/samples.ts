// Stories the Newsroom filed itself, one per template, shown on its front page.
// Each came from a real run of the pipeline; scripts/newsroom-samples.ts
// exported them, with their sources and fact ledger, into samples.json.
import type { Fact, Finding } from "@/lib/deepdive/model"

import data from "./samples.json"
import type { TemplateId } from "./templates"

export interface Sample {
  slug: string
  template: TemplateId
  lead: string
  title: string
  dek: string
  body: string
  // A file in public/newsroom, or null for the typographic cover.
  cover: string | null
  filed: string
  sources: { url: string; title: string }[]
  facts: Fact[]
  findings: Finding[]
}

export const SAMPLES = data as Sample[]

export const sampleBySlug = (slug: string) =>
  SAMPLES.find((s) => s.slug === slug) ?? null
