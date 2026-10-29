import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_TEXT_MODEL,
  OpenRouterError,
  disconnect,
  getConnection,
  imageModels,
  keyInfo,
  openRouterAvailable,
  saveKey,
  updateSettings,
} from "@/lib/openrouter.server"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/api.openrouter"

const error = (message: string, status: number) =>
  Response.json({ error: message }, { status })

export type OpenRouterStatus =
  | { available: false }
  | {
      available: true
      connected: false
      models: { id: string; name: string }[]
    }
  | {
      available: true
      connected: true
      hint: string
      enabled: boolean
      imageModel: string
      textModel: string
      // From OpenRouter, in USD; null when the key couldn't be read.
      account: {
        usage: number
        limit: number | null
        remaining: number | null
      } | null
      models: { id: string; name: string }[]
    }

// The Settings section: whether a key is connected, its spend, the models.
export async function loader({ request }: Route.LoaderArgs) {
  const { viewer } = await getViewer(request)
  if (!viewer) return error("Sign in first.", 401)
  if (!openRouterAvailable())
    return Response.json({ available: false } satisfies OpenRouterStatus)
  const [c, models] = await Promise.all([
    getConnection(viewer.id),
    imageModels().catch(() => []),
  ])
  if (!c)
    return Response.json({
      available: true,
      connected: false,
      models,
    } satisfies OpenRouterStatus)
  const info = await keyInfo(c.key, request.signal).catch(() => null)
  return Response.json({
    available: true,
    connected: true,
    hint: c.hint,
    enabled: c.enabled,
    imageModel: c.imageModel,
    textModel: c.textModel,
    account: info && {
      usage: info.usage,
      limit: info.limit,
      remaining: info.limit_remaining,
    },
    models,
  } satisfies OpenRouterStatus)
}

const MODEL_ID = /^[a-z0-9][\w.-]*\/[\w.:-]+$/i

// POST { key } connects a pasted key, checked against OpenRouter first.
// PATCH { enabled?, imageModel?, textModel? } changes settings.
// DELETE forgets the key.
export async function action({ request }: Route.ActionArgs) {
  const { viewer } = await getViewer(request)
  if (!viewer) return error("Sign in first.", 401)
  if (!openRouterAvailable())
    return error("OpenRouter is not set up on this server.", 501)

  if (request.method === "DELETE") {
    await disconnect(viewer.id)
    return Response.json({ ok: true })
  }
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null

  if (request.method === "POST") {
    const key = typeof body?.key === "string" ? body.key.trim() : ""
    if (!/^sk-or-[\w-]{20,200}$/.test(key))
      return error("That doesn't look like an OpenRouter key (sk-or-…).", 400)
    try {
      await keyInfo(key, request.signal)
    } catch (e) {
      return error(
        e instanceof OpenRouterError && e.status === 401
          ? "OpenRouter doesn't recognise this key."
          : e instanceof Error
            ? e.message
            : String(e),
        400
      )
    }
    await saveKey(viewer.id, key)
    return Response.json({ ok: true })
  }

  if (request.method === "PATCH") {
    const model = (v: unknown, fallback: string) =>
      typeof v === "string" ? (MODEL_ID.test(v) ? v : fallback) : undefined
    await updateSettings(viewer.id, {
      enabled: typeof body?.enabled === "boolean" ? body.enabled : undefined,
      imageModel: model(body?.imageModel, DEFAULT_IMAGE_MODEL),
      textModel: model(body?.textModel, DEFAULT_TEXT_MODEL),
    })
    return Response.json({ ok: true })
  }
  return error("Method not allowed", 405)
}
