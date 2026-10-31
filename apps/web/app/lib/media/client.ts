import { setCredits } from "@/lib/credits-store"

export type MediaError =
  "credits" | "busy" | "invalid" | "missing" | "unsupported" | "generic"

const KNOWN: MediaError[] = [
  "credits",
  "busy",
  "invalid",
  "missing",
  "unsupported",
]

export async function mediaPost(
  path: string,
  body: unknown
): Promise<{ id: string } | { error: MediaError }> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
    const json = (await res.json().catch(() => ({}))) as {
      id?: string
      balance?: number
      error?: MediaError
    }
    if (typeof json.balance === "number") setCredits(json.balance)
    if (res.ok && json.id) return { id: json.id }
    return { error: KNOWN.find((k) => k === json.error) ?? "generic" }
  } catch {
    return { error: "generic" }
  }
}

export const isOpen = (status: string) =>
  status === "queued" || status === "running"
