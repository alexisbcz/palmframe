import * as React from "react"

import { uploadCover, withStoredImages } from "@/lib/cloud"
import { useSupabase } from "@/lib/supabase.browser"

import type { ComicProject } from "./model"
import type { ImageCache } from "./render"
import type { ComicEditor } from "./use-editor"

export interface CloudProject {
  id: string
  userId: string
  title: string
  revision: number
}

// conflict: another tab or device saved a newer version; we stop writing.
export type SyncStatus = "saved" | "saving" | "offline" | "error" | "conflict"

const SAVE_DELAY = 800
const RETRY_DELAY = 5000
const COVER_INTERVAL = 15_000

// What the first-slide cover depends on.
const coverKey = (p: ComicProject) => [
  p.pages[0],
  p.background,
  p.width,
  p.height,
  p.look,
]
const sameCover = (a: unknown[], b: unknown[]) => a.every((v, i) => v === b[i])

// Autosaves the editor's project to its comic_projects row. Each save bumps
// `revision` only if nobody else did, so a stale tab cannot overwrite work.
export function useCloudSync(
  editor: ComicEditor,
  cloud: CloudProject,
  images: ImageCache
) {
  const supabase = useSupabase()
  const [status, setStatus] = React.useState<SyncStatus>("saved")
  const [title, setTitle] = React.useState(cloud.title)

  const saved = React.useRef(editor.project)
  const revision = React.useRef(cloud.revision)
  const saving = React.useRef(false)
  const stopped = React.useRef(false)
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined)
  // Empty, so the first save of a session refreshes the cover.
  const cover = React.useRef<{ key: unknown[]; at: number }>({ key: [], at: 0 })

  const save = React.useCallback(async (): Promise<void> => {
    clearTimeout(timer.current)
    if (saving.current || stopped.current) return
    const project = editor.projectRef.current
    if (project === saved.current) return setStatus("saved")
    saving.current = true
    setStatus("saving")
    try {
      const data = await withStoredImages(supabase, cloud.userId, project)
      const { data: rows, error } = await supabase
        .from("comic_projects")
        .update({ data, revision: revision.current + 1 })
        .eq("id", cloud.id)
        .eq("revision", revision.current)
        .select("revision")
      if (error) throw error
      if (!rows.length) {
        stopped.current = true
        return setStatus("conflict")
      }
      revision.current = rows[0]!.revision
      saved.current = project
      void refreshCover(data)
    } catch {
      setStatus(navigator.onLine ? "error" : "offline")
      timer.current = setTimeout(save, RETRY_DELAY)
      return
    } finally {
      saving.current = false
    }
    // Edits made while this save was in flight go out next.
    if (editor.projectRef.current !== saved.current) void save()
    else setStatus("saved")
  }, [supabase, cloud.id, cloud.userId, editor.projectRef])

  // Throttled, and best effort: a missing cover only affects the list.
  const refreshCover = async (data: ComicProject) => {
    const key = coverKey(editor.projectRef.current)
    const now = Date.now()
    if (
      sameCover(key, cover.current.key) ||
      now - cover.current.at < COVER_INTERVAL
    )
      return
    cover.current = { key, at: now }
    try {
      const url = await uploadCover(
        supabase,
        cloud.userId,
        cloud.id,
        data,
        images
      )
      if (url)
        await supabase
          .from("comic_projects")
          .update({ cover: url })
          .eq("id", cloud.id)
    } catch {}
  }

  React.useEffect(() => {
    if (editor.project === saved.current || stopped.current) return
    setStatus((s) => (s === "saved" ? "saving" : s))
    clearTimeout(timer.current)
    timer.current = setTimeout(save, SAVE_DELAY)
  }, [editor.project, save])

  React.useEffect(() => {
    const flush = () => void save()
    const onHide = () => document.visibilityState === "hidden" && flush()
    // Warn before leaving with edits that have not reached the database.
    const onUnload = (e: BeforeUnloadEvent) => {
      if (editor.projectRef.current !== saved.current && !stopped.current)
        e.preventDefault()
    }
    window.addEventListener("online", flush)
    document.addEventListener("visibilitychange", onHide)
    window.addEventListener("beforeunload", onUnload)
    return () => {
      clearTimeout(timer.current)
      window.removeEventListener("online", flush)
      document.removeEventListener("visibilitychange", onHide)
      window.removeEventListener("beforeunload", onUnload)
    }
  }, [save, editor.projectRef])

  const rename = React.useCallback(
    async (next: string) => {
      const value = next.trim().slice(0, 120)
      setTitle(value)
      await supabase
        .from("comic_projects")
        .update({ title: value })
        .eq("id", cloud.id)
    },
    [supabase, cloud.id]
  )

  return { status, title, rename, save }
}

export type CloudSync = ReturnType<typeof useCloudSync>
