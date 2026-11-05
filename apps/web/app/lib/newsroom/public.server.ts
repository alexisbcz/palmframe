// What a publication's readers see. Read with the server's key, because the
// tables are closed to visitors, so every query filters to what's public.
import { supabaseAdmin } from "@/lib/supabase-admin.server"

const STORY_LIST = "id, slug, template, title, dek, cover, published_at"

export async function readPublication(slug: string) {
  const admin = supabaseAdmin()
  const { data: pub } = await admin
    .from("comic_newsrooms")
    .select("id, user_id, slug, name, tagline, accent, indexable")
    .eq("slug", slug)
    .eq("live", true)
    .maybeSingle()
  if (!pub) return null
  const { data: stories } = await admin
    .from("comic_deep_dives")
    .select(STORY_LIST)
    .eq("user_id", pub.user_id)
    .not("template", "is", null)
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(100)
  const { user_id: _owner, ...publication } = pub
  return { publication, stories: stories ?? [], owner: pub.user_id }
}

export async function readPublishedStory(slug: string, storySlug: string) {
  const found = await readPublication(slug)
  if (!found) return null
  const { data: story } = await supabaseAdmin()
    .from("comic_deep_dives")
    .select(
      "id, slug, template, lead, title, dek, body, cover, sources, facts, findings, published_at"
    )
    .eq("user_id", found.owner)
    .eq("slug", storySlug)
    .not("template", "is", null)
    .not("published_at", "is", null)
    .maybeSingle()
  if (!story) return null
  return {
    publication: found.publication,
    story: {
      ...story,
      sources: story.sources.map(({ url, title }) => ({ url, title })),
    },
    more: found.stories.filter((s) => s.slug !== storySlug).slice(0, 3),
  }
}
