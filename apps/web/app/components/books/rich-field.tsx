import * as React from "react"
import { cn } from "cn"
import type { Editor } from "@tiptap/core"
import { Extension } from "@tiptap/core"
import { EditorContent, useEditor } from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"

import type { InlineTag } from "@/lib/books/model"
import {
  TAG_MARK,
  TAG_ATOM,
  fromDoc,
  toDoc,
  type RichDoc,
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

const SHORTCUT_TAGS: Record<string, InlineTag["type"]> = {
  "Mod-b": "b",
  "Mod-i": "i",
  "Mod-u": "u",
}

function hasTag(editor: Editor, id: string) {
  const { state } = editor
  const { from, to, empty } = state.selection
  if (empty) return false
  const type = state.schema.marks[TAG_MARK]!
  let whole = true
  state.doc.nodesBetween(from, to, (node) => {
    if (node.isInline && !type.isInSet(node.marks)) whole = false
    else if (
      node.isInline &&
      !node.marks.some((m) => m.type === type && m.attrs.id === id)
    )
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
  tag: InlineTag
  on?: boolean
  disabled?: boolean
}) {
  const t = useBookT()
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      // Holds on to the selection the button is about to act on.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => placeTag(editor, tag)}
      className={cn(
        "relative rounded-md px-2 py-0.5 text-xs transition-colors duration-150 outline-none after:absolute after:-inset-1 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50",
        on
          ? "bg-foreground text-background"
          : "bg-foreground/10 text-foreground hover:bg-foreground/15"
      )}
    >
      {t(`editor.tags.${tag.type}`)}
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
  sourceTags?: InlineTag[]
  missingTags?: InlineTag[]
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
        for (const [combo, type] of Object.entries(SHORTCUT_TAGS))
          shortcuts[combo] = () => {
            const editor = this.editor
            const tag = current.current.sourceTags
              ?.filter((s) => s.type === type)
              .find(
                (s) =>
                  hasTag(editor, s.id) || !text(editor).includes(`<${s.id}>`)
              )
            if (tag && !editor.state.selection.empty) placeTag(editor, tag)
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

  const pairs = sourceTags?.filter((tag) => tag.id.startsWith("g")) ?? []
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
      {pairs.length > 0 && (
        <BubbleMenu
          editor={editor}
          shouldShow={({ state }) => !state.selection.empty}
          options={{ placement: "top" }}
          className="z-50 flex gap-1 rounded-lg bg-popover p-1 shadow-md ring-1 ring-foreground/10"
        >
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
