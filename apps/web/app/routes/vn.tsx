import * as React from "react"
import { data, useNavigate } from "react-router"
import { createClient } from "@supabase/supabase-js"

import { NovelPlayer } from "@/components/novel/player"
import { DEMO_SLUG, demoNovel } from "@/lib/novel/demo"
import { toNovel } from "@/lib/novel/model"
import { seo } from "@/lib/seo"
import { supabaseEnv } from "@/lib/supabase.server"

import type { Route } from "./+types/vn"

export const meta: Route.MetaFunction = ({ loaderData }) =>
  loaderData
    ? seo({
        title: loaderData.novel.title,
        description: loaderData.novel.synopsis,
        path: `/vn/${loaderData.slug}`,
      })
    : [{ title: "Palmframe" }]

// A release is readable by anyone with its link, signed in or not, so this reads
// it as an anonymous visitor.
export async function loader({ params }: Route.LoaderArgs) {
  if (params.slug === DEMO_SLUG) return { slug: DEMO_SLUG, novel: demoNovel() }
  const { url, key } = supabaseEnv()
  const anon = createClient(url, key, { auth: { persistSession: false } })
  const { data: row } = await anon
    .from("comic_novel_releases")
    .select("data")
    .eq("slug", params.slug)
    .maybeSingle()
  if (!row) throw data("Not found", { status: 404 })
  return { slug: params.slug, novel: toNovel(row.data) }
}

export default function NovelReader({ loaderData }: Route.ComponentProps) {
  const navigate = useNavigate()
  const { slug, novel } = loaderData
  const counted = React.useRef(false)
  return (
    <div className="fixed inset-0 bg-black">
      <NovelPlayer
        novel={novel}
        storageKey={slug}
        onExit={() => navigate("/")}
        onStart={() => {
          if (counted.current || slug === DEMO_SLUG) return
          counted.current = true
          void fetch(`/vn/${slug}`, { method: "POST" }).catch(() => {})
        }}
      />
    </div>
  )
}

// Counts a play. The function only ever adds one to a release.
export async function action({ params }: Route.ActionArgs) {
  const { url, key } = supabaseEnv()
  const anon = createClient(url, key, { auth: { persistSession: false } })
  await anon.rpc("comic_novel_played", { p_slug: params.slug })
  return new Response(null, { status: 204 })
}
