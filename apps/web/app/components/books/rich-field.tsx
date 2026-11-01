import * as React from "react"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  TextBoldIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
  TextSubscriptIcon,
  TextSuperscriptIcon,
  TextUnderlineIcon,
} from "@hugeicons/core-free-icons"
import type { Editor } from "@tiptap/core"
import { Extension } from "@tiptap/core"
import { EditorContent, useEditor } from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"

import { ADDED_TAGS } from "@/lib/books/inline"
import type { InlineTag } from "@/lib/books/model"
import {
  ADDED_MARK,
  TAG_MARK,
  TAG_ATOM,
  fromDoc,
  toDoc,
  type RichDoc,
  type WordedTag,
} from "@/lib/books/rich"
import { bookExtensions } from "@/lib/books/rich-extensions"

import { FIELD_TEXT, textProps, useBookT } from "./shared"

export interface FieldTerm {
  source: string
  text: string
  used: boolean
}

export interface RichFieldKeys {
  // Each gets the text as it stands. Enter stays a key the field handles, so a
  // line can't be split in two by accident.
  onEnter?: (text: string) => void
  onSubmit?: (text: string) => void
  onLock?: (text: string) => void
  onEscape?: (text: string) => void
}

const text = (editor: Editor) => fromDoc(editor.getJSON() as RichDoc)

const FORMATS = [
  { type: "b", icon: TextBoldIcon, keys: "Mod-b" },
  { type: "i", icon: TextItalicIcon, keys: "Mod-i" },
  { type: "u", icon: TextUnderlineIcon, keys: "Mod-u" },
  { type: "s", icon: TextStrikethroughIcon, keys: "Mod-Shift-s" },
  { type: "sup", icon: TextSuperscriptIcon, keys: "Mod-." },
  { type: "sub", icon: TextSubscriptIcon, keys: "Mod-," },
] as const

type Format = (typeof FORMATS)[number]["type"]

const hasKind = (
  marks: readonly { attrs: { kind?: unknown } }[],
  kind: Format
) => marks.some((m) => m.attrs.kind === kind)

function hasFormat(editor: Editor, kind: Format) {
  const { state } = editor
  const { from, to, empty, $from } = state.selection
  if (empty) return hasKind(state.storedMarks ?? $from.marks(), kind)
  let found = false
  let whole = true
  state.doc.nodesBetween(from, to, (node) => {
    if (!node.isText) return
    found = true
    if (!hasKind(node.marks, kind)) whole = false
  })
  return found && whole
}

// The original's own bold first, because exports restore its exact styling.
// Past that, or where it has none, the formatting is simply added.
function toggleFormat(editor: Editor, kind: Format, source: InlineTag[]) {
  const { state, view } = editor
  const { from, to, empty, $from } = state.selection
  const placed = text(editor)
  const added = ADDED_TAGS.find((a) => a.type === kind)!
  const own = source.find(
    (s) =>
      s.type === kind && s.id.startsWith("g") && !placed.includes(`<${s.id}>`)
  )
  // Typing continues in the added kind, since the original's tags don't grow.
  const tag = !empty && own ? own : added
  const type = tag === added ? ADDED_MARK : TAG_MARK
  const mark = state.schema.marks[type]!.create({ id: tag.id, kind })
  const on = hasFormat(editor, kind)
  const tr = state.tr
  if (empty && on) {
    for (const m of state.storedMarks ?? $from.marks())
      if (m.attrs.kind === kind) tr.removeStoredMark(m)
  } else if (empty) tr.addStoredMark(mark)
  else if (on)
    state.doc.nodesBetween(from, to, (node, pos) => {
      for (const m of node.marks)
        if (m.attrs.kind === kind)
          tr.removeMark(
            Math.max(pos, from),
            Math.min(pos + node.nodeSize, to),
            m
          )
    })
  else tr.addMark(from, to, mark)
  view.dispatch(tr)
  editor.commands.focus()
}

function hasTag(editor: Editor, id: string) {
  const { state } = editor
  const { from, to, empty } = state.selection
  if (empty) return false
  let whole = true
  state.doc.nodesBetween(from, to, (node) => {
    if (node.isInline && !node.marks.some((m) => m.attrs.id === id))
      whole = false
  })
  return whole
}

// A tag goes in one place, so placing it again moves it.
function placeTag(editor: Editor, tag: InlineTag) {
  const { state, view } = editor
  const atomic = tag.id.startsWith("x")
  const tr = state.tr
  const { from, to, empty } = state.selection
  if (atomic) {
    // After the selection, never over it: a note doesn't replace words.
    tr.insert(
      to,
      state.schema.nodes[TAG_ATOM]!.create({ id: tag.id, kind: tag.type })
    )
  } else {
    if (empty) return
    const on = hasTag(editor, tag.id)
    const mark = state.schema.marks[TAG_MARK]!.create({
      id: tag.id,
      kind: tag.type,
    })
    tr.removeMark(0, state.doc.content.size, mark)
    if (!on) tr.addMark(from, to, mark)
  }
  view.dispatch(tr)
  editor.commands.focus()
}

function TagButton({
  editor,
  tag,
  on,
  disabled,
}: {
  editor: Editor
  tag: WordedTag
  on?: boolean
  disabled?: boolean
}) {
  const t = useBookT()
  const { words } = tag
  return (
    <button
      type="button"
      aria-pressed={on}
      title={words}
      disabled={disabled}
      // Holds on to the selection the button is about to act on.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => placeTag(editor, tag)}
      className={cn(
        "relative max-w-full truncate rounded-md px-2 py-0.5 text-xs transition-colors duration-150 outline-none after:absolute after:-inset-1 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50",
        on
          ? "bg-foreground text-background"
          : "bg-foreground/10 text-foreground hover:bg-foreground/15"
      )}
    >
      {t(`editor.tags.${tag.type}`)}
      {words && (
        <span className="opacity-70">
          {" "}
          “{words.length > 24 ? `${words.slice(0, 24).trimEnd()}…` : words}”
        </span>
      )}
    </button>
  )
}

function FormatButton({
  editor,
  format,
  source,
}: {
  editor: Editor
  format: (typeof FORMATS)[number]
  source: InlineTag[]
}) {
  const t = useBookT()
  const label = t(`editor.tags.${format.type}`)
  const on = hasFormat(editor, format.type)
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={on}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => toggleFormat(editor, format.type, source)}
      className={cn(
        "flex size-8 items-center justify-center rounded-md transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&_svg]:size-4",
        on
          ? "bg-foreground text-background"
          : "text-foreground hover:bg-foreground/10"
      )}
    >
      <HugeiconsIcon icon={format.icon} strokeWidth={2} />
    </button>
  )
}

export function RichField({
  value,
  tags,
  sourceTags,
  missingTags,
  terms,
  lang,
  label,
  placeholder,
  point,
  keys,
  onChange,
  onBlur,
  onLeave,
}: {
  value: string
  tags: InlineTag[]
  // Present on a translation, which is what can take formatting.
  sourceTags?: WordedTag[]
  missingTags?: WordedTag[]
  terms?: FieldTerm[]
  lang: string
  label: string
  placeholder?: string
  // Where the click that opened the field landed.
  point?: { x: number; y: number } | null
  keys: RichFieldKeys
  onChange?: (text: string) => void
  onBlur?: (text: string) => void
  // On the way out, however that happens: blur doesn't fire on removal.
  onLeave?: (text: string) => void
}) {
  const t = useBookT()
  const current = React.useRef({ keys, onChange, onBlur, onLeave, sourceTags })
  current.current = { keys, onChange, onBlur, onLeave, sourceTags }
  const [, redraw] = React.useReducer((n: number) => n + 1, 0)
  const opening = React.useRef(point)
  const mounted = React.useRef(false)
  React.useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const [extensions] = React.useState(() => {
    const call =
      (key: keyof RichFieldKeys) =>
      ({ editor }: { editor: Editor }) => {
        current.current.keys[key]?.(text(editor))
        return true
      }
    const Keys = Extension.create({
      name: "bookKeys",
      priority: 1000,
      addKeyboardShortcuts() {
        const shortcuts: Record<string, () => boolean> = {
          Enter: () => call("onEnter")(this),
          "Mod-Enter": () => call("onSubmit")(this),
          "Mod-l": () => call("onLock")(this),
          Escape: () => call("onEscape")(this),
        }
        for (const { type, keys } of FORMATS)
          shortcuts[keys] = () => {
            const source = current.current.sourceTags
            if (source) toggleFormat(this.editor, type, source)
            // Taken either way, so the browser's own bold never gets in.
            return true
          }
        return shortcuts
      },
    })
    return [...bookExtensions({ tags, placeholder: placeholder ?? "" }), Keys]
  })

  const editor = useEditor({
    extensions,
    content: toDoc(value, tags),
    autofocus: false,
    editorProps: {
      attributes: {
        ...textProps(lang),
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
        spellcheck: "true",
        class: cn(FIELD_TEXT, "min-h-[1lh] outline-none"),
      },
    },
    // The view only exists from here on.
    onCreate: ({ editor }) => {
      const at = opening.current
      const pos = at && editor.view.posAtCoords({ left: at.x, top: at.y })
      editor.commands.focus(pos ? pos.pos : "end", { scrollIntoView: false })
    },
    onUpdate: ({ editor }) => current.current.onChange?.(text(editor)),
    onBlur: ({ editor }) => current.current.onBlur?.(text(editor)),
    onSelectionUpdate: () => {
      if (mounted.current) redraw()
    },
  })

  // Text can change under a field nobody is typing in: an assistant's edit, a
  // reload after a conflict.
  React.useEffect(() => {
    if (!editor.isInitialized || editor.isFocused || text(editor) === value)
      return
    editor.commands.setContent(toDoc(value, tags), { emitUpdate: false })
  }, [editor, value, tags])

  React.useEffect(() => () => current.current.onLeave?.(text(editor)), [editor])

  // Bold and the like have their buttons; these only exist on this line.
  const pairs =
    sourceTags?.filter(
      (tag) =>
        tag.id.startsWith("g") && !FORMATS.some((f) => f.type === tag.type)
    ) ?? []
  const missing = missingTags ?? []
  const hasFooter = missing.length > 0 || (terms?.length ?? 0) > 0
  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          "rounded-lg border border-input bg-input/20 ring-3 ring-ring/30 transition-shadow duration-150",
          "[&_.is-editor-empty:first-child]:before:pointer-events-none [&_.is-editor-empty:first-child]:before:float-start [&_.is-editor-empty:first-child]:before:h-0 [&_.is-editor-empty:first-child]:before:text-muted-foreground [&_.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]"
        )}
      >
        <EditorContent editor={editor} />
      </div>
      {sourceTags && (
        <BubbleMenu
          editor={editor}
          shouldShow={({ state }) => !state.selection.empty}
          options={{ placement: "top" }}
          className="z-50 flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-0.5 rounded-lg bg-popover p-1 shadow-md ring-1 ring-foreground/10"
        >
          {FORMATS.map((format) => (
            <FormatButton
              key={format.type}
              editor={editor}
              format={format}
              source={sourceTags}
            />
          ))}
          {pairs.map((tag) => (
            <TagButton
              key={tag.id}
              editor={editor}
              tag={tag}
              on={hasTag(editor, tag.id)}
            />
          ))}
        </BubbleMenu>
      )}
      {hasFooter && (
        <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          {missing.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span>{t("editor.placeTags")}</span>
              {missing.map((tag) => (
                <TagButton
                  key={tag.id}
                  editor={editor}
                  tag={tag}
                  disabled={
                    tag.id.startsWith("g") && editor.state.selection.empty
                  }
                />
              ))}
            </div>
          )}
          {!!terms?.length && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span>{t("editor.terms")}</span>
              {terms.map((term) => (
                <button
                  key={term.source}
                  type="button"
                  title={t("editor.insertTerm")}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() =>
                    editor.chain().focus().insertContent(term.text).run()
                  }
                  className={cn(
                    "relative rounded-md px-2 py-0.5 transition-colors duration-150 outline-none after:absolute after:-inset-1 focus-visible:ring-2 focus-visible:ring-ring/50",
                    term.used
                      ? "text-muted-foreground hover:bg-foreground/5"
                      : "bg-brand/15 text-foreground hover:bg-brand/25"
                  )}
                >
                  {term.source} → {term.text}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default RichField
