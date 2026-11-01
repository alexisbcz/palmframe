import * as React from "react"

import {
  BoothError,
  booth,
  claimPairing,
  readToken,
} from "@/lib/dub/booth.client"
import { applyPatch, invert, mergePatch } from "@/lib/dub/patch"
import type { BoothStatus, Job, Patch, Project } from "@/lib/dub/model"

export type Link = "checking" | "offline" | "unpaired" | "ready"

// Whether the Booth is running and this browser is paired with it. It polls
// while waiting, so starting the Booth in Terminal is all it takes.
export function useBoothLink() {
  const [link, setLink] = React.useState<Link>("checking")
  const [status, setStatus] = React.useState<BoothStatus | null>(null)

  const check = React.useCallback(async () => {
    claimPairing()
    try {
      await booth.hello()
    } catch {
      setLink("offline")
      return
    }
    if (!readToken()) {
      setLink("unpaired")
      return
    }
    try {
      setStatus(await booth.status())
      setLink("ready")
    } catch (e) {
      setLink(
        e instanceof BoothError && e.status === 401 ? "unpaired" : "offline"
      )
    }
  }, [])

  // The pairing link can land on a page that's already open, as a change to
  // the fragment alone.
  React.useEffect(() => {
    void check()
    const paired = () => void check()
    window.addEventListener("hashchange", paired)
    return () => window.removeEventListener("hashchange", paired)
  }, [check])

  React.useEffect(() => {
    if (link === "ready") return
    const timer = setInterval(() => void check(), 2000)
    return () => clearInterval(timer)
  }, [link, check])

  return { link, status, check }
}

const ACTIVE = new Set(["queued", "running"])

export function useReel(id: string) {
  const [project, setProject] = React.useState<Project | null>(null)
  const [jobs, setJobs] = React.useState<Job[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [undoable, setUndoable] = React.useState(false)
  const shown = React.useRef<Project | null>(null)
  const pending = React.useRef<Patch | null>(null)
  const sending = React.useRef(false)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const undo = React.useRef<Patch[]>([])

  const show = (next: Project) => {
    shown.current = next
    setProject(next)
  }

  const refresh = React.useCallback(async () => {
    // The page's copy is ahead of the Booth's while an edit is on its way.
    if (pending.current || sending.current) return
    try {
      const reply = await booth.project(id, shown.current?.rev)
      setJobs(reply.jobs)
      if (reply.project && !pending.current && !sending.current)
        show(reply.project)
      setError(null)
    } catch (e) {
      setError(e instanceof BoothError ? e.code : "generic")
    }
  }, [id])

  const flush = React.useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const patch = pending.current
    if (!patch) return
    pending.current = null
    sending.current = true
    try {
      await booth.patch(id, patch)
    } catch (e) {
      setError(e instanceof BoothError ? e.code : "generic")
    } finally {
      sending.current = false
    }
    if (!pending.current) await refresh()
  }, [id, refresh])

  const patch = React.useCallback(
    (change: Patch, options?: { now?: boolean; history?: boolean }) => {
      const current = shown.current
      if (!current) return
      if (options?.history !== false) {
        const inverse = invert(current, change)
        if (inverse) {
          undo.current = [...undo.current.slice(-49), inverse]
          setUndoable(true)
        }
      }
      show(applyPatch(current, change))
      pending.current = mergePatch(pending.current, change)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void flush(), options?.now ? 0 : 450)
    },
    [flush]
  )

  const undoLast = React.useCallback(() => {
    const last = undo.current.pop()
    setUndoable(undo.current.length > 0)
    if (last) patch(last, { now: true, history: false })
  }, [patch])

  // A job started from the page shows at once rather than on the next poll.
  const run = React.useCallback(
    async (start: () => Promise<Job | unknown>) => {
      await flush()
      setError(null)
      try {
        await start()
      } catch (e) {
        setError(e instanceof BoothError ? e.code : "generic")
      }
      await refresh()
    },
    [flush, refresh]
  )

  const working = jobs.some((j) => ACTIVE.has(j.state))
  React.useEffect(() => {
    void refresh()
    const every = setInterval(() => void refresh(), working ? 700 : 2500)
    return () => clearInterval(every)
  }, [refresh, working])

  // An unsent edit goes out before the tab does.
  React.useEffect(() => {
    const leave = () => void flush()
    window.addEventListener("pagehide", leave)
    return () => {
      window.removeEventListener("pagehide", leave)
      void flush()
    }
  }, [flush])

  return {
    project,
    jobs,
    error,
    setError,
    patch,
    run,
    refresh,
    undoable,
    undoLast,
    flush,
  }
}

export function useRecorder() {
  const [recording, setRecording] = React.useState(false)
  const [level, setLevel] = React.useState(0)
  const stopRef = React.useRef<(() => void) | null>(null)

  const start = React.useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false },
    })
    const recorder = new MediaRecorder(stream)
    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => chunks.push(e.data)
    const context = new AudioContext()
    const analyser = context.createAnalyser()
    context.createMediaStreamSource(stream).connect(analyser)
    const data = new Uint8Array(analyser.fftSize)
    let raf = 0
    const meter = () => {
      analyser.getByteTimeDomainData(data)
      setLevel(Math.max(...data.subarray(0, 256)) / 128 - 1)
      raf = requestAnimationFrame(meter)
    }
    meter()
    recorder.start()
    setRecording(true)
    return new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        cancelAnimationFrame(raf)
        stream.getTracks().forEach((t) => t.stop())
        void context.close()
        setRecording(false)
        setLevel(0)
        resolve(new Blob(chunks, { type: recorder.mimeType }))
      }
      stopRef.current = () => recorder.stop()
    })
  }, [])

  const stop = React.useCallback(() => stopRef.current?.(), [])
  return { recording, level, start, stop }
}

// Reads a piece of the band's clock without re-rendering every frame.
export function useFrame(callback: () => void) {
  const latest = React.useRef(callback)
  latest.current = callback
  React.useEffect(() => {
    let raf = 0
    const frame = () => {
      latest.current()
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])
}
