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
import { machineConfig, machineInput, signalSchema } from "@/lib/machines/model"
import { OutOfCredits, writeDraft } from "@/lib/machines/writer.server"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/api.machines"

const id = z.uuid()
const body = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("labs"), on: z.boolean() }),
  z.object({ intent: z.literal("save"), machine: machineInput }),
  z.object({ intent: z.literal("remove"), id }),
  z.object({ intent: z.literal("run"), id, on: z.boolean() }),
  z.object({ intent: z.literal("draft"), id, signal: signalSchema }),
  z.object({ intent: z.literal("dismiss"), id }),
  z.object({ intent: z.literal("comic"), id }),
])

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
      const saved = machineId
        ? await supabase
            .from("comic_machines")
            .update({ ...fields, state: {}, last_error: null })
            .eq("id", machineId)
            .select("id")
            .single()
        : await supabase
            .from("comic_machines")
            .insert(fields)
            .select("id")
            .single()
      if (saved.error?.code === "P0429") return fail("limit", 409)
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
        .update({ enabled: r.on })
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
        const { error } = await supabase.from("comic_machine_drafts").upsert(
          {
            machine_id: machine.id,
            user_id: viewer.id,
            signal_id: r.signal.id,
            signal: r.signal,
            ...draft,
          },
          { onConflict: "machine_id,signal_id", ignoreDuplicates: true }
        )
        return error ? fail(error.message, 500) : Response.json({ ok: true })
      } catch (e) {
        if (e instanceof OutOfCredits) return fail("credits", 402)
        return fail(e instanceof Error ? e.message : String(e), 502)
      }
    }
    case "dismiss": {
      const { error } = await supabase
        .from("comic_machine_drafts")
        .update({ status: "dismissed" })
        .eq("id", r.id)
      return error ? fail(error.message, 500) : Response.json({ ok: true })
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
          title: draft.signal.title.slice(0, 120),
          data: comicFrom(draft),
        })
        .select("id")
        .single()
      if (project.error) return fail(project.error.message, 500)
      await supabase
        .from("comic_machine_drafts")
        .update({ status: "used", project_id: project.data.id })
        .eq("id", r.id)
      return Response.json({ project: project.data.id })
    }
  }
}
