import { z } from "zod"

export const leadSchema = z.url().startsWith("https://").max(500)

export interface Finding {
  line: number
  rule: string
  level: "error" | "warning"
  message: string
}

export interface Fact {
  claim: string
  url: string
  quote: string
}

export interface Source {
  url: string
  title: string
  // What the agent actually read: the evidence an article is checked against.
  text: string
}

export interface LogLine {
  at: number
  tool: string
  label: string
}

export interface Article {
  title: string
  dek: string
  body: string
}

export type DeepDiveStatus = "queued" | "running" | "done" | "review" | "failed"

export const MIN_FACTS = 8
export const MIN_DOMAINS = 3
export const MIN_WORDS = 600
export const MAX_WORDS = 1500
export const MAX_SUBMITS = 5
