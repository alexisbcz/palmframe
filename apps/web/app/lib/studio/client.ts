import { useCallback, useState } from "react"

// The browser's side of /api/studio: one request, its busy state and its error.
export type StudioError =
  | "credits"
  | "missing"
  | "busy"
  | "setup"
  | "invalid"
  | "unsupported"
  | "noBoard"
  | "generic"

const KNOWN: StudioError[] = [
  "credits",
  "missing",
  "busy",
  "setup",
  "invalid",
  "unsupported",
  "noBoard",
]

export async function studioPost<T>(body: unknown): Promise<T> {
  const res = await fetch("/api/studio", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(json.error ?? "generic")
  return json
}

export function useStudioCall() {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<StudioError | null>(null)
  const call = useCallback(
    async <T>(at: string, body: unknown): Promise<T | null> => {
      setBusy(at)
      setError(null)
      try {
        return await studioPost<T>(body)
      } catch (e) {
        const code = e instanceof Error ? e.message : ""
        setError(
          KNOWN.includes(code as StudioError)
            ? (code as StudioError)
            : "generic"
        )
        return null
      } finally {
        setBusy(null)
      }
    },
    []
  )
  return { busy, error, call }
}
