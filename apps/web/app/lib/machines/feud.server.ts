import type { MachineRow } from "@/lib/database"
import { supabaseAdmin } from "@/lib/supabase-admin.server"

import { FeedRefused } from "./feeds.server"
import { type Item, type PostSource, rivalsOf } from "./model"

const POSTS = 10

// A machine reading another of its owner's outlets, as something to answer and
// never as evidence. Both pages have to be public, because that's where they say
// who owns them: see `publicMachine`. A post that answered a rival isn't read in
// turn, so nothing here can loop or launder one machine's words into another's
// facts.
export async function readRival(
  machine: Pick<MachineRow, "user_id" | "public">,
  rivalId: string,
  origin: string
): Promise<Item[]> {
  const admin = supabaseAdmin()
  const { data: rival } = await admin
    .from("comic_machines")
    .select("id, name, slug, public")
    .eq("id", rivalId)
    .eq("user_id", machine.user_id)
    .maybeSingle()
  if (!machine.public || !rival?.public || !rival.slug)
    throw new FeedRefused(rival?.name ?? "rival")
  const { data: posts } = await admin
    .from("comic_machine_drafts")
    .select("id, text, sources, published_at")
    .eq("machine_id", rival.id)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(POSTS)
  const url = new URL(`/m/${rival.slug}`, origin).href
  if (!url.startsWith("https://")) return []
  return (posts ?? []).flatMap((post): Item[] =>
    post.published_at && !post.sources.some(answersARival)
      ? [
          {
            key: `rival:${rival.id}:${post.id}`,
            source: rival.name.slice(0, 120),
            title: post.text.slice(0, 500),
            summary: "",
            url,
            at: Date.parse(post.published_at),
            role: "foil",
          },
        ]
      : []
  )
}

const answersARival = (source: PostSource) => source.role === "foil"

// The owner's public outlets that read this one or are read by it. Both of a pair
// are public or the runner won't read either way, so this list is each page's half
// of the disclosure.
export async function sameOwnerOutlets(machine: {
  id: string
  user_id: string
  config: unknown
}) {
  const { data } = await supabaseAdmin()
    .from("comic_machines")
    .select("id, name, slug, config")
    .eq("user_id", machine.user_id)
    .eq("public", true)
    .neq("id", machine.id)
  const mine = rivalsOf(machine.config)
  return (data ?? []).flatMap((other) =>
    other.slug &&
    (mine.includes(other.id) || rivalsOf(other.config).includes(machine.id))
      ? [{ name: other.name, slug: other.slug }]
      : []
  )
}
