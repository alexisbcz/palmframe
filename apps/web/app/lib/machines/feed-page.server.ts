import { supabaseAdmin } from "@/lib/supabase-admin.server"

// Public on purpose, and the only public read of machines: a switched-on page
// shows its name, mission and published posts, and never anything else.
export async function publicMachine(slug: string) {
  const admin = supabaseAdmin()
  const { data: machine } = await admin
    .from("comic_machines")
    .select("id, name, config, slug")
    .eq("slug", slug)
    .eq("public", true)
    .maybeSingle()
  if (!machine) return null
  const { data: posts } = await admin
    .from("comic_machine_drafts")
    .select("id, text, alt, link, image_url, sources, published_at")
    .eq("machine_id", machine.id)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(50)
  return {
    name: machine.name,
    mission: machine.config.mission,
    language: machine.config.language,
    slug,
    posts: posts ?? [],
  }
}
