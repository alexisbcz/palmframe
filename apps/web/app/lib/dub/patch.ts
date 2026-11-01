import type { Line, Patch, Project, Speaker } from "./model"

// The page's own copy of what booth.py's apply_patch does, so an edit shows
// before the Booth has answered.
export function applyPatch(project: Project, patch: Patch): Project {
  const removed = new Set(patch.removeLines ?? [])
  const removedSpeakers = new Set(patch.removeSpeakers ?? [])
  let speakers = project.speakers
    .filter((s) => !removedSpeakers.has(s.id))
    .map((s) => {
      const changes = patch.speakers?.[s.id]
      return changes ? ({ ...s, ...changes } as Speaker) : s
    })
  for (const added of patch.addSpeakers ?? [])
    speakers = [
      ...speakers,
      {
        id: added.id,
        name: added.name,
        color: "#9a9a9a",
        voice: { kind: "stock", speaker: "Vivian" },
      },
    ]
  const fallback = speakers[0]?.id ?? ""
  const added: Line[] = (patch.addLines ?? []).map((l) => ({
    id: l.id,
    start: l.start,
    end: l.end,
    speaker: l.speaker,
    source: l.source ?? "",
    text: l.text ?? "",
    delivery: "",
    takes: [],
    pick: -1,
  }))
  const lines = [...project.lines, ...added]
    .filter((l) => !removed.has(l.id))
    .map((l) => {
      const changes = patch.lines?.[l.id]
      const next = changes ? { ...l, ...changes } : l
      return removedSpeakers.has(next.speaker)
        ? { ...next, speaker: fallback }
        : next
    })
    .sort((a, b) => a.start - b.start)
  return {
    ...project,
    title: patch.title ?? project.title,
    targetLang: patch.targetLang ?? project.targetLang,
    sourceLang: patch.sourceLang ?? project.sourceLang,
    mix: { ...project.mix, ...patch.mix },
    speakers,
    lines,
  }
}

const merged = <T extends object>(
  a?: Record<string, T>,
  b?: Record<string, T>
) => {
  if (!a) return b
  if (!b) return a
  const out = { ...a }
  for (const key of Object.keys(b)) out[key] = { ...out[key], ...b[key] } as T
  return out
}

const joined = <T>(a?: T[], b?: T[]) =>
  a || b ? [...(a ?? []), ...(b ?? [])] : undefined

export function mergePatch(a: Patch | null, b: Patch): Patch {
  if (!a) return b
  return {
    ...a,
    ...b,
    mix: a.mix || b.mix ? { ...a.mix, ...b.mix } : undefined,
    lines: merged(a.lines, b.lines),
    speakers: merged(a.speakers, b.speakers),
    addLines: joined(a.addLines, b.addLines),
    removeLines: joined(a.removeLines, b.removeLines),
    addSpeakers: joined(a.addSpeakers, b.addSpeakers),
    removeSpeakers: joined(a.removeSpeakers, b.removeSpeakers),
  }
}

// The way back from a patch. Only field edits undo: an added or removed line
// has takes on disk that a patch can't bring back, so those ask first instead.
export function invert(project: Project, patch: Patch): Patch | null {
  const inverse: Patch = {}
  if (patch.lines) {
    inverse.lines = {}
    for (const [id, changes] of Object.entries(patch.lines)) {
      const line = project.lines.find((l) => l.id === id)
      if (!line) continue
      const before: Record<string, unknown> = {}
      for (const key of Object.keys(changes))
        before[key] = line[key as keyof Line]
      inverse.lines[id] = before as Partial<Line>
    }
  }
  if (patch.speakers) {
    inverse.speakers = {}
    for (const [id, changes] of Object.entries(patch.speakers)) {
      const speaker = project.speakers.find((s) => s.id === id)
      if (!speaker) continue
      const before: Record<string, unknown> = {}
      for (const key of Object.keys(changes))
        before[key] = speaker[key as keyof Speaker]
      inverse.speakers[id] = before as Partial<Speaker>
    }
  }
  return inverse.lines || inverse.speakers ? inverse : null
}
