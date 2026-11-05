// Exports filed Newsroom stories as the front page's samples: the story, its
// sources and fact ledger into app/lib/newsroom/samples.json, and a cover into
// public/newsroom, drawn with Pruna from the agent's own cover scene.
//
//   bun --env-file=.env scripts/newsroom-samples.ts <story id> [<story id>...]
//
// Needs SUPABASE_URL, SUPABASE_SECRET_KEY and PRUNA_API_KEY.
import { writeFileSync, mkdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { createClient } from "@supabase/supabase-js"

import { withPruna } from "../app/lib/machines/image.server"
import { DESKS } from "../app/lib/newsroom/desks.server"
import type { Sample } from "../app/lib/newsroom/samples"
import { templateById } from "../app/lib/newsroom/templates"

const ids = process.argv.slice(2)
if (!ids.length) throw new Error("Pass the story ids to export.")

const db = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)
const root = join(dirname(fileURLToPath(import.meta.url)), "..")
mkdirSync(join(root, "public/newsroom"), { recursive: true })

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 60)
    .replace(/^-+|-+$/g, "")

const samples: Sample[] = []
for (const id of ids) {
  const { data: row, error } = await db
    .from("comic_deep_dives")
    .select("*")
    .eq("id", id)
    .single()
  if (error || !row) throw new Error(`No story ${id}: ${error?.message}`)
  const t = templateById(row.template)
  if (!t || !row.body) throw new Error(`${id} isn't a filed Newsroom story.`)
  const slug = slugify(row.title)
  const scene = row.cover?.scene ?? row.title
  const image = await withPruna(
    `Editorial cover image for a news story: ${scene}\n\n${DESKS[t.id].art}`,
    AbortSignal.timeout(120_000),
    "16:9"
  )
  const type = image.type.split(";")[0]
  const file = `${slug}.${type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg"}`
  writeFileSync(join(root, "public/newsroom", file), image.bytes)
  samples.push({
    slug,
    template: t.id,
    lead: row.lead,
    title: row.title,
    dek: row.dek,
    body: row.body,
    cover: `/newsroom/${file}`,
    filed: row.updated_at,
    sources: row.sources.map((s: { url: string; title: string }) => ({
      url: s.url,
      title: s.title,
    })),
    facts: row.facts,
    findings: row.findings,
  })
  console.log(`${t.name}: ${row.title} (${row.status})`)
}

const order = ["wire", "breakdown", "explainer", "feature", "profile", "pulse"]
samples.sort((a, b) => order.indexOf(a.template) - order.indexOf(b.template))
writeFileSync(
  join(root, "app/lib/newsroom/samples.json"),
  `${JSON.stringify(samples, null, 2)}\n`
)
