import * as React from "react"
import { useRevalidator, useSearchParams } from "react-router"

import { PostCard } from "@/components/autopilot/parts"
import type { AgentPostRow } from "@/lib/autopilot/database"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/autopilot.queue"
import { useFleet } from "./autopilot"

const TABS = [
  { id: "draft", label: "Waiting for you" },
  { id: "sent", label: "Sent" },
  { id: "rejected", label: "Rejected" },
] as const

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = await getViewer(request)
  const tab = new URL(request.url).searchParams.get("tab") ?? "draft"
  let q = supabase
    .from("comic_autopilot_posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100)
  q =
    tab === "sent"
      ? q.in("status", ["published", "scheduled", "failed"])
      : tab === "rejected"
        ? q.eq("status", "rejected")
        : q.eq("status", "draft")
  const { data } = await q
  return { posts: (data ?? []) as AgentPostRow[], tab }
}

export default function Queue({ loaderData }: Route.ComponentProps) {
  const { agents } = useFleet()
  const [, setParams] = useSearchParams()
  const revalidator = useRevalidator()
  const byId = new Map(agents.map((a) => [a.id, a]))
  const [gone, setGone] = React.useState<Set<string>>(new Set())
  const posts = loaderData.posts.filter(
    (p) => loaderData.tab !== "draft" || !gone.has(p.id)
  )

  return (
    <div className="nr-page" style={{ maxWidth: 820 }}>
      <header className="nr-page-head">
        <h1>Review queue</h1>
        <p>
          Posts from agents in review mode wait here. Approve sends them through
          Zernio to your connected accounts; agents on autopilot skip this step.
        </p>
      </header>
      <div className="ap-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={loaderData.tab === t.id}
            onClick={() => setParams(t.id === "draft" ? {} : { tab: t.id })}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="ap-posts">
        {posts.length === 0 && (
          <p className="nr-empty">
            {loaderData.tab === "draft"
              ? "Nothing to review. Your agents will drop drafts here."
              : "Nothing here yet."}
          </p>
        )}
        {posts.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            agent={byId.get(p.agent_id)}
            onChange={() => {
              if (loaderData.tab === "draft")
                setGone((s) => new Set(s).add(p.id))
              void revalidator.revalidate()
            }}
          />
        ))}
      </div>
    </div>
  )
}
