import { useCallback, useEffect, useRef, useState } from "react"

import { setCredits } from "@/lib/credits-store"

import { MAX_BOOK_BYTES } from "./limits"
import { BOOK_FORMATS, type JobKind, type JobStatus } from "./model"

// The browser's side of /api/books.
export class BookCallError extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}

export async function bookCall<T>(
  intent: string,
  body: Record<string, unknown> = {}
): Promise<T> {
  let res: Response
  try {
    res = await fetch("/api/books", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent, ...body }),
    })
  } catch {
    throw new BookCallError("failed")
  }
  const json = (await res.json().catch(() => ({}))) as T & {
    error?: string
    balance?: number | null
  }
  if (typeof json.balance === "number") setCredits(json.balance)
  if (!res.ok) throw new BookCallError(json.error ?? "failed")
  return json
}

export interface JobView {
  id: string
  book_id: string
  kind: JobKind
  status: JobStatus
  done: number
  total: number
  billable: number
  credits_charged: number
  credits_used: number
  payer: "credits" | "openrouter" | "free"
  params: { format?: string; bilingual?: boolean; mode?: string }
  result: {
    size?: number
    format?: string
    bilingual?: boolean
    untranslated?: number
  } | null
  error: string | null
  waiting: boolean
  created_at: string
  finished_at: string | null
}

export const isActive = (j: JobView) =>
  j.status === "queued" || j.status === "running"

export const ACCEPT = BOOK_FORMATS.map((f) => `.${f}`)
  .concat([".markdown", ".htm"])
  .join(",")

export function fileError(file: File) {
  if (file.size > MAX_BOOK_BYTES) return "too_large"
  if (!file.size) return "empty"
  return null
}

// Straight to storage, past the function body limit. XHR, because fetch can't
// report upload progress.
export function uploadFile(
  url: string,
  file: File,
  onProgress: (share: number) => void
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", url)
    xhr.setRequestHeader(
      "content-type",
      file.type || "application/octet-stream"
    )
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total)
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new BookCallError(xhr.status === 413 ? "too_large" : "failed"))
    xhr.onerror = () => reject(new BookCallError("failed"))
    xhr.send(file)
  })
}

const POLL_MS = 2_500

// Re-reads while `active`, so progress is live without a socket per book.
export function usePolling<T>(
  load: () => Promise<T>,
  active: (value: T | null) => boolean,
  initial: T | null = null
) {
  const [value, setValue] = useState<T | null>(initial)
  const latest = useRef({ load, active })
  latest.current = { load, active }
  const refresh = useCallback(async () => {
    const next = await latest.current.load()
    setValue(next)
    return next
  }, [])
  const running = active(value)
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => {
      if (!document.hidden) void refresh().catch(() => {})
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [running, refresh])
  return { value, refresh }
}

export function downloadText(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }))
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

const UNITS = ["B", "KB", "MB", "GB"]

export function formatBytes(bytes: number, locale: string) {
  const unit = Math.min(
    UNITS.length - 1,
    Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(1024))
  )
  const value = bytes / 1024 ** unit
  return `${value.toLocaleString(locale, { maximumFractionDigits: unit > 1 ? 1 : 0 })} ${UNITS[unit]}`
}
