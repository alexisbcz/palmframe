import { useCallback, useEffect, useRef, useState } from "react"

import type { EpisodeRow, ShotRow } from "./database"
import type { CameraSetup, EpisodeSettings } from "./model"

export class AnimeCallError extends Error {}

export async function animeCall<T>(body: Record<string, unknown>) {
  const res = await fetch("/api/anime", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null)
  if (!res) throw new AnimeCallError("network")
  const reply = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new AnimeCallError(reply.error ?? "failed")
  return reply as T
}

export const errorCode = (e: unknown) =>
  e instanceof AnimeCallError ? e.message : "failed"

export type ShotView = Omit<ShotRow, "camera"> & { camera: CameraSetup }
export type EpisodeView = Omit<EpisodeRow, "settings"> & {
  settings: EpisodeSettings
}

interface Status {
  episode: EpisodeView
  shots: ShotView[]
  links: Record<string, string>
}

export const shotBusy = (s: ShotView) =>
  ["queued", "working"].includes(s.keyframe_status) ||
  ["queued", "working"].includes(s.voice_status) ||
  ["queued", "submitting", "rendering"].includes(s.video_status)

const POLL_MS = 3_000

// Live state of an episode. Signed links are kept by path, so a poll never
// swaps an image or a playing video's source.
export function useEpisode(id: string, initial: Status) {
  const [state, setState] = useState(initial)
  const links = useRef(initial.links)
  const latest = useRef(id)
  latest.current = id
  const refresh = useCallback(async () => {
    const next = await animeCall<Status>({
      intent: "status",
      id: latest.current,
      known: Object.keys(links.current),
    })
    links.current = { ...links.current, ...next.links }
    setState({ ...next, links: links.current })
  }, [])
  const running =
    state.episode.status === "directing"
      ? !state.episode.director_error
      : state.shots.some(shotBusy)
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => {
      if (!document.hidden) void refresh().catch(() => {})
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [running, refresh])
  return { ...state, running, refresh, setState }
}

export function uploadBlob(
  url: string,
  blob: Blob,
  onProgress: (share: number) => void
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", url)
    xhr.setRequestHeader("content-type", blob.type)
    xhr.setRequestHeader("x-upsert", "false")
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total)
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new AnimeCallError("failed"))
    xhr.onerror = () => reject(new AnimeCallError("network"))
    xhr.send(blob)
  })
}

export function saveFile(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
