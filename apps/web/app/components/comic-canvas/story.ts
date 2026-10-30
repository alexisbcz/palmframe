import { COSTS } from "@/lib/credits"
import type { DialogueKind, PlannedPanel } from "@/routes/api.story"

import { normalizeTag } from "./anima-tags"
import { readingOrder } from "./layouts"
import {
  createBubble,
  type BubbleLayer,
  type BubbleShape,
  type Character,
  type ComicProject,
  type PanelLayer,
} from "./model"
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
    lines: "",
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

// Bubbles for a panel's lines: captions in the top corner where reading
// starts, speech below them alternating sides, tails pointing into the shot.
export function bubblesFor(
  panel: PanelLayer,
  lines: Line[],
  rtl = false
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
    return {
      ...bubble,
      name: line.speaker.trim() || bubble.name,
      text,
      fontSize,
      width,
      height,
      x: Math.round(x),
      y: Math.round(y),
      tailX: Math.round(towardsCentre * 0.25),
      tailY: Math.round(height / 2 + Math.min(90, panel.height * 0.12)),
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

// A few lines on what the slide before showed, so the planner carries on.
export function recapOf(project: ComicProject, pageIndex: number) {
  const page = project.pages[pageIndex - 1]
  if (!page) return ""
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
  ]
    .join("\n")
    .slice(0, 1_500)
}
