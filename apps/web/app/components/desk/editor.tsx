import * as React from "react"
import { baseKeymap } from "@tiptap/pm/commands"
import { history, redo, undo } from "@tiptap/pm/history"
import { keymap } from "@tiptap/pm/keymap"
import { Fragment, Node, Schema, Slice } from "@tiptap/pm/model"
import {
  EditorState,
  Plugin,
  PluginKey,
  TextSelection,
  type Transaction,
} from "@tiptap/pm/state"
import { Decoration, DecorationSet, EditorView } from "@tiptap/pm/view"

import {
  completion,
  locationsOf,
  paginate,
  parseScript,
  scenesOf,
  castOf,
  type Element,
  type ScriptLine,
} from "@/lib/desk/fountain"
import { isSceneBreak, type Kind } from "@/lib/desk/model"
import {
  alliteration,
  checkForm,
  rhymeScheme,
  scanWords,
  syllableCount,
  type PoemForm,
} from "@/lib/desk/poetry"
import type { Alert } from "@/lib/desk/vale/vale"

// One editor for prose, verse and Fountain. The document is only lines of plain
// text; everything that looks like formatting is a decoration worked out from
// that text, so what's saved is exactly what a person could type in a text file.

const schema = new Schema({
  nodes: {
    doc: { content: "line+" },
    line: {
      content: "text*",
      toDOM: () => ["div", { class: "dk-line" }, 0],
      parseDOM: [{ tag: "div" }, { tag: "p" }],
    },
    text: {},
  },
})

const toDoc = (body: string) =>
  schema.node(
    "doc",
    null,
    body
      .split("\n")
      .map((l) => schema.node("line", null, l ? schema.text(l) : undefined))
  )

export const toText = (doc: Node) => {
  const out: string[] = []
  doc.forEach((n) => void out.push(n.textContent))
  return out.join("\n")
}

const lineStarts = (doc: Node) => {
  const at: number[] = []
  doc.forEach((_, offset) => void at.push(offset + 1))
  return at
}

// From an offset in the plain text to a position in the document.
function posOf(text: string, offset: number) {
  let line = 0
  for (
    let i = text.indexOf("\n");
    i !== -1 && i < offset;
    i = text.indexOf("\n", i + 1)
  )
    line++
  return offset + 1 + line
}

export interface Tools {
  scansion: boolean
  rhymes: boolean
  sound: boolean
  focus: boolean
  typewriter: boolean
}

export interface Find {
  query: string
  index: number
}

interface Context {
  kind: Kind
  language: "en" | "fr"
  form: PoemForm | null
  tools: Tools
  alerts: Alert[]
  find: Find | null
  dictReady: number
}

const key = new PluginKey<{
  ctx: Context
  set: DecorationSet
  script: ScriptLine[]
}>("desk")

const inlineMarks = (text: string, at: number, out: Decoration[]) => {
  const re = /(\*\*\*|\*\*|\*)(?=\S)(.+?)(?<=\S)\1/g
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const s = at + m.index
    const n = m[1]!.length
    const cls = n === 1 ? "dk-i" : n === 2 ? "dk-b" : "dk-i dk-b"
    out.push(
      Decoration.inline(s, s + n, { class: "dk-mk" }),
      Decoration.inline(s + n, s + m[0].length - n, { class: cls }),
      Decoration.inline(s + m[0].length - n, s + m[0].length, {
        class: "dk-mk",
      })
    )
  }
}

const RHYME_INK = [
  "#a2382b",
  "#23607a",
  "#5a7a2c",
  "#8a5a1c",
  "#6a3f80",
  "#2f7a6a",
  "#a0487a",
  "#4a5aa0",
]

function buildDecorations(doc: Node, ctx: Context, script: ScriptLine[]) {
  const out: Decoration[] = []
  const starts = lineStarts(doc)
  const lines: string[] = []
  doc.forEach((n) => void lines.push(n.textContent))

  if (ctx.kind === "novel") {
    let afterBreak = true
    doc.forEach((node, offset, i) => {
      const text = lines[i]!
      if (isSceneBreak(text)) {
        out.push(
          Decoration.node(offset, offset + node.nodeSize, { class: "dk-break" })
        )
        afterBreak = true
        return
      }
      if (text.trim()) {
        out.push(
          Decoration.node(offset, offset + node.nodeSize, {
            class: afterBreak ? "dk-p dk-p1" : "dk-p",
          })
        )
        afterBreak = false
      }
      inlineMarks(text, offset + 1, out)
    })
  }

  if (ctx.kind === "poetry") {
    const scheme = ctx.tools.rhymes ? rhymeScheme(lines, ctx.language) : []
    const issues = ctx.form
      ? checkForm(lines.join("\n"), ctx.form, ctx.language)
      : []
    const bad = new Set<number>()
    for (const i of issues) if ("line" in i) bad.add(i.line)
    doc.forEach((node, offset, i) => {
      const text = lines[i]!
      if (!text.trim()) return
      const rhyme = scheme[i]
      const attrs: Record<string, string> = {
        class: `dk-v${bad.has(i) ? " dk-off" : ""}`,
        "data-syl": String(syllableCount(text, ctx.language)),
      }
      if (rhyme) {
        attrs["data-rhyme"] = rhyme.letter
        if (rhyme.paired)
          attrs.style = `--rh:${RHYME_INK[(rhyme.letter.charCodeAt(0) - 65) % 8]}`
      }
      out.push(Decoration.node(offset, offset + node.nodeSize, attrs))
      const at = offset + 1
      if (ctx.tools.scansion && ctx.language === "en") {
        for (const w of scanWords(text)) {
          const groups = [...w.word.matchAll(/[aeiouyAEIOUY]+/g)]
          // Vowel groups stand in for syllables when they line up.
          const use = groups.length === w.stress.length ? groups : null
          w.stress.forEach((s, j) => {
            const g = use?.[j]
            if (!g) return
            out.push(
              Decoration.inline(
                at + w.start + g.index,
                at + w.start + g.index + 1,
                { class: s ? "dk-st" : "dk-un" }
              )
            )
          })
        }
        for (const a of alliteration(text))
          out.push(
            Decoration.inline(at + a.start, at + a.end, { class: "dk-allit" })
          )
      }
      if (rhyme?.paired) {
        const m = /([\p{L}][\p{L}'’]*)[^\p{L}]*$/u.exec(text)
        if (m)
          out.push(
            Decoration.inline(at + m.index, at + m.index + m[1]!.length, {
              class: "dk-rh",
            })
          )
      }
    })
  }

  if (ctx.kind === "screenplay") {
    const pages = paginate(script)
    const breaks = new Map<number, number>()
    for (const p of pages)
      if (p.number > 1) breaks.set(p.lines[0]?.source ?? 0, p.number)
    const scenes = scenesOf(script)
    const numbers = new Map(scenes.map((s) => [s.line, s.number]))
    doc.forEach((node, offset, i) => {
      const l = script[i]
      if (!l) return
      const attrs: Record<string, string> = { class: `dk-s dk-s-${l.type}` }
      if (l.type === "scene") attrs["data-n"] = numbers.get(i) ?? ""
      out.push(Decoration.node(offset, offset + node.nodeSize, attrs))
      if (l.prefix && l.raw) {
        const lead = l.raw.length - l.raw.trimStart().length
        out.push(
          Decoration.inline(offset + 1 + lead, offset + 1 + lead + l.prefix, {
            class: "dk-hide",
          })
        )
      }
      const page = breaks.get(i)
      if (page)
        out.push(
          Decoration.widget(
            offset + 1,
            () => {
              const el = document.createElement("span")
              el.className = "dk-page"
              el.contentEditable = "false"
              el.dataset.page = `${page}.`
              return el
            },
            { side: -1, key: `page-${page}-${i}` }
          )
        )
    })
  }

  for (let i = 0; i < ctx.alerts.length; i++) {
    const a = ctx.alerts[i]!
    const text = lines.join("\n")
    const from = posOf(text, a.start)
    const to = posOf(text, a.end)
    if (to > doc.content.size || from >= to) continue
    if (to - from > 60) {
      // A whole sentence gets what an editor would give it: a stroke in the
      // margin, not an underline across the paragraph.
      const line = doc.resolve(from).index(0)
      const offset = doc.resolve(from).before(1)
      out.push(
        Decoration.node(offset, offset + doc.child(line).nodeSize, {
          class: `dk-flag dk-flag-${a.level}`,
        })
      )
      out.push(Decoration.inline(from, from + 1, { "data-alert": String(i) }))
    } else
      out.push(
        Decoration.inline(from, to, {
          class: `dk-mark dk-${a.level}`,
          "data-alert": String(i),
        })
      )
  }

  if (ctx.find?.query) {
    const q = ctx.find.query.toLowerCase()
    lines.forEach((line, i) => {
      const low = line.toLowerCase()
      for (
        let at = low.indexOf(q);
        at !== -1;
        at = low.indexOf(q, at + q.length)
      )
        out.push(
          Decoration.inline(starts[i]! + at, starts[i]! + at + q.length, {
            class: "dk-hit",
          })
        )
    })
  }

  return DecorationSet.create(doc, out)
}

function caretDecorations(
  state: EditorState,
  ctx: Context,
  script: ScriptLine[]
) {
  const out: Decoration[] = []
  const $from = state.selection.$from
  const index = $from.index(0)
  const start = $from.before(1)
  const node = $from.parent
  out.push(Decoration.node(start, start + node.nodeSize, { class: "dk-cur" }))
  if (ctx.kind === "screenplay") {
    // The caret's line shows what it's becoming, before Fountain could tell.
    const l0 = script[index]
    if (l0) {
      const shown =
        inSpeech(script, index) && !l0.raw.trim()
          ? "dialogue"
          : effectiveType(script, index)
      if (shown !== l0.type)
        out.push(
          Decoration.node(start, start + node.nodeSize, {
            class: `dk-s-${shown}`,
          })
        )
    }
  }
  if (
    ctx.kind === "screenplay" &&
    state.selection.empty &&
    $from.parentOffset === node.content.size
  ) {
    const l = script[index]
    if (l) {
      const type = effectiveType(script, index)
      const names = castOf(script).map((c) => c.name)
      const places = locationsOf(scenesOf(script)).map((p) => p.toUpperCase())
      const ghost = completion(node.textContent, type, names, places)
      if (ghost)
        out.push(
          Decoration.widget(
            $from.pos,
            () => {
              const el = document.createElement("span")
              el.className = "dk-ghost"
              el.textContent = ghost
              return el
            },
            { side: 1, key: `ghost-${ghost}` }
          )
        )
    }
  }
  return DecorationSet.create(state.doc, out)
}

// A name still being typed has no dialogue under it yet, so Fountain would call
// it action; while the caret is there, treat a capitalised line as a name.
function effectiveType(script: ScriptLine[], i: number): Element {
  const l = script[i]!
  if (l.type !== "action") return l.type
  const prevBlank = i === 0 || script[i - 1]!.type === "blank"
  const raw = l.raw.trim()
  // "FADE IN:" and "BANG!" are action; only a bare capitalised name is a name.
  if (
    prevBlank &&
    raw &&
    raw === raw.toUpperCase() &&
    /\p{L}/u.test(raw) &&
    !/[:.!?,]$/.test(raw)
  )
    return "character"
  return "action"
}

// Tab walks the elements a line could be from where it stands. Outside a speech
// that starts at Character, as in Final Draft; inside one it flips the line
// between dialogue and parenthetical.
const CYCLE: Element[] = ["action", "character", "transition", "scene"]
const SPEECH: Element[] = ["dialogue", "parenthetical"]

const rewrite = (raw: string, to: Element) => {
  const bare = raw.replace(/^\s*[.@!>]/, "").replace(/^\((.*?)\)?$/, "$1")
  if (to === "scene") return `.${bare}`
  if (to === "character") return `@${bare}`
  if (to === "parenthetical") return `(${bare})`
  if (to === "transition") return `>${bare}`
  // Plain text that Fountain would read as something else has to be forced.
  if (to === "action")
    return /^[\p{Lu}0-9 ]+$/u.test(bare) ||
      /^(?:INT|EXT|EST|I\/E)[. ]/i.test(bare)
      ? `!${bare}`
      : bare
  return bare
}

// A line straight under a name is a speech even before it has words in it.
function inSpeech(script: ScriptLine[], i: number) {
  const prev = i > 0 ? script[i - 1] : undefined
  const after = (p: ScriptLine | undefined, index: number) =>
    !!p &&
    (p.type === "dialogue" ||
      p.type === "parenthetical" ||
      effectiveType(script, index) === "character")
  return after(prev, i - 1)
}

function replaceLine(
  state: EditorState,
  dispatch: (t: Transaction) => void,
  text: string
) {
  const $from = state.selection.$from
  const start = $from.start(1)
  const end = $from.end(1)
  const tr = text
    ? state.tr.insertText(text, start, end)
    : state.tr.delete(start, end)
  // Inside the brackets of a parenthetical, at the end of anything else.
  const caret = start + text.length - (text.endsWith(")") ? 1 : 0)
  dispatch(
    tr.setSelection(TextSelection.create(tr.doc, caret)).scrollIntoView()
  )
}

function scriptKeys(getCtx: () => Context) {
  const active = (state: EditorState) =>
    getCtx().kind === "screenplay" && !!key.getState(state)
  const tab =
    (dir: 1 | -1) =>
    (state: EditorState, dispatch?: (t: Transaction) => void) => {
      if (!active(state)) return false
      const plugin = key.getState(state)!
      const $from = state.selection.$from
      const i = $from.index(0)
      const type = effectiveType(plugin.script, i)
      const text = $from.parent.textContent
      // Tab takes the ghost if one is showing.
      if (dir === 1 && $from.parentOffset === text.length && text) {
        const ghost = completion(
          text,
          type,
          castOf(plugin.script).map((c) => c.name),
          locationsOf(scenesOf(plugin.script)).map((p) => p.toUpperCase())
        )
        if (ghost) {
          dispatch?.(state.tr.insertText(ghost).scrollIntoView())
          return true
        }
      }
      const speech = inSpeech(plugin.script, i)
      const ring = speech ? SPEECH : CYCLE
      const now = speech && type !== "parenthetical" ? "dialogue" : type
      const at = Math.max(0, ring.indexOf(now))
      const next = ring[(at + dir + ring.length) % ring.length]!
      if (dispatch) {
        const line = rewrite(text, next)
        replaceLine(state, dispatch, line)
      }
      return true
    }
  const enter = (state: EditorState, dispatch?: (t: Transaction) => void) => {
    if (!active(state) || !dispatch) return false
    const plugin = key.getState(state)!
    const $from = state.selection.$from
    const text = $from.parent.textContent
    // Inside a parenthetical's closing bracket counts as the end of the line.
    const size = $from.parent.content.size
    const atEnd =
      $from.parentOffset === size ||
      (text.endsWith(")") && $from.parentOffset === size - 1)
    if (!atEnd) return false
    const i = $from.index(0)
    const type = effectiveType(plugin.script, i)
    if (!text.trim()) return false
    const pos = $from.after(1)
    const line = (s = "") =>
      schema.node("line", null, s ? schema.text(s) : undefined)
    // What comes next, as a screenwriter expects: a name is followed at once by
    // its speech; a speech, a heading or action by a fresh element.
    const tight = type === "character" || type === "parenthetical"
    const nodes = tight ? [line()] : [line(), line()]
    const tr = state.tr.insert(pos, nodes)
    const caret = pos + (tight ? 1 : 3)
    dispatch(
      tr.setSelection(TextSelection.create(tr.doc, caret)).scrollIntoView()
    )
    return true
  }
  const set =
    (to: Element) =>
    (state: EditorState, dispatch?: (t: Transaction) => void) => {
      if (!active(state)) return false
      if (dispatch)
        replaceLine(
          state,
          dispatch,
          rewrite(state.selection.$from.parent.textContent, to)
        )
      return true
    }
  return keymap({
    // Final Draft's own numbers.
    "Mod-1": set("scene"),
    "Mod-2": set("action"),
    "Mod-3": set("character"),
    "Mod-4": set("parenthetical"),
    "Mod-5": set("dialogue"),
    "Mod-6": set("transition"),
    Tab: tab(1),
    "Shift-Tab": tab(-1),
    Enter: enter,
  })
}

function wrapMark(mark: string) {
  return (state: EditorState, dispatch?: (t: Transaction) => void) => {
    const { from, to, empty } = state.selection
    if (empty) return false
    const text = state.doc.textBetween(from, to)
    if (text.includes("\n")) return false
    if (dispatch) {
      const n = mark.length
      const before = state.doc.textBetween(Math.max(from - n, 0), from)
      const after = state.doc.textBetween(
        to,
        Math.min(to + n, state.doc.content.size)
      )
      if (before === mark && after === mark)
        dispatch(state.tr.delete(to, to + n).delete(from - n, from))
      else dispatch(state.tr.insertText(mark, to).insertText(mark, from))
    }
    return true
  }
}

// Typographer's quotes and dashes as you type, in prose and verse. A script
// stays in straight ASCII, the way Fountain and Final Draft expect.
function smart(state: EditorState, from: number, text: string) {
  const before = state.doc.textBetween(Math.max(from - 2, 0), from, "\n", "\n")
  const prev = before[before.length - 1]
  const opening = !prev || /[\s([{\u2018\u201c\u2014-]/.test(prev)
  if (text === '"') return { text: opening ? "\u201c" : "\u201d", from }
  if (text === "'") return { text: opening ? "\u2018" : "\u2019", from }
  if (text === "-" && prev === "-") return { text: "\u2014", from: from - 1 }
  if (text === "." && before === "..") return { text: "\u2026", from: from - 2 }
  return null
}

export interface MenuAnchor {
  x: number
  y: number
  word: string
  from: number
  to: number
  selected: string
  line: number
  type: Element | null
  alert: number | null
}

export interface EditorHandle {
  undo(): void
  redo(): void
  caretTo(line: number): void
  insertLine(text: string): void
  clip(action: "cut" | "copy"): void
  paste(): Promise<void>
  selectLine(): void
  setElement(to: Element): void
  replaceSpan(from: number, to: number, text: string): void
  anchor(): MenuAnchor | null
  focus(): void
  jump(offset: number): void
  replaceRange(start: number, end: number, text: string): void
  setBody(partId: string, body: string): void
  insert(text: string): void
  wrap(mark: string): void
  replaceAll(query: string, to: string): number
  nextHit(query: string): boolean
}

interface Props {
  partId: string
  body: string
  kind: Kind
  language: "en" | "fr"
  form: PoemForm | null
  tools: Tools
  alerts: Alert[]
  find: Find | null
  dictReady: number
  placeholder: string
  ariaLabel: string
  onChange(body: string, added: number): void
  onCaret(info: {
    word: string
    line: number
    offset: number
    alert: number | null
    rect: DOMRect | null
  }): void
  onKey(key: string): void
  onMenu(anchor: MenuAnchor): void
  onSelection(info: { text: string; rect: DOMRect } | null): void
  onHoverAlert(index: number | null, rect: DOMRect | null): void
  onHoverLine(
    info: {
      line: number
      top: number
      height: number
      text: string
      type: Element | null
      rect: DOMRect
    } | null
  ): void
}

export const Editor = React.forwardRef<EditorHandle, Props>(
  function Editor(props, ref) {
    const host = React.useRef<HTMLDivElement>(null)
    const view = React.useRef<EditorView | null>(null)
    const latest = React.useRef(props)
    latest.current = props
    const states = React.useRef(new Map<string, EditorState>())
    const dragging = React.useRef(false)

    const ctx = (): Context => {
      const p = latest.current
      return {
        kind: p.kind,
        language: p.language,
        form: p.form,
        tools: p.tools,
        alerts: p.alerts,
        find: p.find,
        dictReady: p.dictReady,
      }
    }

    const makeState = (body: string) =>
      EditorState.create({
        doc: toDoc(body),
        plugins: [
          scriptKeys(ctx),
          keymap({
            "Mod-z": undo,
            "Shift-Mod-z": redo,
            "Mod-y": redo,
            "Mod-i": wrapMark("*"),
            "Mod-b": wrapMark("**"),
          }),
          keymap(baseKeymap),
          history(),
          new Plugin({
            key,
            state: {
              init(_, s) {
                const c = ctx()
                const script =
                  c.kind === "screenplay" ? parseScript(toText(s.doc)) : []
                return {
                  ctx: c,
                  set: buildDecorations(s.doc, c, script),
                  script,
                }
              },
              apply(tr, value, _old, s) {
                const refreshed = tr.getMeta(key) as Context | undefined
                if (!tr.docChanged && !refreshed) return value
                const c = refreshed ?? { ...value.ctx, alerts: [] }
                // Alerts are stale until the next lint; moving them is enough.
                if (tr.docChanged && !refreshed) c.alerts = []
                const script =
                  c.kind === "screenplay" ? parseScript(toText(s.doc)) : []
                return {
                  ctx: c,
                  set: buildDecorations(s.doc, c, script),
                  script,
                }
              },
            },
            props: {
              decorations: (s) => key.getState(s)?.set ?? null,
            },
          }),
          // Apart from the above, so moving the caret redraws only this.
          new Plugin({
            props: {
              decorations(s) {
                const v = key.getState(s)
                return v ? caretDecorations(s, v.ctx, v.script) : null
              },
            },
          }),
        ],
      })

    React.useEffect(() => {
      if (!host.current) return
      const v = new EditorView(host.current, {
        state: makeState(latest.current.body),
        attributes: {
          class: "dk-pm",
          role: "textbox",
          "aria-multiline": "true",
          "aria-label": latest.current.ariaLabel,
          spellcheck: "true",
        },
        dispatchTransaction(tr) {
          const before = v.state.doc
          const next = v.state.apply(tr)
          v.updateState(next)
          if (tr.docChanged) {
            const body = toText(next.doc)
            const added =
              next.doc.textContent.length - before.textContent.length
            latest.current.onChange(body, added)
          }
          if (tr.selectionSet || tr.docChanged) reportCaret(v)
          if (!dragging.current) reportSelection(v)
        },
        handleKeyDown(_, e) {
          if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
            e.preventDefault()
            const a = anchorOf(v)
            if (a) latest.current.onMenu(a)
            return true
          }
          if (e.key.length === 1 || e.key === "Enter" || e.key === "Backspace")
            if (!e.metaKey && !e.ctrlKey) latest.current.onKey(e.key)
          return false
        },
        handleTextInput(_, from, to, text) {
          if (latest.current.kind === "screenplay") return false
          const fix = smart(v.state, from, text)
          if (!fix) return false
          v.dispatch(v.state.tr.insertText(fix.text, fix.from, to))
          return true
        },
        handleClick(_, __, e) {
          reportCaret(v, e.target as HTMLElement)
          return false
        },
        handleDOMEvents: {
          mousedown() {
            dragging.current = true
            latest.current.onSelection(null)
            const up = () => {
              dragging.current = false
              window.removeEventListener("mouseup", up)
              // After the browser settles the selection.
              requestAnimationFrame(() => reportSelection(v))
            }
            window.addEventListener("mouseup", up)
            return false
          },
          contextmenu(_, e) {
            // Shift keeps the browser's own menu, for spelling and extensions.
            if (e.shiftKey) return false
            e.preventDefault()
            const at = v.posAtCoords({ left: e.clientX, top: e.clientY })
            const { from, to } = v.state.selection
            if (at && (at.pos < from || at.pos > to || from === to))
              v.dispatch(
                v.state.tr.setSelection(
                  TextSelection.create(v.state.doc, at.pos)
                )
              )
            const a = anchorOf(v, e.target as HTMLElement)
            if (a) latest.current.onMenu({ ...a, x: e.clientX, y: e.clientY })
            return true
          },
          mouseover(_, e) {
            const el = e.target as HTMLElement
            const mark = el.closest?.("[data-alert]") as HTMLElement | null
            if (mark && mark.classList.contains("dk-mark"))
              latest.current.onHoverAlert(
                Number(mark.dataset.alert),
                mark.getBoundingClientRect()
              )
            else latest.current.onHoverAlert(null, null)
            const line = el.closest?.(".dk-line") as HTMLElement | null
            if (line) {
              const index = [...v.dom.children].indexOf(line)
              const r = line.getBoundingClientRect()
              const sheet = (
                line.closest(".dk-sheet") as HTMLElement
              ).getBoundingClientRect()
              const script = key.getState(v.state)?.script[index]
              latest.current.onHoverLine({
                line: index,
                top: r.top - sheet.top,
                height: r.height,
                text: line.textContent ?? "",
                type: script
                  ? effectiveType(key.getState(v.state)!.script, index)
                  : null,
                rect: r,
              })
            }
            return false
          },
        },
      })
      view.current = v
      return () => {
        v.destroy()
        view.current = null
      }
      // The view lives as long as the component; props reach it through `latest`.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const reportSelection = (v: EditorView) => {
      const { from, to, empty } = v.state.selection
      if (empty || !v.hasFocus()) {
        latest.current.onSelection(null)
        return
      }
      const a = v.coordsAtPos(from)
      const b = v.coordsAtPos(to)
      latest.current.onSelection({
        text: v.state.doc.textBetween(from, to, "\n"),
        rect: new DOMRect(
          Math.min(a.left, b.left),
          a.top,
          Math.abs(b.right - a.left),
          b.bottom - a.top
        ),
      })
    }

    const anchorOf = (
      v: EditorView,
      target?: HTMLElement
    ): MenuAnchor | null => {
      const { from, to, $from } = v.state.selection
      const text = $from.parent.textContent
      const at = $from.parentOffset
      const left = /[\p{L}'’-]*$/u.exec(text.slice(0, at))?.[0] ?? ""
      const right = /^[\p{L}'’-]*/u.exec(text.slice(at))?.[0] ?? ""
      const c = v.coordsAtPos(from)
      const mark = target?.closest?.("[data-alert]") as HTMLElement | null
      const plugin = key.getState(v.state)
      const index = $from.index(0)
      return {
        x: c.left,
        y: c.bottom,
        word: left + right,
        from: from === to ? from - left.length : from,
        to: from === to ? from + right.length : to,
        selected: v.state.doc.textBetween(from, to, "\n"),
        line: index,
        type: plugin?.script[index]
          ? effectiveType(plugin.script, index)
          : null,
        alert: mark ? Number(mark.dataset.alert) : null,
      }
    }

    const reportCaret = (v: EditorView, target?: HTMLElement) => {
      const { from } = v.state.selection
      const $from = v.state.selection.$from
      const text = $from.parent.textContent
      const offsetInLine = $from.parentOffset
      const left = /[\p{L}'’-]*$/u.exec(text.slice(0, offsetInLine))?.[0] ?? ""
      const right = /^[\p{L}'’-]*/u.exec(text.slice(offsetInLine))?.[0] ?? ""
      const word = left + right
      let offset = 0
      v.state.doc.forEach((n, pos, i) => {
        if (i < $from.index(0)) offset += n.textContent.length + 1
        void pos
      })
      const mark = (target?.closest?.("[data-alert]") ??
        v
          .domAtPos(from)
          .node.parentElement?.closest?.("[data-alert]")) as HTMLElement | null
      latest.current.onCaret({
        word,
        line: $from.index(0),
        offset: offset + offsetInLine,
        alert: mark ? Number(mark.dataset.alert) : null,
        rect: mark?.getBoundingClientRect() ?? null,
      })
      if (latest.current.tools.typewriter && document.hasFocus()) {
        const scroller = v.dom.closest(".dk-scroll") as HTMLElement | null
        if (scroller) {
          const c = v.coordsAtPos(from)
          const box = scroller.getBoundingClientRect()
          scroller.scrollBy({
            top: c.top - (box.top + box.height * 0.42),
            behavior: "smooth",
          })
        }
      }
    }

    // New alerts, tools or forms redraw decorations without touching the text.
    const refresh = React.useCallback(() => {
      const v = view.current
      if (v)
        v.dispatch(
          v.state.tr.setMeta(key, ctx()).setMeta("addToHistory", false)
        )
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    React.useEffect(refresh, [
      props.alerts,
      props.tools,
      props.form,
      props.find,
      props.dictReady,
      props.language,
      refresh,
    ])

    const prevPart = React.useRef(props.partId)
    React.useEffect(() => {
      const v = view.current
      if (!v || prevPart.current === props.partId) return
      states.current.set(prevPart.current, v.state)
      prevPart.current = props.partId
      const stored = states.current.get(props.partId)
      v.updateState(
        stored && toText(stored.doc) === props.body
          ? stored
          : makeState(props.body)
      )
      refresh()
      v.dom.closest(".dk-scroll")?.scrollTo({ top: 0 })
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.partId])

    React.useImperativeHandle(
      ref,
      () => ({
        focus: () => view.current?.focus(),
        undo() {
          const v = view.current
          if (v) undo(v.state, v.dispatch)
          v?.focus()
        },
        redo() {
          const v = view.current
          if (v) redo(v.state, v.dispatch)
          v?.focus()
        },
        caretTo(line) {
          const v = view.current
          if (!v) return
          const pos = lineStarts(v.state.doc)[line]
          if (pos === undefined) return
          v.dispatch(
            v.state.tr.setSelection(TextSelection.create(v.state.doc, pos))
          )
          v.focus()
        },
        insertLine(text) {
          const v = view.current
          if (!v) return
          const pos = v.state.selection.$from.after(1)
          const tr = v.state.tr.insert(pos, [
            schema.node("line", null, schema.text(text)),
            schema.node("line"),
          ])
          v.dispatch(
            tr
              .setSelection(TextSelection.create(tr.doc, pos + text.length + 3))
              .scrollIntoView()
          )
          v.focus()
        },
        clip(action) {
          view.current?.focus()
          document.execCommand(action)
        },
        async paste() {
          const v = view.current
          if (!v) return
          const text = await navigator.clipboard.readText()
          v.focus()
          if (!text) return
          const { from, to } = v.state.selection
          const lines = text
            .replace(/\r\n?/g, "\n")
            .replace(/\n$/, "")
            .split("\n")
          const nodes = lines.map((l) =>
            schema.node("line", null, l ? schema.text(l) : undefined)
          )
          v.dispatch(
            v.state.tr
              .replaceRange(from, to, new Slice(Fragment.from(nodes), 1, 1))
              .scrollIntoView()
          )
        },
        selectLine() {
          const v = view.current
          if (!v) return
          const { $from } = v.state.selection
          v.dispatch(
            v.state.tr.setSelection(
              TextSelection.create(v.state.doc, $from.start(1), $from.end(1))
            )
          )
          v.focus()
        },
        setElement(to) {
          const v = view.current
          if (!v) return
          replaceLine(
            v.state,
            v.dispatch,
            rewrite(v.state.selection.$from.parent.textContent, to)
          )
          v.focus()
        },
        replaceSpan(from, to, text) {
          const v = view.current
          if (!v) return
          v.dispatch(v.state.tr.insertText(text, from, to))
          v.focus()
        },
        anchor() {
          const v = view.current
          return v ? anchorOf(v) : null
        },
        jump(offset) {
          const v = view.current
          if (!v) return
          const pos = Math.min(
            posOf(toText(v.state.doc), offset),
            v.state.doc.content.size
          )
          v.dispatch(
            v.state.tr.setSelection(TextSelection.create(v.state.doc, pos))
          )
          const c = v.coordsAtPos(pos)
          const scroller = v.dom.closest(".dk-scroll") as HTMLElement | null
          if (scroller) {
            const box = scroller.getBoundingClientRect()
            scroller.scrollBy({
              top: c.top - (box.top + box.height * 0.3),
              behavior: "smooth",
            })
          }
          v.focus()
        },
        replaceRange(start, end, text) {
          const v = view.current
          if (!v) return
          const body = toText(v.state.doc)
          const from = posOf(body, start)
          const to = posOf(body, end)
          v.dispatch(
            text
              ? v.state.tr.insertText(text, from, to)
              : v.state.tr.delete(from, to)
          )
          v.focus()
        },
        setBody(partId, body) {
          const v = view.current
          if (!v) return
          states.current.delete(partId)
          if (partId === prevPart.current) {
            v.updateState(makeState(body))
            refresh()
          }
        },
        insert(text) {
          const v = view.current
          if (!v) return
          v.dispatch(v.state.tr.insertText(text).scrollIntoView())
          v.focus()
        },
        wrap(mark) {
          const v = view.current
          if (v) wrapMark(mark)(v.state, v.dispatch)
        },
        replaceAll(query, to) {
          const v = view.current
          if (!v || !query) return 0
          const body = toText(v.state.doc)
          const q = query.toLowerCase()
          const low = body.toLowerCase()
          const hits: number[] = []
          for (
            let at = low.indexOf(q);
            at !== -1;
            at = low.indexOf(q, at + q.length)
          )
            hits.push(at)
          let tr = v.state.tr
          for (const at of hits.reverse()) {
            const from = posOf(body, at)
            const end = posOf(body, at + q.length)
            tr = to ? tr.insertText(to, from, end) : tr.delete(from, end)
          }
          v.dispatch(tr)
          return hits.length
        },
        nextHit(query) {
          const v = view.current
          if (!v || !query) return false
          const body = toText(v.state.doc).toLowerCase()
          const q = query.toLowerCase()
          const now = v.state.selection.to
          let found = -1
          for (
            let at = body.indexOf(q);
            at !== -1;
            at = body.indexOf(q, at + 1)
          ) {
            if (posOf(body, at) >= now) {
              found = at
              break
            }
            if (found < 0) found = at
          }
          if (found < 0) return false
          const from = posOf(body, found)
          const tr = v.state.tr.setSelection(
            TextSelection.create(v.state.doc, from, from + q.length)
          )
          v.dispatch(tr.scrollIntoView())
          return true
        },
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      []
    )

    return (
      <div
        ref={host}
        className="dk-editor"
        data-kind={props.kind}
        data-focus={props.tools.focus || undefined}
        data-scansion={props.tools.scansion || undefined}
        data-empty={!props.body.trim() || undefined}
        data-placeholder={props.placeholder}
      />
    )
  }
)
