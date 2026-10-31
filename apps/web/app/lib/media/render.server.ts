import Anthropic from "@anthropic-ai/sdk"

import { factCheck } from "@/lib/deepdive/factcheck.server"
import { lintArticle } from "@/lib/deepdive/lint.server"
import type { Finding } from "@/lib/deepdive/model"
import { kickWork } from "@/lib/deepdive/run.server"
import { supabaseAdmin } from "@/lib/supabase-admin.server"

import { formatDefinition } from "./formats"
import type { FormatDefinition, FormatId, Rendition, Story } from "./model"
import { afterRendition } from "./pipeline.server"
import {
  ADAPT_SYSTEM,
  DRAFT_SCHEMA,
  MAX_ATTEMPTS,
  adaptPrompt,
  asArticle,
  parseDraft,
  sharedProblems,
  renditionMarkdown,
  storyOf,
} from "./render"

const MODEL = "claude-sonnet-5-5"
const ATTEMPT_MS = 235_000
const LEASE_MS = 280_000
export const WORK_PATH = "/api/media/renditions/work"

const table = () => supabaseAdmin().from("comic_media_renditions")

type Retry = { draft: Rendition; problems: string[] }

async function writeDraft(
  story: Story,
  def: FormatDefinition,
  retry: Retry | undefined,
  signal: AbortSignal
) {
  const response = await new Anthropic().beta.messages.create(
    {
      model: MODEL,
      max_tokens: 16_000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: DRAFT_SCHEMA },
      },
      system: ADAPT_SYSTEM,
      messages: [{ role: "user", content: adaptPrompt(story, def, retry) }],
    },
    { signal }
  )
  if (response.stop_reason !== "end_turn")
    throw new Error(`The writer stopped early (${response.stop_reason}).`)
  const text = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
  return parseDraft(def.id, text)
}

export interface RenderDeps {
  write: typeof writeDraft
  check: typeof factCheck
  lint: typeof lintArticle
}

const providers: RenderDeps = {
  write: writeDraft,
  check: factCheck,
  lint: lintArticle,
}

// One draft and everything that judges it. The fact-checker is the slow,
// costly part, so a draft already sent back doesn't reach it, unless this is
// the last draft a person will see.
export async function renderAttempt(
  story: Story,
  def: FormatDefinition,
  retry: Retry | undefined,
  last: boolean,
  signal: AbortSignal,
  deps: RenderDeps = providers
) {
  const rendition = await deps.write(story, def, retry, signal)
  const format = def.check(rendition)
  const lint = await deps.lint(renditionMarkdown(rendition), def.valeRules)
  const findings: Finding[] = [...format.findings, ...lint]
  const problems = [
    ...format.problems,
    ...sharedProblems(rendition, story),
    ...lint
      .filter((f) => f.level === "error")
      .slice(0, 15)
      .map((f) => `Line ${f.line}, ${f.rule}: ${f.message}`),
  ]
  if (!problems.length || last) {
    const errors = await deps.check(asArticle(rendition), story.sources, signal)
    problems.push(...errors.map((e) => `${e.claim}: ${e.why}`))
  }
  return { rendition, findings, problems }
}

export const kickRender = (origin: string, id: string) =>
  kickWork(origin, WORK_PATH, id)

async function failRender(
  row: { id: string; user_id: string; job: string },
  why: string
) {
  await table()
    .update({ status: "failed", problems: [why], leased_until: null })
    .eq("id", row.id)
  await supabaseAdmin().rpc("refund_credits_for", {
    p_user: row.user_id,
    p_job: row.job,
  })
}

// Inserts the row and starts the work. The caller has already charged `job`,
// and refunds it if this throws before the work has a row to fail on.
export async function queueRendition(
  input: {
    user_id: string
    deep_dive_id: string
    format: FormatId
    job: string
    machine_id?: string | null
  },
  origin: string
) {
  const { data, error } = await table().insert(input).select("id").single()
  if (error) throw error
  try {
    await kickRender(origin, data.id)
  } catch (e) {
    console.error("Rendition didn't start", data.id, e)
    await failRender({ id: data.id, ...input }, "It couldn't start.")
    return { id: data.id, started: false }
  }
  return { id: data.id, started: true }
}

// One attempt per function call: writing plus fact-checking can take most of
// a function's life, and three of them can't fit in one.
export async function renderSlice(
  id: string,
  origin: string,
  deps: RenderDeps = providers
) {
  const now = new Date()
  const { data: rows } = await table()
    .update({
      status: "running",
      leased_until: new Date(now.getTime() + LEASE_MS).toISOString(),
    })
    .eq("id", id)
    .in("status", ["queued", "running"])
    .or(`leased_until.is.null,leased_until.lt.${now.toISOString()}`)
    .select("*")
  const row = rows?.[0]
  if (!row) return "skipped"

  const def = formatDefinition(row.format)
  const { data: dive } = await supabaseAdmin()
    .from("comic_deep_dives")
    .select("*")
    .eq("id", row.deep_dive_id)
    .maybeSingle()
  if (!def || !dive?.body) {
    await failRender(row, "This format isn't available.")
    return "failed"
  }

  const attempt = row.attempts + 1
  const last = attempt >= MAX_ATTEMPTS
  const retry: Retry | undefined =
    row.parts.length && row.problems.length
      ? {
          draft: {
            format: row.format,
            title: row.title,
            parts: row.parts,
            meta: row.meta,
          },
          problems: row.problems,
        }
      : undefined

  let result
  try {
    result = await renderAttempt(
      storyOf(dive),
      def,
      retry,
      last,
      AbortSignal.timeout(ATTEMPT_MS),
      deps
    )
  } catch (e) {
    console.error("Rendition attempt failed", id, e)
    if (last) {
      // A draft from an earlier try is still worth a person's look.
      if (row.parts.length) {
        await table()
          .update({ status: "review", attempts: attempt, leased_until: null })
          .eq("id", id)
        return "finished"
      }
      await failRender(row, "The writer stopped with an error.")
      return "failed"
    }
    await table().update({ attempts: attempt, leased_until: null }).eq("id", id)
    await kickRender(origin, id)
    return "continued"
  }

  const { rendition, findings, problems } = result
  const finished = !problems.length || last
  const status = problems.length ? "review" : "done"
  await table()
    .update({
      title: rendition.title.slice(0, 300),
      parts: rendition.parts,
      meta: rendition.meta,
      findings,
      problems,
      attempts: attempt,
      leased_until: null,
      ...(finished && { status }),
    })
    .eq("id", id)
  if (!finished) {
    await kickRender(origin, id)
    return "continued"
  }
  if (row.machine_id)
    await afterRendition(
      { ...row, status, problems },
      rendition,
      storyOf(dive)
    ).catch((e) => console.error("Machine draft not filed", id, e))
  return "finished"
}
