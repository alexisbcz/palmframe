import type { MachineDraftRow } from "@/lib/database"
import { supabaseAdmin } from "@/lib/supabase-admin.server"

import type { RetractReason } from "./model"
import { lineOf } from "./stance"

type Words = Pick<
  MachineDraftRow,
  "text" | "take" | "alt" | "link" | "image_url" | "sources"
>
export type PublicPost = { id: string; published_at: string } & (
  | (Words & { retracted: null })
  | { retracted: { reason: RetractReason; at: string } }
)

// Public on purpose, and the only public read of machines: a switched-on page
// shows its name, mission, masthead and published posts, and never anything else.
// A retracted post keeps its place as a note, without its words.
export async function publicMachine(slug: string) {
  const admin = supabaseAdmin()
  const { data: machine } = await admin
    .from("comic_machines")
    .select("id, name, config, slug")
    .eq("slug", slug)
    .eq("public", true)
    .maybeSingle()
  if (!machine) return null
  const { data: rows } = await admin
    .from("comic_machine_drafts")
    .select(
      "id, status, text, take, alt, link, image_url, sources, published_at, retracted_at, retract_reason"
    )
    .eq("machine_id", machine.id)
    .in("status", ["published", "retracted"])
    .order("published_at", { ascending: false })
    .limit(50)
  const posts = rows ?? []
  const line = lineOf(machine.config)
  const { data: changes } = line
    ? await admin
        .from("comic_machine_line_notes")
        .select("from_stance, to_stance, created_at")
        .eq("machine_id", machine.id)
        .order("created_at", { ascending: false })
        .limit(20)
    : { data: null }
  return {
    name: machine.name,
    mission: machine.config.mission,
    language: machine.config.language,
    slug,
    masthead: line && {
      stance: line.stance,
      arena: line.arena,
      publisher: line.publisher,
      contact: line.contact,
      changes: changes ?? [],
    },
    posts: posts.flatMap((p): PublicPost[] =>
      p.status === "published" && p.published_at
        ? [{ ...p, retracted: null, published_at: p.published_at }]
        : p.published_at && p.retract_reason && p.retracted_at
          ? [
              {
                id: p.id,
                published_at: p.published_at,
                retracted: { reason: p.retract_reason, at: p.retracted_at },
              },
            ]
          : []
    ),
  }
}
