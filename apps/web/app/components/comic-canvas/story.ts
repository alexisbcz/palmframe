import { COSTS } from "@/lib/credits"
import { INSUFFICIENT_CREDITS, setCredits } from "@/lib/credits-store"
import type { DialogueKind, PlannedPanel, StoryPart } from "@/routes/api.story"

import { normalizeTag } from "./anima-tags"
import { pageFaces } from "./check"
import { readingOrder } from "./layouts"
import {
  createBubble,
  type BubbleLayer,
  type BubbleShape,
  type Character,
  type ComicPage,
  type ComicProject,
  type Layer,
  type PanelLayer,
  type Rect,
} from "./model"
import type { SeriesContext } from "./series"
import { panelRefs } from "./use-generator"

// What the story dialog holds for one panel before it's applied: the shot
// (tags, prose, cast) and its lettering as script lines ("Aki says: …").
export interface PanelDraft {
  tags: string[]
  prompt: string
  cast: string[]
  lines: string
  // The prompt template that planned it, kept on the panel once applied.
  planner?: string
}

export interface Line {
  speaker: string
  kind: DialogueKind
  text: string
}

// Verbs that mark a line, in the app's languages. Anything else after
// "Name:" is speech when Name is in the cast.
const VERBS: [DialogueKind, string[]][] = [
  [
    "say",
    [
      "says",
      "said",
      "asks",
      "replies",
      "whispers",
      "dit",
      "demande",
      "dice",
      "pregunta",
      "sagt",
      "fragt",
      "chiede",
    ],
  ],
  ["think", ["thinks", "pense", "piensa", "denkt", "pensa"]],
  [
    "shout",
    [
      "shouts",
      "yells",
      "screams",
      "crie",
      "hurle",
      "grita",
      "schreit",
      "ruft",
      "grida",
      "urla",
    ],
  ],
]
const CAPTION =
  /^(caption|narration|narrator|narrateur|narración|narrador|erzähler|didascalia|narratore|ナレーション|キャプション)\s*[:：]\s*(.+)$/i

export function parseLines(text: string, cast: Character[] = []): Line[] {
  const names = new Set(cast.map((c) => c.name.trim().toLowerCase()))
  return text
    .split("\n")
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((line): Line => {
      const caption = line.match(CAPTION)
      if (caption)
        return { speaker: "", kind: "caption", text: caption[2]!.trim() }
      // Japanese lettering: Aki「…」 is speech, Aki（…） a thought.
      const ja = line.match(/^([^:：「（(]+?)\s*([「（(])(.+)[」）)]$/)
      if (ja)
        return {
          speaker: ja[1]!.trim(),
          kind: ja[2] === "「" ? "say" : "think",
          text: ja[3]!.trim(),
        }
      const m = line.match(/^(.+?)\s+(\S+)\s*[:：]\s*(.+)$/)
      if (m) {
        const verb = m[2]!.toLowerCase()
        const kind = VERBS.find(([, vs]) => vs.includes(verb))?.[0]
        if (kind) return { speaker: m[1]!.trim(), kind, text: m[3]!.trim() }
      }
      const plain = line.match(/^(.+?)\s*[:：]\s*(.+)$/)
      if (plain && names.has(plain[1]!.trim().toLowerCase()))
        return {
          speaker: plain[1]!.trim(),
          kind: "say",
          text: plain[2]!.trim(),
        }
      // A bare line is narration.
      return { speaker: "", kind: "caption", text: line }
    })
}

const VERB_OUT: Record<DialogueKind, string> = {
  say: "says",
  think: "thinks",
  shout: "shouts",
  caption: "",
}

export function formatLines(lines: Line[]) {
  return lines
    .map((l) =>
      l.kind === "caption" || !l.speaker.trim()
        ? `Caption: ${l.text}`
        : `${l.speaker} ${VERB_OUT[l.kind]}: ${l.text}`
    )
    .join("\n")
}

// Names are keys: cast members named in the scene are cast in the panel.
// Capitalisation doesn't matter; nicknames don't match.
export function namedIn(text: string, cast: Character[] = []) {
  const lower = text.toLowerCase()
  return cast
    .filter((c) => {
      const name = c.name.trim().toLowerCase()
      if (!name) return false
      const at = lower.indexOf(name)
      if (at < 0) return false
      const before = lower[at - 1]
      const after = lower[at + name.length]
      const letter = (ch?: string) => !!ch && /\p{L}/u.test(ch)
      return !letter(before) && !letter(after)
    })
    .map((c) => c.id)
}

export function draftOf(panel: PanelLayer): PanelDraft {
  return {
    tags: panel.tags ?? [],
    prompt: panel.prompt ?? "",
    cast: panel.cast ?? [],
    lines: panel.script ?? "",
  }
}

export function draftFromPlan(
  plan: PlannedPanel,
  cast: Character[] = [],
  planner?: string
): PanelDraft {
  const ids = new Map(cast.map((c) => [c.name.trim().toLowerCase(), c.id]))
  return {
    tags: [...new Set(plan.tags.map(normalizeTag).filter(Boolean))],
    prompt: plan.prompt,
    cast: plan.characters
      .map((n) => ids.get(n.toLowerCase()))
      .filter((id): id is string => !!id),
    lines: formatLines(plan.dialogue),
    planner,
  }
}

// The panel's fields once a draft is applied.
export function panelPatch(draft: PanelDraft, cast: Character[] = []) {
  const named = namedIn(draft.prompt, cast)
  return {
    tags: draft.tags,
    prompt: draft.prompt.trim(),
    cast: [...new Set([...draft.cast, ...named])],
    ...(draft.planner && { planner: draft.planner }),
  }
}

const SHAPE: Record<DialogueKind, BubbleShape> = {
  say: "speech",
  think: "thought",
  shout: "shout",
  caption: "caption",
}

// A face on the page, with the name of whoever it belongs to.
export type SpeakerFace = Rect & { name: string | null }

export function speakerFaces(panel: PanelLayer, cast: Character[] = []) {
  return pageFaces(panel).map(({ who, ...box }): SpeakerFace => ({
    ...box,
    name: cast.find((c) => c.id === who)?.name.trim() || null,
  }))
}

// The speaker's face; the only face in the shot needs no name.
function faceOf(faces: SpeakerFace[], speaker: string) {
  const name = speaker.trim().toLowerCase()
  return (
    faces.find((f) => name && f.name?.toLowerCase() === name) ??
    (faces.length === 1 ? faces[0] : undefined)
  )
}

// How far a tail reaches past the balloon before it stops short of the face.
const TAIL_REACH = 200

// A tail tip towards the face's edge nearest the balloon, relative to the
// balloon's centre, or null when the balloon already sits on the face.
export function tailTowardFace(bubble: Rect, face: Rect) {
  const cx = bubble.x + bubble.width / 2
  const cy = bubble.y + bubble.height / 2
  const x = Math.min(face.x + face.width, Math.max(face.x, cx)) - cx
  const y = Math.min(face.y + face.height, Math.max(face.y, cy)) - cy
  const rx = bubble.width / 2
  const ry = bubble.height / 2
  if ((x / rx) ** 2 + (y / ry) ** 2 < 1) return null
  const length = Math.hypot(x, y)
  const s = Math.min(1, (Math.max(rx, ry) + TAIL_REACH) / length)
  return { tailX: Math.round(x * s), tailY: Math.round(y * s) }
}

// New tails for the bubbles already over a panel, for lettering placed
// before the art was checked. Bubbles keep their names from the script.
export function aimedTails(
  panel: PanelLayer,
  layers: Layer[],
  cast: Character[] = []
) {
  const faces = speakerFaces(panel, cast)
  if (!faces.length) return []
  return layers.flatMap((l) => {
    if (l.type !== "bubble" || l.hidden || l.locked || !l.tail) return []
    if (l.shape === "message") return []
    const cx = l.x + l.width / 2
    const cy = l.y + l.height / 2
    const inside =
      cx >= panel.x &&
      cx <= panel.x + panel.width &&
      cy >= panel.y &&
      cy <= panel.y + panel.height
    const face = inside ? faceOf(faces, l.name) : undefined
    const tail = face && tailTowardFace(l, face)
    if (!tail || (tail.tailX === l.tailX && tail.tailY === l.tailY)) return []
    return [{ id: l.id, ...tail }]
  })
}

// Bubbles for a panel's lines: captions in the top corner where reading
// starts, speech below them alternating sides, tails pointing into the shot,
// or at the speaker when the panel's faces are known.
export function bubblesFor(
  panel: PanelLayer,
  lines: Line[],
  rtl = false,
  faces: SpeakerFace[] = []
): BubbleLayer[] {
  const pad = Math.max(16, Math.round(panel.width * 0.04))
  const fontSize = Math.round(Math.min(40, Math.max(24, panel.width / 20)))
  let top = panel.y + pad
  let side = 0
  return lines.map((line) => {
    const shape = SHAPE[line.kind]
    const boxed = shape === "caption"
    const inset = boxed ? 0.86 : shape === "shout" ? 0.56 : 0.7
    const maxW = panel.width * (boxed ? 0.8 : 0.62)
    const text = line.text.trim()
    // Uppercase comic lettering runs about 0.62 em per character.
    const perLine = Math.max(6, Math.floor((maxW * inset) / (fontSize * 0.62)))
    const rows = Math.max(1, Math.ceil(text.length / perLine))
    const chars = Math.min(text.length, perLine)
    const width = Math.round(
      Math.min(
        maxW,
        Math.max(boxed ? 200 : 220, (chars * fontSize * 0.62) / inset + 24)
      )
    )
    const height = Math.round(
      Math.max(
        boxed ? 70 : 120,
        (rows * fontSize * 1.12) / inset + (boxed ? 24 : 16)
      )
    )
    // Captions sit where the eye enters; speech alternates from that side.
    const start = (side % 2 === 0) !== rtl
    const x = boxed
      ? rtl
        ? panel.x + panel.width - pad - width
        : panel.x + pad
      : start
        ? panel.x + pad
        : panel.x + panel.width - pad - width
    if (!boxed) side++
    const y = top
    top += height + Math.round(pad * 0.6)
    const bubble = createBubble(shape, { x: x + width / 2, y: y + height / 2 })
    const towardsCentre = panel.x + panel.width / 2 - (x + width / 2)
    const face = boxed ? undefined : faceOf(faces, line.speaker)
    const aimed = face && tailTowardFace({ x, y, width, height }, face)
    return {
      ...bubble,
      name: line.speaker.trim() || bubble.name,
      text,
      fontSize,
      width,
      height,
      x: Math.round(x),
      y: Math.round(y),
      tailX: aimed?.tailX ?? Math.round(towardsCentre * 0.25),
      tailY:
        aimed?.tailY ??
        Math.round(height / 2 + Math.min(90, panel.height * 0.12)),
    }
  })
}

// The credits a render of these panels costs, as the server will charge it.
export const panelCost = (
  panel: PanelLayer,
  project: Pick<ComicProject, "cast" | "world">
) => (panelRefs(panel, project).refs.length ? COSTS.panel_ref : COSTS.panel)

export function renderCost(
  panels: PanelLayer[],
  project: Pick<ComicProject, "cast" | "world">
) {
  return panels.reduce((sum, p) => sum + panelCost(p, project), 0)
}

// One slide's shots and lettering from the planner, by panel. `panels` are the
// frames to plan, in reading order; `part` places the slide in a longer story.
export async function requestPlan(
  project: ComicProject,
  pageIndex: number,
  panels: PanelLayer[],
  story: string,
  signal: AbortSignal,
  part?: StoryPart,
  series?: SeriesContext | null
) {
  const res = await fetch("/api/story", {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal,
    body: JSON.stringify({
      story,
      panels: panels.map((p) => ({
        id: p.id,
        width: p.width,
        height: p.height,
      })),
      cast: (project.cast ?? []).map((c) => ({
        name: c.name,
        kind: c.kind,
        tags: c.tags,
      })),
      style: project.look?.style ?? "graphic",
      rtl: !!project.rtl,
      recap: recapOf(project, pageIndex),
      part,
      ...(series && { previous: series.previous, facts: series.facts }),
    }),
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
  return Object.fromEntries(
    (json.panels as PlannedPanel[]).map((p) => [
      p.panel_id,
      draftFromPlan(p, project.cast, json.prompt),
    ])
  )
}

// A slide as text: what its panels show, then its lettering.
function slideText(project: ComicProject, page: ComicPage) {
  const panels = readingOrder(
    page.layers.filter((l): l is PanelLayer => l.type === "panel"),
    project.rtl
  )
  const lettering = page.layers
    .filter((l): l is BubbleLayer => l.type === "bubble" && !l.hidden)
    .map((b) => `${b.name}: ${b.text}`)
  return [
    ...panels
      .map((p, i) =>
        p.prompt?.trim() ? `Panel ${i + 1}: ${p.prompt.trim()}` : ""
      )
      .filter(Boolean),
    ...lettering,
  ].join("\n")
}

// A few lines on what the slide before showed, so the planner carries on.
export function recapOf(project: ComicProject, pageIndex: number) {
  const page = project.pages[pageIndex - 1]
  return page ? slideText(project, page).slice(0, 1_500) : ""
}

// Every slide with something on it, as text.
export function carouselText(project: ComicProject) {
  return project.pages
    .map((page, i) => {
      const text = slideText(project, page)
      return text && `Slide ${i + 1}:\n${text}`
    })
    .filter(Boolean)
    .join("\n\n")
}

// The recap across carousels: how the one before in the series ended.
export const seriesRecap = (project: ComicProject) =>
  carouselText(project).slice(-1_500)
