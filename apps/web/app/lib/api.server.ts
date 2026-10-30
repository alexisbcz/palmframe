import { createHash, randomBytes } from "node:crypto"

import {
  toProject,
  type ComicProject,
  type PanelLayer,
} from "@/components/comic-canvas/model"
import {
  DEFAULT_STEPS,
  buildKleinPrompt,
  buildPrompt,
  hasPrompt,
  kleinRefs,
  kleinSize,
  renderSize,
} from "@/components/comic-canvas/use-generator"
import { operation, render, type GenerateRequest } from "./generate.server"

import { COSTS } from "./credits"
import { COMICS_BUCKET, type ApiJobRow } from "./database"
import { supabaseAdmin } from "./supabase-admin.server"

// The developer API and the MCP server share everything here: key auth,
// rate limits, and the estimate → start → poll job flow from Anifusion's
// API. Requests carry a key, not a session, so every query runs with the
// secret key and filters on the key's owner itself.

export const KEY_PREFIX = "pf_live_"
export const ESTIMATE_TTL_MS = 10 * 60_000
// Per key, per rolling minute.
export const RATE_LIMITS = { read: 120, write: 20 } as const
// Queued or running jobs. The local GPU renders one at a time; these only
// bound how long the line gets.
export const MAX_ACTIVE_PER_USER = 2
export const MAX_ACTIVE_GLOBAL = 8

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message)
  }
}

export const apiError = (e: unknown) =>
  e instanceof ApiError
    ? Response.json(
        { error: { code: e.code, message: e.message } },
        { status: e.status }
      )
    : Response.json(
        {
          error: {
            code: "internal",
            // Supabase errors are plain objects with a message.
            message:
              (e as { message?: unknown })?.message?.toString() ?? String(e),
          },
        },
        { status: 500 }
      )

// Runs one REST call: auth, rate limit, JSON out, errors as
// { error: { code, message } }.
export async function respond(
  request: Request,
  kind: keyof typeof RATE_LIMITS,
  work: (caller: Caller) => Promise<unknown>,
  status = 200
) {
  try {
    const caller = await authenticate(request, kind)
    return Response.json(await work(caller), {
      status,
      headers: { "cache-control": "no-store" },
    })
  } catch (e) {
    return apiError(e)
  }
}

export async function jsonBody(request: Request) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object")
    throw new ApiError(400, "invalid_json", "Send a JSON object.")
  return body as Record<string, unknown>
}

export const hashKey = (key: string) =>
  createHash("sha256").update(key).digest("hex")

export function newKey() {
  const key = KEY_PREFIX + randomBytes(32).toString("base64url")
  return { key, prefix: key.slice(0, 16), hash: hashKey(key) }
}

export interface Caller {
  userId: string
  keyId: string
}

// Module state kept on globalThis, so a dev reload doesn't drop live jobs.
const state: ApiState = ((
  globalThis as { __palmframeApi?: ApiState }
).__palmframeApi ??= {
  hits: new Map(),
  queue: Promise.resolve(),
  live: new Map(),
})

interface ApiState {
  hits: Map<string, number[]>
  queue: Promise<unknown>
  live: Map<string, AbortController>
}

export function limit(keyId: string, kind: keyof typeof RATE_LIMITS) {
  const now = Date.now()
  const id = `${kind}:${keyId}`
  const recent = (state.hits.get(id) ?? []).filter((t) => now - t < 60_000)
  if (recent.length >= RATE_LIMITS[kind])
    throw new ApiError(
      429,
      "rate_limited",
      `Rate limit: ${RATE_LIMITS[kind]} ${kind}s per minute per key.`
    )
  recent.push(now)
  state.hits.set(id, recent)
}

// `Authorization: Bearer pf_live_…` → the key's owner.
export async function authenticate(
  request: Request,
  kind: keyof typeof RATE_LIMITS
): Promise<Caller> {
  const header = request.headers.get("authorization") ?? ""
  const key = header.match(/^Bearer\s+(\S+)$/i)?.[1]
  if (!key?.startsWith(KEY_PREFIX))
    throw new ApiError(
      401,
      "unauthorized",
      "Send an API key: Authorization: Bearer pf_live_…"
    )
  const db = supabaseAdmin()
  const { data, error } = await db
    .from("api_keys")
    .select("id, user_id, last_used_at")
    .eq("hash", hashKey(key))
    .is("revoked_at", null)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new ApiError(401, "unauthorized", "Unknown or revoked key.")
  limit(data.id, kind)
  // Best effort, at most once a minute.
  if (!data.last_used_at || Date.now() - Date.parse(data.last_used_at) > 60_000)
    void db
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", data.id)
      .then(() => {})
  return { userId: data.user_id, keyId: data.id }
}

export async function balance(caller: Caller) {
  const { data, error } = await supabaseAdmin().rpc("credits_for", {
    p_user: caller.userId,
  })
  if (error) throw error
  return { credits: data }
}

export async function listProjects(caller: Caller) {
  const { data, error } = await supabaseAdmin()
    .from("comic_projects")
    .select("id, title, cover, revision, slide_count, created_at, updated_at")
    .eq("user_id", caller.userId)
    .order("updated_at", { ascending: false })
    .limit(100)
  if (error) throw error
  return {
    projects: data.map(({ revision, slide_count, ...p }) => ({
      ...p,
      page_version: revision,
      pages: slide_count,
    })),
  }
}

async function loadProject(caller: Caller, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id))
    throw new ApiError(404, "not_found", "No such project.")
  const { data, error } = await supabaseAdmin()
    .from("comic_projects")
    .select("id, title, data, cover, revision, created_at, updated_at")
    .eq("id", id)
    .eq("user_id", caller.userId)
    .maybeSingle()
  if (error) throw error
  const project = data && toProject(data.data)
  if (!data || !project)
    throw new ApiError(404, "not_found", "No such project.")
  return { row: data, project }
}

function findPanel(project: ComicProject, panelId: string) {
  for (const page of project.pages) {
    const layer = page.layers.find((l) => l.id === panelId)
    if (layer?.type === "panel") return { page, panel: layer }
  }
  return null
}

const panelView = (p: PanelLayer) => ({
  id: p.id,
  name: p.name,
  x: p.x,
  y: p.y,
  width: p.width,
  height: p.height,
  image_url: p.src,
  prompt: p.prompt ?? null,
  tags: p.tags ?? [],
  cast: p.cast ?? [],
  seed: p.seed ?? null,
  ready: hasPrompt(p),
})

export async function getProject(caller: Caller, id: string) {
  const { row, project } = await loadProject(caller, id)
  return {
    id: row.id,
    title: row.title,
    cover: row.cover,
    page_version: row.revision,
    created_at: row.created_at,
    updated_at: row.updated_at,
    width: project.width,
    height: project.height,
    look: project.look ?? null,
    cast: (project.cast ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      tags: c.tags,
      has_sheet: !!c.sheet,
    })),
    pages: project.pages.map((page, index) => ({
      id: page.id,
      index,
      panels: page.layers
        .filter((l): l is PanelLayer => l.type === "panel")
        .map(panelView),
      text: page.layers
        .filter((l) => l.type !== "panel")
        .map((l) => ({ id: l.id, type: l.type, text: l.text })),
    })),
  }
}

// What the editor would send to /api/generate for this panel: Klein from
// model sheets and a layout guide when it has them, Anima Turbo otherwise.
function renderRequest(
  project: ComicProject,
  panel: PanelLayer,
  seed: number
): GenerateRequest {
  const refs = kleinRefs(panel, project.cast)
  if (refs.length)
    return {
      prompt: buildKleinPrompt(panel, project),
      negative: "",
      ...kleinSize(panel.width, panel.height),
      seed,
      steps: 4,
      engine: "klein",
      refs,
    }
  return {
    ...buildPrompt(panel, project),
    ...renderSize(panel.width, panel.height),
    seed,
    steps: panel.steps ?? DEFAULT_STEPS,
    engine: "anima",
    refs: [],
  }
}

export function jobView(j: ApiJobRow) {
  return {
    id: j.id,
    status: j.status,
    operation: j.operation,
    credits: j.cost,
    project_id: j.project_id,
    page_id: j.page_id,
    panel_id: j.panel_id,
    page_version: j.page_version,
    result: j.result,
    error: j.error,
    expires_at: j.status === "estimated" ? j.expires_at : null,
    created_at: j.created_at,
    started_at: j.started_at,
    finished_at: j.finished_at,
  }
}

export interface EstimateInput {
  project_id: string
  panel_id: string
  // Replaces the panel's own prompt text for this render.
  prompt?: string
  seed?: number
}

// Free. Binds the price to the project's current revision for 10 minutes.
export async function estimatePanel(caller: Caller, input: EstimateInput) {
  const { row, project } = await loadProject(caller, String(input.project_id))
  const found = findPanel(project, String(input.panel_id))
  if (!found) throw new ApiError(404, "not_found", "No such panel.")
  const panel =
    typeof input.prompt === "string"
      ? { ...found.panel, prompt: input.prompt.slice(0, 2000) }
      : found.panel
  if (!hasPrompt(panel))
    throw new ApiError(
      422,
      "empty_prompt",
      "The panel has no prompt, tags or cast: pass `prompt`."
    )
  const seed =
    typeof input.seed === "number" && Number.isInteger(input.seed)
      ? Math.min(2 ** 32 - 1, Math.max(0, input.seed))
      : panel.lockSeed && panel.seed !== undefined
        ? panel.seed
        : Math.floor(Math.random() * 2 ** 32)
  const params = renderRequest(project, panel, seed)
  const op = operation(params)
  const { data, error } = await supabaseAdmin()
    .from("api_jobs")
    .insert({
      user_id: caller.userId,
      key_id: caller.keyId,
      operation: op,
      cost: COSTS[op],
      project_id: row.id,
      page_id: found.page.id,
      panel_id: panel.id,
      page_version: row.revision,
      params: params as unknown as Record<string, unknown>,
      expires_at: new Date(Date.now() + ESTIMATE_TTL_MS).toISOString(),
    })
    .select()
    .single()
  if (error) throw error
  const { credits } = await balance(caller)
  return {
    estimate_id: data.id,
    operation: op,
    credits: data.cost,
    balance: credits,
    page_version: data.page_version,
    expires_at: data.expires_at,
  }
}

async function jobOf(caller: Caller, id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id))
    throw new ApiError(404, "not_found", "No such operation.")
  const { data, error } = await supabaseAdmin()
    .from("api_jobs")
    .select()
    .eq("id", id)
    .eq("user_id", caller.userId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new ApiError(404, "not_found", "No such operation.")
  return data
}

async function byIdempotencyKey(caller: Caller, key: string) {
  const { data } = await supabaseAdmin()
    .from("api_jobs")
    .select()
    .eq("user_id", caller.userId)
    .eq("idempotency_key", key)
    .maybeSingle()
  return data
}

async function activeCount(userId?: string) {
  let q = supabaseAdmin()
    .from("api_jobs")
    .select("id", { count: "exact", head: true })
    .in("status", ["queued", "running"])
  if (userId) q = q.eq("user_id", userId)
  const { count, error } = await q
  if (error) throw error
  return count ?? 0
}

export interface StartInput {
  estimate_id: string
  // The page_version the estimate returned; a newer project is refused.
  page_version: number
  // The most the caller agrees to pay.
  max_credits: number
  idempotency_key: string
}

// Charges the estimate's price and queues the render. Repeating a call with
// the same idempotency key returns the same job and charges nothing.
export async function startJob(caller: Caller, input: StartInput) {
  const key = String(input.idempotency_key ?? "").trim()
  if (!key || key.length > 255)
    throw new ApiError(
      400,
      "idempotency_key_required",
      "Send an Idempotency-Key (1–255 characters)."
    )
  const replay = await byIdempotencyKey(caller, key)
  if (replay) {
    if (replay.id !== input.estimate_id)
      throw new ApiError(
        409,
        "idempotency_conflict",
        "This idempotency key was used for another estimate."
      )
    return { job: jobView(replay), replayed: true }
  }
  const est = await jobOf(caller, String(input.estimate_id))
  if (est.status !== "estimated")
    throw new ApiError(
      409,
      "already_started",
      "This estimate was already started."
    )
  if (Date.parse(est.expires_at) < Date.now())
    throw new ApiError(410, "estimate_expired", "Estimate expired: ask again.")
  if (Number(input.page_version) !== est.page_version)
    throw new ApiError(
      409,
      "stale_page_version",
      "page_version doesn't match the estimate."
    )
  if (!(Number(input.max_credits) >= est.cost))
    throw new ApiError(
      409,
      "over_budget",
      `This render costs ${est.cost} credits, more than max_credits.`
    )
  const { row } = await loadProject(caller, est.project_id)
  if (row.revision !== est.page_version)
    throw new ApiError(
      409,
      "stale_page_version",
      "The project changed since the estimate: estimate again."
    )
  if ((await activeCount(caller.userId)) >= MAX_ACTIVE_PER_USER)
    throw new ApiError(
      429,
      "too_many_active",
      `At most ${MAX_ACTIVE_PER_USER} active operations per account.`
    )
  if ((await activeCount()) >= MAX_ACTIVE_GLOBAL)
    throw new ApiError(
      429,
      "busy",
      "The renderer is busy. Try again in a minute."
    )

  // Claims the estimate: only one start can move it out of `estimated`.
  const db = supabaseAdmin()
  const claimed = await db
    .from("api_jobs")
    .update({
      status: "queued",
      idempotency_key: key,
      started_at: new Date().toISOString(),
    })
    .eq("id", est.id)
    .eq("status", "estimated")
    .select()
  if (claimed.error && claimed.error.code !== "23505") throw claimed.error
  if (!claimed.data?.length) {
    const raced = await byIdempotencyKey(caller, key)
    if (raced?.id === est.id) return { job: jobView(raced), replayed: true }
    throw new ApiError(
      409,
      "already_started",
      "This estimate was already started."
    )
  }

  const spent = await db.rpc("spend_credits_for", {
    p_user: caller.userId,
    p_cost: est.cost,
    p_kind: est.operation,
    p_job: est.id,
  })
  if (spent.error) {
    const short = spent.error.code === "P0402"
    await finish(est.id, {
      status: "failed",
      error: short ? spent.error.message : "Could not charge credits.",
    })
    throw new ApiError(
      short ? 402 : 500,
      short ? "insufficient_credits" : "charge_failed",
      spent.error.message
    )
  }
  const job = claimed.data[0]!
  enqueue(job)
  return { job: jobView(job), replayed: false, balance: spent.data }
}

async function finish(
  id: string,
  patch: Pick<Partial<ApiJobRow>, "status" | "result" | "error">
) {
  const { data } = await supabaseAdmin()
    .from("api_jobs")
    .update({ ...patch, finished_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["queued", "running"])
    .select()
  return data?.[0] ?? null
}

// Ends a job that didn't succeed, and gives its credits back.
async function fail(
  job: ApiJobRow,
  status: "failed" | "cancelled",
  error: string
) {
  await finish(job.id, { status, error })
  await supabaseAdmin().rpc("refund_credits_for", {
    p_user: job.user_id,
    p_job: job.id,
  })
}

// One job at a time across the server: the local GPU has room for one.
function enqueue(job: ApiJobRow) {
  const controller = new AbortController()
  state.live.set(job.id, controller)
  const run = state.queue.then(() => runJob(job, controller.signal))
  state.queue = run.catch(() => {})
  void run
    .catch((e) =>
      fail(job, "failed", e instanceof Error ? e.message : String(e))
    )
    .finally(() => state.live.delete(job.id))
}

async function runJob(job: ApiJobRow, signal: AbortSignal) {
  if (signal.aborted) return fail(job, "cancelled", "Cancelled")
  const db = supabaseAdmin()
  const moved = await db
    .from("api_jobs")
    .update({ status: "running" })
    .eq("id", job.id)
    .eq("status", "queued")
    .select("id")
  if (!moved.data?.length) return
  const params = job.params as unknown as GenerateRequest
  const res = await render(
    params,
    new Request("http://palmframe.local/", { signal })
  )
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    return fail(
      job,
      signal.aborted ? "cancelled" : "failed",
      body?.error ?? `Render failed (${res.status}).`
    )
  }
  const bytes = new Uint8Array(await res.arrayBuffer())
  const type = res.headers.get("content-type") ?? "image/png"
  const ext = type.includes("jpeg")
    ? "jpg"
    : type.includes("webp")
      ? "webp"
      : "png"
  const path = `${job.user_id}/images/${createHash("sha256").update(bytes).digest("hex")}.${ext}`
  const bucket = db.storage.from(COMICS_BUCKET)
  const up = await bucket.upload(path, bytes, {
    contentType: type,
    cacheControl: "31536000",
  })
  if (up.error && !/exists|duplicate/i.test(up.error.message))
    return fail(job, "failed", `Upload failed: ${up.error.message}`)
  const image_url = bucket.getPublicUrl(path).data.publicUrl
  await placeImage(job, image_url, params.seed)
  await finish(job.id, {
    status: "succeeded",
    result: {
      image_url,
      seed: params.seed,
      render_ms: Number(res.headers.get("x-render-ms")) || 0,
    },
  })
}

// Puts the image in its panel on the project's latest revision, the way the
// editor would. Bumps the revision, so an open editor tab sees the change.
async function placeImage(job: ApiJobRow, src: string, seed: number) {
  const db = supabaseAdmin()
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: row } = await db
      .from("comic_projects")
      .select("data, revision")
      .eq("id", job.project_id)
      .eq("user_id", job.user_id)
      .maybeSingle()
    const project = row && toProject(row.data)
    if (!row || !project || !findPanel(project, job.panel_id)) return
    const data: ComicProject = {
      ...project,
      pages: project.pages.map((page) => ({
        ...page,
        layers: page.layers.map((l) =>
          l.id === job.panel_id && l.type === "panel"
            ? {
                ...l,
                src,
                seed,
                fit: "cover",
                imageZoom: 100,
                panX: 0,
                panY: 0,
              }
            : l
        ),
      })),
    }
    const { data: rows } = await db
      .from("comic_projects")
      .update({ data, revision: row.revision + 1 })
      .eq("id", job.project_id)
      .eq("revision", row.revision)
      .select("id")
    if (rows?.length) return
  }
}

// A job left queued or running by a server that restarted can't finish:
// it fails and is refunded when someone looks at it.
async function reap(job: ApiJobRow) {
  if (
    (job.status === "queued" || job.status === "running") &&
    !state.live.has(job.id)
  ) {
    await fail(job, "failed", "The server restarted during this job.")
    return jobOf({ userId: job.user_id, keyId: "" }, job.id)
  }
  return job
}

export async function getJob(caller: Caller, id: string) {
  return jobView(await reap(await jobOf(caller, id)))
}

export async function cancelJob(caller: Caller, id: string) {
  const job = await jobOf(caller, id)
  if (job.status !== "queued" && job.status !== "running")
    throw new ApiError(
      409,
      "not_active",
      `This operation is ${job.status}, nothing to cancel.`
    )
  const live = state.live.get(job.id)
  if (live) {
    live.abort()
    // A queued job ends now; a running one ends when the renderer stops.
    if (job.status === "queued") await fail(job, "cancelled", "Cancelled")
  } else await fail(job, "cancelled", "Cancelled")
  return jobView(await jobOf(caller, id))
}

export const capabilities = () => ({
  operations: {
    panel: {
      credits: COSTS.panel,
      engine: "anima",
      note: "Anima Turbo, from the panel's prompt, tags and cast.",
    },
    panel_ref: {
      credits: COSTS.panel_ref,
      engine: "klein",
      note: "FLUX.2 Klein, when the panel's cast has model sheets or the panel has a layout guide.",
    },
  },
  limits: {
    reads_per_minute: RATE_LIMITS.read,
    writes_per_minute: RATE_LIMITS.write,
    active_operations_per_account: MAX_ACTIVE_PER_USER,
    active_operations_total: MAX_ACTIVE_GLOBAL,
    concurrent_renders: 1,
    estimate_ttl_seconds: ESTIMATE_TTL_MS / 1000,
  },
})
