import * as React from "react"

import { TAG_GROUPS, addTag, type TagGroupId } from "./anima-tags"
import {
  DEFAULT_LOOK,
  uid,
  type Look,
  type PanelLayer,
  type StyleId,
} from "./model"

// A shot setup: the carousel style plus the panel's framing, angle and light,
// the four things a director picks before rolling.
export type Dimension = "framing" | "angle" | "light"
export interface Setup {
  id: string
  style: StyleId
  framing: string | null
  angle: string | null
  light: string | null
}

const GROUP: Record<Dimension, TagGroupId> = {
  framing: "framing",
  angle: "angle",
  light: "lighting",
}

export const dimensionTags = (d: Dimension) =>
  TAG_GROUPS.find((g) => g.id === GROUP[d])!.tags

export function readSetup(panel: PanelLayer, look: Look = DEFAULT_LOOK) {
  const tags = panel.tags ?? []
  const pick = (d: Dimension) =>
    dimensionTags(d).find((t) => tags.includes(t)) ?? null
  return {
    style: panel.style ?? look.style,
    framing: pick("framing"),
    angle: pick("angle"),
    light: pick("light"),
  }
}

// One tag per dimension: the setup replaces whatever framing, angle and
// light the panel had, and keeps every other tag.
export function setDimension(tags: string[], d: Dimension, tag: string | null) {
  const rest = tags.filter((t) => !dimensionTags(d).includes(t))
  return tag ? addTag(rest, tag) : rest
}

export function applySetup(tags: string[], s: Omit<Setup, "id" | "style">) {
  return (["framing", "angle", "light"] as const).reduce(
    (acc, d) => setDimension(acc, d, s[d]),
    tags
  )
}

export type BeatId =
  | "establishing"
  | "dialogue"
  | "reaction"
  | "action"
  | "hero"
  | "insert"
  | "night"
  | "glow"

// Recommended beats keep the carousel's style and set the camera and light.
export const BEATS: ({ id: BeatId } & Omit<Setup, "id" | "style">)[] = [
  { id: "establishing", framing: "very wide shot", angle: null, light: null },
  { id: "dialogue", framing: "upper body", angle: "from side", light: null },
  {
    id: "reaction",
    framing: "close-up",
    angle: null,
    light: "dramatic lighting",
  },
  { id: "action", framing: "full body", angle: "dutch angle", light: null },
  {
    id: "hero",
    framing: "cowboy shot",
    angle: "from below",
    light: "rim lighting",
  },
  { id: "insert", framing: "close-up", angle: "from above", light: null },
  { id: "night", framing: "wide shot", angle: null, light: "moonlight" },
  { id: "glow", framing: "upper body", angle: null, light: "screen light" },
]

const STORAGE_KEY = "palmframe:setups"

function read(): Setup[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

// Saved setups belong to the person, not the project, so they follow them
// from carousel to carousel.
export function useSavedSetups() {
  const [setups, setSetups] = React.useState<Setup[]>([])
  React.useEffect(() => setSetups(read()), [])
  const write = (next: Setup[]) => {
    setSetups(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {}
  }
  return {
    setups,
    save: (s: Omit<Setup, "id">) => {
      const same = setups.find(
        (x) =>
          x.style === s.style &&
          x.framing === s.framing &&
          x.angle === s.angle &&
          x.light === s.light
      )
      if (!same) write([{ ...s, id: uid() }, ...setups].slice(0, 24))
    },
    remove: (id: string) => write(setups.filter((s) => s.id !== id)),
  }
}
