import { z } from "zod"

import {
  createDefaultProject,
  createBubble,
  createPanel,
  layoutRects,
  LAYOUTS,
  uid,
} from "@/components/comic-canvas/model"
import type { MachineRow } from "@/lib/database"
import {
  InstagramError,
  connectBluesky,
  instagramEnabled,
  profileFor,
} from "@/lib/instagram.server"
import { lineStopFor, machinesHalted } from "@/lib/machines/control.server"
import { feedRefusal } from "@/lib/machines/datasets"
import { parseWebhook } from "@/lib/machines/discord"
import {
  carryToDiscord,
  connectDiscord,
  discordReady,
  removeDiscord,
  testDiscord,
  withdrawDiscord,
} from "@/lib/machines/discord.server"
import { evidenceLimit, holdReason } from "@/lib/machines/gate"
import {
  DISMISS_REASONS,
  RETRACT_REASONS,
  machineConfig,
  machineInput,
  rivalsOf,
  signalSchema,
  slugify,
} from "@/lib/machines/model"
import { publishDraft, retractDraft } from "@/lib/machines/publish.server"
import { usesDesk } from "@/lib/machines/stance"
import {
  UNREADABLE_CONFIG,
  approvalCheck,
} from "@/lib/machines/standards.server"
import { OutOfCredits, writeDraft } from "@/lib/machines/writer.server"
import { payingConnection } from "@/lib/openrouter.server"
import { supabaseAdmin } from "@/lib/supabase-admin.server"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/api.machines"

const id = z.uuid()
const body = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("labs"), on: z.boolean() }),
  z.object({ intent: z.literal("save"), machine: machineInput }),
  z.object({ intent: z.literal("remove"), id }),
  z.object({ intent: z.literal("run"), id, on: z.boolean() }),
  z.object({ intent: z.literal("draft"), id, signal: signalSchema }),
  z.object({
    intent: z.literal("dismiss"),
    id,
    reason: z.enum(DISMISS_REASONS).optional(),
  }),
  z.object({ intent: z.literal("comic"), id }),
  z.object({
    intent: z.literal("retract"),
    id,
    reason: z.enum(RETRACT_REASONS),
  }),
  z.object({
    intent: z.literal("approve"),
    id,
    text: z.string().trim().min(1).max(500),
  }),
  // Never logged, stored as sent or returned: see `connectDiscord`.
  z.object({
    intent: z.literal("discord_connect"),
    id,
    url: z.string().max(300),
  }),
  z.object({ intent: z.literal("discord_remove"), id }),
  z.object({ intent: z.literal("discord_test"), id }),
  z.object({
    intent: z.literal("bluesky"),
    identifier: z.string().trim().min(3).max(253),
    appPassword: z.string().trim().min(8).max(64),
  }),
])

// What the machines' guard trigger says, as codes the page can word.
const LINE_REFUSALS: Record<string, string> = {
  P0430: "one_stance",
  P0431: "cooldown",
  P0432: "review_first",
  P0433: "line_rules",
}

const fail = (error: string, status: number) =>
  Response.json({ error }, { status })

// One splash panel with the scene as its prompt and the post as its caption:
// ready to draw in the editor, which charges and renders as usual.
function comicFrom(draft: { text: string; scene: string }) {
  const project = createDefaultProject()
  const panel = createPanel(
    layoutRects(LAYOUTS[0]!.cells, project.width, project.height)[0]!
  )
  panel.prompt = draft.scene
  const caption = createBubble("caption", { x: project.width / 2, y: 170 })
  caption.text = draft.text
  caption.width = 860
  caption.height = 220
  caption.x = (project.width - caption.width) / 2
  caption.fontSize = 34
  caption.uppercase = false
  project.pages = [{ id: uid(), layers: [panel, caption] }]
  return project
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return fail("Method not allowed", 405)
  const { supabase, viewer, headers } = await getViewer(request)
  if (!viewer) return fail("Sign in first.", 401)
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return fail("Invalid request.", 400)
  const r = parsed.data

  if (r.intent === "labs") {
    const { error } = await supabase.auth.updateUser({
      data: { labs: { machines: r.on } },
    })
    if (error) return fail(error.message, 500)
    // Off means off: nothing keeps listening or spending in the background.
    if (!r.on)
      await supabase
        .from("comic_machines")
        .update({ enabled: false })
        .eq("user_id", viewer.id)
    return Response.json({ ok: true }, { headers })
  }

  if (!viewer.labs.machines) return fail("Not found", 404)

  switch (r.intent) {
    case "save": {
      const { id: machineId, ...fields } = r.machine
      if (
        fields.publish_mode === "auto" &&
        !fields.outputs.length &&
        !fields.public
      )
        return fail("Invalid request.", 400)
      if (usesDesk(fields.config) && (await payingConnection(viewer.id)))
        return fail("no_desk", 409)
      const refusal = feedRefusal(fields.config.feeds, {
        id: machineId,
        public: fields.public,
        usesDesk: usesDesk(fields.config),
      })
      if (refusal) return fail(refusal, 409)
      // A rival has to be yours and public, or neither page can say who owns both.
      const rivals = [...new Set(rivalsOf(fields.config))]
      if (rivals.length) {
        const { data: found } = await supabase
          .from("comic_machines")
          .select("id")
          .in("id", rivals)
          .eq("public", true)
        if (found?.length !== rivals.length) return fail("rival_rules", 409)
      }
      if (fields.public) {
        const { data: own } = machineId
          ? await supabase
              .from("comic_machines")
              .select("slug")
              .eq("id", machineId)
              .maybeSingle()
          : { data: null }
        // Keeps its address once it has one, so links and readers don't break.
        Object.assign(fields, {
          slug:
            own?.slug ??
            `${slugify(fields.name) || "machine"}-${crypto.randomUUID().slice(0, 6)}`,
        })
      }
      const saved = machineId
        ? await supabase
            .from("comic_machines")
            .update({
              ...fields,
              state: {},
              last_error: null,
              next_run_at: null,
            })
            .eq("id", machineId)
            .select("id")
            .single()
        : await supabase
            .from("comic_machines")
            .insert(fields)
            .select("id")
            .single()
      if (saved.error?.code === "P0429") return fail("limit", 409)
      const refused = LINE_REFUSALS[saved.error?.code ?? ""]
      if (refused) return fail(refused, 409)
      if (saved.error) return fail(saved.error.message, 500)
      return Response.json({ id: saved.data.id })
    }
    case "remove": {
      const { error } = await supabase
        .from("comic_machines")
        .delete()
        .eq("id", r.id)
      return error ? fail(error.message, 500) : Response.json({ ok: true })
    }
    case "run": {
      const { error } = await supabase
        .from("comic_machines")
        // Turning a machine on means its first run is the next tick.
        .update({
          enabled: r.on,
          ...(r.on && { next_run_at: null, failures: 0 }),
        })
        .eq("id", r.id)
      return error ? fail(error.message, 500) : Response.json({ ok: true })
    }
    case "draft": {
      const { data } = await supabase
        .from("comic_machines")
        .select("*")
        .eq("id", r.id)
        .maybeSingle()
      const machine = data as MachineRow | null
      if (!machine) return fail("Not found", 404)
      // This writer has no take and no desk.
      if (usesDesk(machineConfig.parse(machine.config)))
        return fail("no_wire", 409)
      const job = crypto.randomUUID()
      try {
        const draft = await writeDraft(
          viewer.id,
          r.signal,
          machineConfig.parse(machine.config),
          {
            async spend(cost) {
              const spent = await supabase.rpc("spend_credits", {
                p_cost: cost,
                p_kind: "machine_draft",
                p_job: job,
              })
              if (spent.error?.code === "P0402")
                throw new OutOfCredits(spent.error.message)
              if (spent.error) throw new Error(spent.error.message)
            },
            async refund() {
              await supabase.rpc("refund_credits", { p_job: job })
            },
          },
          request.signal
        )
        if (!draft) return Response.json({ passed: true })
        const evidence = [r.signal.facts, ...r.signal.samples].join("\n")
        const { language } = machineConfig.parse(machine.config)
        const { data: filed, error } = await supabaseAdmin()
          .from("comic_machine_drafts")
          .upsert(
            {
              machine_id: machine.id,
              user_id: viewer.id,
              signal_id: r.signal.id,
              signal: r.signal,
              evidence: evidenceLimit(evidence),
              ...draft,
              held: holdReason(draft.text, evidence, [r.signal], language),
            },
            { onConflict: "machine_id,signal_id", ignoreDuplicates: true }
          )
          .select("id, held")
        if (error) return fail(error.message, 500)
        const post = filed[0]
        if (post?.held === null) await carryToDiscord(post.id, machine)
        return Response.json({ ok: true })
      } catch (e) {
        if (e instanceof OutOfCredits) return fail("credits", 402)
        return fail(e instanceof Error ? e.message : String(e), 502)
      }
    }
    case "dismiss": {
      const { data: owned } = await supabase
        .from("comic_machine_drafts")
        .select("id")
        .eq("id", r.id)
        .maybeSingle()
      if (!owned) return fail("Not found", 404)
      const { data: dismissed, error } = await supabaseAdmin()
        .from("comic_machine_drafts")
        .update({ status: "dismissed", dismiss_reason: r.reason ?? null })
        .eq("id", r.id)
        .in("status", ["new", "failed", "used"])
        .select("id")
      if (error) return fail(error.message, 500)
      if (dismissed.length) await withdrawDiscord(r.id)
      return Response.json({ ok: true })
    }
    // A person read it: it may go out, in their words if they changed it.
    // Changed words are checked like the agent's, and a hold shows them why.
    // Approving those same words again means they've seen that and still want
    // it, so the text matches and this passes.
    case "approve": {
      const { data: draft } = await supabase
        .from("comic_machine_drafts")
        .select(
          "id, machine_id, text, scene, alt, evidence, sources, signal, desk, held"
        )
        .eq("id", r.id)
        .maybeSingle()
      if (!draft) return fail("Not found", 404)
      const { data: machine } = await supabase
        .from("comic_machines")
        .select("*")
        .eq("id", draft.machine_id)
        .maybeSingle()
      if (!machine) return fail("Not found", 404)
      if (await machinesHalted())
        return Response.json({ ok: false, halted: true, errors: [] })
      const config = machineConfig.safeParse(machine.config)
      if (config.success) {
        const stopped = await lineStopFor(machine, config.data, Date.now())
        if (stopped) return Response.json({ ok: false, stopped, errors: [] })
      }
      const { held, desk } = config.success
        ? await approvalCheck(
            r.text,
            draft,
            config.data.language,
            usesDesk(config.data),
            request.signal
          )
        : { held: UNREADABLE_CONFIG, desk: draft.desk }
      const { data: approved } = await supabaseAdmin()
        .from("comic_machine_drafts")
        .update(
          held !== null
            ? { text: r.text, held, desk }
            : { status: "approved", text: r.text, held: null, desk }
        )
        .eq("id", r.id)
        .in("status", ["new", "failed"])
        .select("id")
      if (!approved?.length) return fail("Not found", 404)
      // Discord only carries words that passed. The channel shouldn't keep words a
      // person just changed, and a hold they overruled stays out of it.
      const changed = r.text !== draft.text
      if (changed) await withdrawDiscord(r.id)
      if (held !== null) return Response.json({ ok: false, held, errors: [] })
      if (changed || draft.held === null)
        await carryToDiscord(r.id, machine as MachineRow)
      const result = await publishDraft(r.id, machine as MachineRow)
      return Response.json({
        ok: !!result?.published,
        halted: !!result?.halted,
        stopped: result?.stopped,
        errors: result?.errors.map((e) => e.error) ?? [],
      })
    }
    // Owner's own call, on any published post, at any time. Works during a halt
    // or a freeze, which only stop things going out.
    case "retract": {
      const { data: draft } = await supabase
        .from("comic_machine_drafts")
        .select("id, machine_id")
        .eq("id", r.id)
        .maybeSingle()
      if (!draft) return fail("Not found", 404)
      const result = await retractDraft(
        r.id,
        { id: draft.machine_id, user_id: viewer.id },
        r.reason
      )
      if (!result) return fail("Not found", 404)
      return Response.json({ ok: true, manual: result.manual.length })
    }
    case "discord_connect":
    case "discord_remove":
    case "discord_test": {
      if (!discordReady()) return fail("Not found", 404)
      const { data: machine } = await supabase
        .from("comic_machines")
        .select("id, user_id, name, config, public")
        .eq("id", r.id)
        .maybeSingle()
      if (!machine) return fail("Not found", 404)
      if (r.intent === "discord_remove")
        return (await removeDiscord(machine.id))
          ? Response.json({ ok: true })
          : fail("failed", 500)
      if (r.intent === "discord_connect") {
        const webhook = parseWebhook(r.url)
        if (!webhook) return fail("discord_url", 400)
        return (await connectDiscord(machine, webhook))
          ? Response.json({ ok: true })
          : fail("failed", 500)
      }
      const tested = await testDiscord(machine)
      if (tested === "sent") return Response.json({ ok: true })
      if (typeof tested === "object")
        return Response.json(
          { error: "discord_wait", ...tested },
          { status: 429 }
        )
      return fail(`discord_${tested}`, 409)
    }
    case "bluesky": {
      if (!instagramEnabled()) return fail("Not found", 404)
      try {
        await connectBluesky(
          await profileFor(viewer),
          r.identifier,
          r.appPassword
        )
        return Response.json({ ok: true })
      } catch (e) {
        if (!(e instanceof InstagramError)) console.error(e)
        return fail("bluesky", 400)
      }
    }
    case "comic": {
      const { data: draft } = await supabase
        .from("comic_machine_drafts")
        .select("*")
        .eq("id", r.id)
        .maybeSingle()
      if (!draft) return fail("Not found", 404)
      if (draft.project_id) return Response.json({ project: draft.project_id })
      const project = await supabase
        .from("comic_projects")
        .insert({
          title: (
            draft.signal?.title ??
            draft.sources[0]?.title ??
            draft.text
          ).slice(0, 120),
          data: comicFrom(draft),
        })
        .select("id")
        .single()
      if (project.error) return fail(project.error.message, 500)
      await supabaseAdmin()
        .from("comic_machine_drafts")
        .update({
          project_id: project.data.id,
          ...(draft.status === "new" && { status: "used" as const }),
        })
        .eq("id", r.id)
      return Response.json({ project: project.data.id })
    }
  }
}
