// Fountain, the plain-text screenplay format, plus the page layout every reader
// and producer expects: Courier 12, 55 lines, and the column widths and margins
// below. A line in the editor and a line in the PDF come from the same parser.

export type Element =
  | "blank"
  | "scene"
  | "action"
  | "character"
  | "parenthetical"
  | "dialogue"
  | "transition"
  | "centered"
  | "lyric"
  | "section"
  | "synopsis"
  | "note"
  | "pagebreak"

export interface ScriptLine {
  type: Element
  // The line as written.
  raw: string
  // What gets printed: markers gone.
  text: string
  // How many characters at the start of `raw` are markers.
  prefix: number
  dual?: boolean
  // Fountain's optional #12# scene number.
  number?: string
}

const SCENE = /^(?:\.(?=[^.\s])|(?:INT|EXT|EST|INT\.?\/EXT|I\/E)[. ])/i
const TRANSITION = /^[\p{Lu}0-9 ]+ TO:$/u
const hasLetter = /\p{L}/u
const upper = (s: string) => s === s.toUpperCase() && hasLetter.test(s)

export function parseScript(source: string): ScriptLine[] {
  const raw = source.split("\n")
  const out: ScriptLine[] = []
  let inDialogue = false
  for (let i = 0; i < raw.length; i++) {
    const line = raw[i]!
    const trimmed = line.trim()
    const prevBlank = i === 0 || !raw[i - 1]!.trim()
    const nextBlank = i === raw.length - 1 || !raw[i + 1]!.trim()
    if (!trimmed) {
      // Two spaces keep a blank line inside a speech.
      if (inDialogue && line === "  ") {
        out.push({ type: "dialogue", raw: line, text: "", prefix: 0 })
        continue
      }
      inDialogue = false
      out.push({ type: "blank", raw: line, text: "", prefix: 0 })
      continue
    }
    if (/^={3,}\s*$/.test(trimmed)) {
      out.push({ type: "pagebreak", raw: line, text: "", prefix: line.length })
      inDialogue = false
      continue
    }
    if (trimmed[0] === "#") {
      const n = /^#+\s*/.exec(line)![0].length
      out.push({ type: "section", raw: line, text: line.slice(n), prefix: n })
      continue
    }
    if (/^=(?!=)/.test(trimmed)) {
      out.push({
        type: "synopsis",
        raw: line,
        text: trimmed.slice(1).trim(),
        prefix: 1,
      })
      continue
    }
    if (/^\[\[.*\]\]$/.test(trimmed)) {
      out.push({
        type: "note",
        raw: line,
        text: trimmed.slice(2, -2),
        prefix: 2,
      })
      continue
    }
    if (trimmed[0] === "~") {
      out.push({ type: "lyric", raw: line, text: trimmed.slice(1), prefix: 1 })
      continue
    }
    if (trimmed[0] === "!") {
      out.push({
        type: "action",
        raw: line,
        text: line.replace(/^\s*!/, ""),
        prefix: 1,
      })
      inDialogue = false
      continue
    }
    if (/^>.*<$/.test(trimmed)) {
      out.push({
        type: "centered",
        raw: line,
        text: trimmed.slice(1, -1).trim(),
        prefix: 1,
      })
      continue
    }
    if (trimmed[0] === ">") {
      out.push({
        type: "transition",
        raw: line,
        text: trimmed.slice(1).trim().toUpperCase(),
        prefix: 1,
      })
      inDialogue = false
      continue
    }
    if (inDialogue) {
      if (trimmed[0] === "(" && trimmed.endsWith(")"))
        out.push({ type: "parenthetical", raw: line, text: trimmed, prefix: 0 })
      else out.push({ type: "dialogue", raw: line, text: trimmed, prefix: 0 })
      continue
    }
    // A bare "." is a heading about to be typed.
    if (prevBlank && (SCENE.test(trimmed) || trimmed === ".")) {
      const number = /\s#([\w.-]+)#\s*$/.exec(trimmed)
      const forced = trimmed[0] === "."
      const text = (forced ? trimmed.slice(1) : trimmed)
        .replace(/\s#[\w.-]+#\s*$/, "")
        .toUpperCase()
      out.push({
        type: "scene",
        raw: line,
        text,
        prefix: forced ? 1 : 0,
        ...(number && { number: number[1] }),
      })
      continue
    }
    if (prevBlank && nextBlank && TRANSITION.test(trimmed)) {
      out.push({ type: "transition", raw: line, text: trimmed, prefix: 0 })
      continue
    }
    const forced = trimmed[0] === "@"
    const name = forced ? trimmed.slice(1) : trimmed
    const bare = name.replace(/\s*\^$/, "")
    const stem = bare.replace(/\s*\([^)]*\)\s*$/, "")
    if (prevBlank && (forced || (!nextBlank && upper(stem)))) {
      out.push({
        type: "character",
        raw: line,
        text: forced ? bare.toUpperCase() : bare,
        prefix: forced ? 1 : 0,
        ...(name !== bare && { dual: true }),
      })
      inDialogue = true
      continue
    }
    out.push({ type: "action", raw: line, text: line, prefix: 0 })
  }
  return out
}

// Layout --------------------------------------------------------------------

// Columns, in characters of 10-pitch Courier from the left edge of the page.
export const LAYOUT: Record<string, { indent: number; width: number }> = {
  scene: { indent: 15, width: 60 },
  action: { indent: 15, width: 60 },
  character: { indent: 37, width: 33 },
  parenthetical: { indent: 31, width: 25 },
  dialogue: { indent: 25, width: 35 },
  transition: { indent: 15, width: 60 },
  centered: { indent: 15, width: 60 },
  lyric: { indent: 25, width: 35 },
}
export const LINES_PER_PAGE = 55

export function wrap(text: string, width: number): string[] {
  if (text.length <= width) return [text]
  const out: string[] = []
  let line = ""
  for (const word of text.split(/\s+/)) {
    if (line && line.length + 1 + word.length > width) {
      out.push(line)
      line = ""
    }
    let w = word
    while (w.length > width) {
      out.push(w.slice(0, width))
      w = w.slice(width)
    }
    line = line ? `${line} ${w}` : w
  }
  if (line) out.push(line)
  return out
}

export interface PageLine {
  type: Element | "more" | "contd"
  text: string
  // Index into the parsed lines, so the editor can place page breaks.
  source: number
  scene?: string
}

export interface Page {
  number: number
  lines: PageLine[]
}

interface Chunk {
  lines: PageLine[]
  gapBefore: number
  // A speech may split across pages, at a sentence, with (MORE) and (CONT'D).
  speech?: string
  // Keep with whatever follows.
  keepNext?: boolean
}

const printed = (s: string) =>
  s.replace(/\*\*\*|\*\*|\*|_/g, "").replace(/\[\[.*?\]\]/g, "")

function chunks(script: ScriptLine[]): Chunk[] {
  const out: Chunk[] = []
  let sceneNo = 0
  for (let i = 0; i < script.length; i++) {
    const l = script[i]!
    if (
      l.type === "blank" ||
      l.type === "section" ||
      l.type === "synopsis" ||
      l.type === "note"
    )
      continue
    if (l.type === "pagebreak") {
      out.push({
        lines: [{ type: "pagebreak", text: "", source: i }],
        gapBefore: 0,
      })
      continue
    }
    if (l.type === "character") {
      const lines: PageLine[] = [{ type: "character", text: l.text, source: i }]
      let j = i + 1
      for (; j < script.length; j++) {
        const d = script[j]!
        if (
          d.type !== "dialogue" &&
          d.type !== "parenthetical" &&
          d.type !== "lyric"
        )
          break
        const { width } = LAYOUT[d.type]!
        for (const t of wrap(printed(d.text), width))
          lines.push({ type: d.type, text: t, source: j })
      }
      i = j - 1
      out.push({
        lines,
        gapBefore: 1,
        speech: l.text.replace(/\s*\(CONT'D\)$/, ""),
      })
      continue
    }
    const { width } = LAYOUT[l.type] ?? LAYOUT.action!
    if (l.type === "scene") sceneNo++
    const label = l.number ?? String(sceneNo)
    out.push({
      lines: wrap(printed(l.text), width).map((t) => ({
        type: l.type,
        text: t,
        source: i,
        ...(l.type === "scene" && { scene: label }),
      })),
      gapBefore: l.type === "scene" ? 2 : 1,
      keepNext: l.type === "scene",
    })
  }
  return out
}

export function paginate(script: ScriptLine[]): Page[] {
  const pages: Page[] = []
  let page: PageLine[] = []
  const flush = () => {
    if (page.length) pages.push({ number: pages.length + 1, lines: page })
    page = []
  }
  const room = () => LINES_PER_PAGE - page.length
  const list = chunks(script)
  for (let c = 0; c < list.length; c++) {
    const chunk = list[c]!
    if (chunk.lines[0]!.type === "pagebreak") {
      flush()
      continue
    }
    const gap = page.length ? chunk.gapBefore : 0
    const blank = () => ({
      type: "blank" as const,
      text: "",
      source: chunk.lines[0]!.source,
    })
    // A heading must have two lines of what follows beneath it.
    const follow = chunk.keepNext ? 2 + (list[c + 1]?.gapBefore ?? 0) : 0
    if (gap + chunk.lines.length + follow <= room()) {
      for (let i = 0; i < gap; i++) page.push(blank())
      page.push(...chunk.lines)
      continue
    }
    if (chunk.speech && room() - gap >= 4) {
      // Name, two lines, (MORE) at least; never a parenthetical last.
      let fit = room() - gap - 1
      while (fit > 1 && chunk.lines[fit - 1]?.type === "parenthetical") fit--
      const rest = chunk.lines.slice(fit)
      if (fit >= 3 && rest.length >= 2) {
        for (let i = 0; i < gap; i++) page.push(blank())
        page.push(...chunk.lines.slice(0, fit))
        page.push({
          type: "more",
          text: "(MORE)",
          source: chunk.lines[fit - 1]!.source,
        })
        flush()
        page.push({
          type: "contd",
          text: `${chunk.speech} (CONT'D)`,
          source: rest[0]!.source,
        })
        page.push(...rest)
        continue
      }
    }
    if (
      !chunk.speech &&
      !chunk.keepNext &&
      room() - gap >= 2 &&
      chunk.lines.length >= 4
    ) {
      const fit = room() - gap
      if (chunk.lines.length - fit >= 2) {
        for (let i = 0; i < gap; i++) page.push(blank())
        page.push(...chunk.lines.slice(0, fit))
        flush()
        page.push(...chunk.lines.slice(fit))
        continue
      }
    }
    flush()
    page.push(...chunk.lines)
  }
  flush()
  return pages
}

// A page of script runs about a minute on screen.
export const screenTime = (pages: number) => pages

// Reports -------------------------------------------------------------------

export interface Scene {
  line: number
  heading: string
  number: string
  place: string
  time: string
  interior: "INT" | "EXT" | "INT/EXT" | "OTHER"
  synopsis: string
  characters: string[]
  words: number
}

const nameOf = (s: string) => s.replace(/\s*\(.*$/, "").trim()

export function scenesOf(script: ScriptLine[]): Scene[] {
  const scenes: Scene[] = []
  let current: Scene | null = null
  let n = 0
  for (let i = 0; i < script.length; i++) {
    const l = script[i]!
    if (l.type === "scene") {
      n++
      const [, prefix = "", rest = ""] =
        /^((?:INT\.?\/EXT|I\/E|INT|EXT|EST)\.?)\s*(.*)$/i.exec(l.text) ?? []
      const [place, ...time] = (rest || l.text).split(/\s+[-–—]\s+/)
      current = {
        line: i,
        heading: l.text,
        number: l.number ?? String(n),
        place: (place ?? "").trim(),
        time: time.join(" - ").trim(),
        interior: /\//.test(prefix)
          ? "INT/EXT"
          : /^INT/i.test(prefix)
            ? "INT"
            : /^EXT/i.test(prefix)
              ? "EXT"
              : "OTHER",
        synopsis: "",
        characters: [],
        words: 0,
      }
      scenes.push(current)
    } else if (current) {
      if (l.type === "synopsis" && !current.synopsis) current.synopsis = l.text
      if (l.type === "character") {
        const who = nameOf(l.text)
        if (!current.characters.includes(who)) current.characters.push(who)
      }
      if (l.type === "action" || l.type === "dialogue")
        current.words += l.text.split(/\s+/).filter(Boolean).length
    }
  }
  return scenes
}

export interface CastMember {
  name: string
  speeches: number
  words: number
  scenes: number
}

export function castOf(script: ScriptLine[]): CastMember[] {
  const cast = new Map<string, CastMember & { seen: Set<number> }>()
  let scene = 0
  let who: (CastMember & { seen: Set<number> }) | null = null
  for (const l of script) {
    if (l.type === "scene") scene++
    if (l.type === "character") {
      const name = nameOf(l.text)
      who = cast.get(name) ?? {
        name,
        speeches: 0,
        words: 0,
        scenes: 0,
        seen: new Set(),
      }
      cast.set(name, who)
      who.speeches++
      who.seen.add(scene)
      who.scenes = who.seen.size
    } else if (l.type === "dialogue" && who) {
      who.words += l.text.split(/\s+/).filter(Boolean).length
    }
  }
  return [...cast.values()]
    .map(({ seen: _, ...c }) => c)
    .sort((a, b) => b.words - a.words)
}

export const locationsOf = (scenes: Scene[]) => [
  ...new Set(scenes.map((s) => s.place).filter(Boolean)),
]

// What to complete the current line with, Final Draft's SmartType.
export function completion(
  line: string,
  type: Element,
  names: string[],
  places: string[]
): string | null {
  const t = line.replace(/^[@.]/, "").toUpperCase()
  if (!t) return null
  if (type === "character") {
    const hit = names.find((n) => n.startsWith(t) && n !== t)
    return hit ? hit.slice(t.length) : null
  }
  if (type === "scene") {
    const m = /^((?:INT\.?\/EXT|I\/E|INT|EXT|EST)[. ]\s*)(.*)$/.exec(t)
    if (!m) return null
    const place = m[2]!
    const dash = /\s[-–—]\s(\w*)$/.exec(place)
    if (dash) {
      const hit = [
        "DAY",
        "NIGHT",
        "MORNING",
        "EVENING",
        "LATER",
        "CONTINUOUS",
        "MOMENTS LATER",
      ].find((x) => x.startsWith(dash[1]!) && x !== dash[1])
      return hit ? hit.slice(dash[1]!.length) : null
    }
    if (!place) return null
    const hit = places.find((p) => p.startsWith(place) && p !== place)
    return hit ? hit.slice(place.length) : null
  }
  return null
}
