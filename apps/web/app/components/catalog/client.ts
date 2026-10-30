import { INSUFFICIENT_CREDITS, setCredits } from "@/lib/credits-store"

export async function catalogRequest(body: Record<string, unknown>) {
  const res = await fetch("/api/catalog", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(json?.error ?? res.statusText)
  return json
}

export async function polishIdea(kind: string, idea: string) {
  const res = await fetch("/api/catalog/idea", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, idea }),
  })
  const credits = res.headers.get("x-credits")
  if (credits !== null) setCredits(Number(credits))
  const json = await res.json().catch(() => null)
  if (!res.ok)
    throw new Error(
      json?.code === INSUFFICIENT_CREDITS
        ? INSUFFICIENT_CREDITS
        : (json?.error ?? `HTTP ${res.status}`)
    )
  return json as {
    name: string
    description: string
    tags: string[]
    genres: string[]
  }
}

// Where the "use" link leads: the editor applies `assets` when it opens.
export const editorLink = (projectId: string | null, ids: string[]) =>
  `${projectId ? `/p/${projectId}` : "/"}?assets=${ids.join(",")}`
