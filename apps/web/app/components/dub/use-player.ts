import * as React from "react"

import { mediaUrl } from "@/lib/dub/booth.client"
import { currentTake, lineAt, type Project } from "@/lib/dub/model"

import { useFrame } from "./use-booth"

export type Monitor = "original" | "dub"

const DRIFT = 0.18

// The picture, the bed and the takes are three separate media elements. The
// picture is the clock; the others follow it. Nothing here touches React state
// more than a few times a second.
export function usePlayer(project: Project | null) {
  const video = React.useRef<HTMLVideoElement | null>(null)
  const bed = React.useRef<HTMLAudioElement | null>(null)
  const voice = React.useRef<HTMLAudioElement | null>(null)
  const analyser = React.useRef<AnalyserNode | null>(null)
  const graph = React.useRef<AudioContext | null>(null)
  const [playing, setPlaying] = React.useState(false)
  const [monitor, setMonitor] = React.useState<Monitor>("dub")
  const [active, setActive] = React.useState(-1)
  const voiceLine = React.useRef("")
  const stopAt = React.useRef<number | null>(null)
  const projectRef = React.useRef(project)
  projectRef.current = project
  const monitorRef = React.useRef(monitor)
  monitorRef.current = monitor

  const id = project?.id ?? ""
  const hasStems = !!project?.stems
  const bedLevel = project?.mix.bed ?? 1
  const dubLevel = project?.mix.dub ?? 1
  const originalLevel = project?.mix.original ?? 0

  const attach = React.useCallback(() => {
    if (graph.current || !video.current || !voice.current || !bed.current)
      return
    try {
      const context = new AudioContext()
      const node = context.createAnalyser()
      node.fftSize = 1024
      for (const el of [video.current, bed.current, voice.current])
        context.createMediaElementSource(el).connect(node)
      node.connect(context.destination)
      graph.current = context
      analyser.current = node
    } catch {
      // The meter is a nicety. Sound carries on without it.
    }
  }, [])

  const stopVoice = () => {
    voice.current?.pause()
    voiceLine.current = ""
  }

  useFrame(() => {
    const v = video.current
    const p = projectRef.current
    if (!v || !p) return
    const time = v.currentTime
    const index = lineAt(p.lines, time)
    setActive((was) => (was === index ? was : index))
    if (stopAt.current !== null && time >= stopAt.current) {
      stopAt.current = null
      v.pause()
    }
    const dub = monitorRef.current === "dub"
    const line = p.lines[index]
    const take = line ? currentTake(line) : null
    const speaker = line && p.speakers.find((s) => s.id === line.speaker)
    const speaking = dub && !v.paused && !!take && !speaker?.muted

    // Without stems, the film's own track ducks while a take plays, as it will
    // in the master.
    if (dub && p.stems) v.volume = Math.min(1, p.mix.original)
    else if (dub) v.volume = Math.min(1, p.mix.bed) * (speaking ? 0.22 : 1)
    else v.volume = 1

    const b = bed.current
    if (b) {
      const wanted = dub && p.stems && !v.paused
      if (wanted) {
        b.volume = Math.min(1, p.mix.bed)
        if (b.paused) {
          b.currentTime = time
          void b.play().catch(() => undefined)
        } else if (Math.abs(b.currentTime - time) > DRIFT) b.currentTime = time
      } else if (!b.paused) b.pause()
    }

    const a = voice.current
    if (!a) return
    if (!speaking || !line || !take) {
      if (voiceLine.current) stopVoice()
      return
    }
    const key = `${line.id}:${take.file}`
    if (voiceLine.current !== key) {
      voiceLine.current = key
      a.src = mediaUrl(p.id, `takes/${take.file}`)
      a.currentTime = Math.max(0, time - line.start)
      a.volume = Math.min(1, p.mix.dub * (speaker?.level ?? 1))
      void a.play().catch(() => undefined)
    } else a.volume = Math.min(1, p.mix.dub * (speaker?.level ?? 1))
  })

  const seek = React.useCallback((time: number) => {
    const v = video.current
    if (!v) return
    stopAt.current = null
    v.currentTime = Math.max(0, time)
    stopVoice()
  }, [])

  const toggle = React.useCallback(() => {
    const v = video.current
    if (!v) return
    attach()
    void graph.current?.resume()
    stopAt.current = null
    if (v.paused) void v.play().catch(() => undefined)
    else v.pause()
  }, [attach])

  // Plays one line with a breath either side, the way a director runs it.
  const rehearse = React.useCallback(
    (start: number, end: number) => {
      const v = video.current
      if (!v) return
      attach()
      void graph.current?.resume()
      v.currentTime = Math.max(0, start - 0.6)
      stopVoice()
      stopAt.current = end + 0.5
      void v.play().catch(() => undefined)
    },
    [attach]
  )

  const pause = React.useCallback(() => video.current?.pause(), [])

  const level = React.useCallback(() => {
    const node = analyser.current
    if (!node) return 0
    const data = new Uint8Array(node.fftSize)
    node.getByteTimeDomainData(data)
    let peak = 0
    for (const value of data) peak = Math.max(peak, Math.abs(value - 128))
    return peak / 128
  }, [])

  return {
    video,
    bed,
    voice,
    playing,
    setPlaying,
    monitor,
    setMonitor,
    active,
    seek,
    toggle,
    rehearse,
    pause,
    level,
    time: () => video.current?.currentTime ?? 0,
    sources: {
      video: id ? mediaUrl(id, "proxy.mp4") : "",
      bed: id && hasStems ? mediaUrl(id, "bed.flac") : undefined,
    },
    levels: { bedLevel, dubLevel, originalLevel },
  }
}

export type Player = ReturnType<typeof usePlayer>
