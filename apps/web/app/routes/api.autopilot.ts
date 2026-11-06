import { z } from "zod"

import { forget } from "@/lib/autopilot/agent.server"
import type { AgentRow } from "@/lib/autopilot/database"
import { MODES, PLATFORM_LIMIT, PLATFORMS, ROLES } from "@/lib/autopilot/model"
import { publishPost } from "@/lib/autopilot/publish.server"
import { kickAgent } from "@/lib/autopilot/run.server"
import { inventSquad, MAX_SQUAD } from "@/lib/autopilot/squad.server"
import { COSTS } from "@/lib/credits"
import { supabaseAdmin } from "@/lib/supabase-admin.server"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/api.autopilot"

export const config = { maxDuration: 120 }

// A user's fleet tops out here; the tick runs 25 agents a minute.
const MAX_AGENTS = 60

const roleIds = ROLES.map((r) => r.id) as [string, ...string[]]
const platforms = z.array(z.enum(PLATFORMS)).min(1).max(4)

const agentFields = z.object({
  name: z.string().trim().min(1).max(60),
  handle: z
    .string()
    .trim()
    .max(40)
    .regex(/^[a-z0-9_]*$/i)
    .default(""),
  role: z.enum(roleIds),
  squad: z.string().trim().max(40).default(""),
  brief: z.string().trim().min(3).max(2000),
  voice: z.string().trim().max(600).default(""),
  topics: z.array(z.string().trim().min(1).max(60)).max(8).default([]),
  platforms,
  cadence: z.number().int().min(30).max(10080).default(240),
  posts_per_run: z.number().int().min(1).max(4).default(1),
  mode: z.enum(MODES).default("review"),
  max_credits_per_week: z.number().int().min(0).max(5000).default(120),
})

const body = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("create"),
    agent: agentFields,
    start: z.boolean().default(true),
  }),
  z.object({
    intent: z.literal("update"),
    id: z.uuid(),
    agent: agentFields.partial(),
  }),
  z.object({ intent: z.literal("enable"), id: z.uuid(), on: z.boolean() }),
  z.object({
    intent: z.literal("fleet"),
    on: z.boolean(),
    squad: z.string().max(40).optional(),
  }),
  z.object({
    intent: z.literal("run"),
    id: z.uuid(),
    note: z.string().trim().max(500).optional(),
  }),
  z.object({
    intent: z.literal("message"),
    id: z.uuid(),
    text: z.string().trim().min(1).max(2000),
  }),
  z.object({ intent: z.literal("delete"), id: z.uuid() }),
  z.object({
    intent: z.literal("post"),
    id: z.uuid(),
    action: z.enum(["approve", "reject", "edit"]),
    text: z.string().trim().min(1).max(3000).optional(),
  }),
  z.object({
    intent: z.literal("squad"),
    niche: z.string().trim().min(3).max(300),
    product: z.string().trim().max(300).optional(),
    count: z.number().int().min(2).max(MAX_SQUAD),
    platforms,
  }),
  z.object({
    intent: z.literal("spawn"),
    squad: z.string().trim().max(40),
    cadence: z.number().int().min(30).max(10080),
    mode: z.enum(MODES),
    agents: z.array(agentFields).min(1).max(MAX_SQUAD),
  }),
])

const fail = (error: string, status: number, headers?: Headers) =>
  Response.json({ error }, { status, headers })

// Spread the first runs over a few minutes, so a new squad doesn't hit every
// search API in the same second.
const stagger = (i: number) =>
  new Date(Date.now() + 10_000 + i * 20_000).toISOString()

const hueOf = (s: string) =>
  [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return fail("Method not allowed", 405)
  const { viewer, headers } = await getViewer(request)
  if (!viewer) return fail("Sign in first.", 401, headers)
  if (!viewer.labs.autopilot)
    return fail("Turn on Autopilot in Settings › Labs.", 404, headers)
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return fail("Invalid request.", 400, headers)
  const r = parsed.data
  const admin = supabaseAdmin()
  const agents = admin.from("comic_autopilot_agents")
  const origin = new URL(request.url).origin
  const json = (data: unknown) => Response.json(data, { headers })

  const own = async (id: string) => {
    const { data } = await agents
      .select("*")
      .eq("id", id)
      .eq("user_id", viewer.id)
      .maybeSingle()
    return data as AgentRow | null
  }
  const count = async () =>
    (
      await agents
        .select("id", { count: "exact", head: true })
        .eq("user_id", viewer.id)
    ).count ?? 0

  switch (r.intent) {
    case "create": {
      if ((await count()) >= MAX_AGENTS)
        return fail(`A fleet holds ${MAX_AGENTS} agents.`, 400, headers)
      const { data, error } = await agents
        .insert({
          ...r.agent,
          user_id: viewer.id,
          hue: hueOf(r.agent.name),
          enabled: r.start,
          state: r.start ? "sleeping" : "idle",
          next_run_at: r.start ? stagger(0) : null,
        })
        .select("id")
        .single()
      if (error || !data)
        return fail("Couldn't create the agent.", 500, headers)
      return json({ id: data.id })
    }
    case "update": {
      const agent = await own(r.id)
      if (!agent) return fail("Not found", 404, headers)
      const { error } = await agents.update(r.agent).eq("id", r.id)
      if (error) return fail("Couldn't save.", 500, headers)
      return json({ ok: true })
    }
    case "enable": {
      const agent = await own(r.id)
      if (!agent) return fail("Not found", 404, headers)
      await agents
        .update({
          enabled: r.on,
          next_run_at: r.on
            ? agent.next_run_at && agent.next_run_at > new Date().toISOString()
              ? agent.next_run_at
              : stagger(0)
            : null,
          ...(agent.state !== "running" && {
            state: r.on ? "sleeping" : "idle",
          }),
        })
        .eq("id", r.id)
      return json({ ok: true })
    }
    case "fleet": {
      let q = agents
        .select("id, state")
        .eq("user_id", viewer.id)
        .eq("enabled", !r.on)
      if (r.squad !== undefined) q = q.eq("squad", r.squad)
      const { data } = await q
      for (const [i, a] of (data ?? []).entries())
        await agents
          .update({
            enabled: r.on,
            next_run_at: r.on ? stagger(i) : null,
            ...(a.state !== "running" && { state: r.on ? "sleeping" : "idle" }),
          })
          .eq("id", a.id)
      return json({ changed: data?.length ?? 0 })
    }
    case "run": {
      const agent = await own(r.id)
      if (!agent) return fail("Not found", 404, headers)
      if (agent.state === "running")
        return fail("It's already running.", 409, headers)
      await kickAgent(origin, agent.id, { kind: "run", note: r.note })
      return json({ ok: true })
    }
    case "message": {
      const agent = await own(r.id)
      if (!agent) return fail("Not found", 404, headers)
      const item = {
        id: crypto.randomUUID(),
        text: r.text,
        at: new Date().toISOString(),
      }
      await agents
        .update({ inbox: [...(agent.inbox ?? []), item].slice(-10) })
        .eq("id", agent.id)
      await admin.from("comic_autopilot_events").insert({
        agent_id: agent.id,
        user_id: viewer.id,
        kind: "message",
        label: r.text.slice(0, 300),
      })
      // A running agent takes it as a steer when its worker next hands over;
      // an idle one starts a short run to answer.
      await kickAgent(origin, agent.id, { kind: "inbox" })
      return json({ ok: true })
    }
    case "delete": {
      const agent = await own(r.id)
      if (!agent) return fail("Not found", 404, headers)
      await agents.delete().eq("id", agent.id)
      await forget(agent)
      return json({ ok: true })
    }
    case "post": {
      const { data: post } = await admin
        .from("comic_autopilot_posts")
        .select("*")
        .eq("id", r.id)
        .eq("user_id", viewer.id)
        .maybeSingle()
      if (!post) return fail("Not found", 404, headers)
      if (r.action === "reject") {
        await admin
          .from("comic_autopilot_posts")
          .update({ status: "rejected" })
          .eq("id", post.id)
        return json({ status: "rejected" })
      }
      if (r.text) {
        if ([...r.text].length > PLATFORM_LIMIT[post.platform])
          return fail(
            `Too long for this network (${PLATFORM_LIMIT[post.platform]} max).`,
            400,
            headers
          )
        await admin
          .from("comic_autopilot_posts")
          .update({ text: r.text })
          .eq("id", post.id)
        post.text = r.text
      }
      if (r.action === "edit") return json({ status: post.status })
      if (post.status !== "draft" && post.status !== "failed")
        return fail("Already sent.", 409, headers)
      return json({ status: await publishPost(post) })
    }
    case "squad": {
      const job = `autopilot_squad:${viewer.id}:${crypto.randomUUID()}`
      const spent = await admin.rpc("spend_credits_for", {
        p_user: viewer.id,
        p_cost: COSTS.autopilot_squad,
        p_kind: "autopilot_squad",
        p_job: job,
      })
      if (spent.error)
        return fail(
          spent.error.code === "P0402" ? "Out of credits." : "Couldn't charge.",
          402,
          headers
        )
      try {
        return json({ agents: await inventSquad(r) })
      } catch (e) {
        await admin.rpc("refund_credits_for", { p_user: viewer.id, p_job: job })
        console.error("Squad failed", e)
        return fail("Couldn't design the squad. Try again.", 500, headers)
      }
    }
    case "spawn": {
      if ((await count()) + r.agents.length > MAX_AGENTS)
        return fail(`A fleet holds ${MAX_AGENTS} agents.`, 400, headers)
      const rows = r.agents.map((a, i) => ({
        ...a,
        squad: r.squad,
        cadence: r.cadence,
        mode: r.mode,
        user_id: viewer.id,
        hue: hueOf(a.name),
        enabled: true,
        state: "sleeping" as const,
        next_run_at: stagger(i),
      }))
      const { data, error } = await agents.insert(rows).select("id")
      if (error) return fail("Couldn't create the squad.", 500, headers)
      return json({ ids: (data ?? []).map((d) => d.id) })
    }
  }
}
