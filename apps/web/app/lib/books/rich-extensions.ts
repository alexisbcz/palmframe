import { Mark, Node, mergeAttributes } from "@tiptap/core"
import Document from "@tiptap/extension-document"
import HardBreak from "@tiptap/extension-hard-break"
import Paragraph from "@tiptap/extension-paragraph"
import Text from "@tiptap/extension-text"
import { Placeholder, UndoRedo } from "@tiptap/extensions"

import { TAG_STYLES } from "./inline"
import type { InlineTag } from "./model"
import { TAG_ATOM, TAG_MARK } from "./rich"

const ATOM_LABELS: Partial<Record<InlineTag["type"], string>> = {
  br: "↵",
  img: "▣",
  noteref: "*",
}

// One line of a book, never several: the file's structure isn't the editor's.
const OneBlock = Document.extend({ content: "paragraph" })

function tagFrom(el: HTMLElement, tags: InlineTag[]) {
  const id = el.getAttribute("data-book-tag")
  const tag = tags.find((t) => t.id === id)
  return tag ? { id: tag.id, kind: tag.type } : false
}

const tagAttributes = () => ({
  id: { default: "" },
  kind: { default: "span" },
})

// Only this line's own tags survive a paste. A tag from another line would
// point at a link or a note that belongs to that line.
const TagMark = Mark.create<{ tags: InlineTag[] }>({
  name: TAG_MARK,
  excludes: "",
  inclusive: false,
  addOptions: () => ({ tags: [] }),
  addAttributes: tagAttributes,
  parseHTML() {
    return [
      {
        tag: "span[data-book-tag]",
        getAttrs: (el) => tagFrom(el, this.options.tags),
      },
    ]
  },
  renderHTML({ mark }) {
    const kind = mark.attrs.kind as InlineTag["type"]
    return [
      "span",
      { "data-book-tag": mark.attrs.id, class: TAG_STYLES[kind] ?? "" },
      0,
    ]
  },
})

const TagAtom = Node.create<{ tags: InlineTag[] }>({
  name: TAG_ATOM,
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,
  addOptions: () => ({ tags: [] }),
  addAttributes: tagAttributes,
  parseHTML() {
    return [
      {
        tag: "span[data-book-tag]",
        // Before the mark, which would otherwise claim the same element.
        priority: 60,
        getAttrs: (el) =>
          el.getAttribute("data-book-atom") === null
            ? false
            : tagFrom(el, this.options.tags),
      },
    ]
  },
  renderHTML({ node, HTMLAttributes }) {
    const kind = node.attrs.kind as InlineTag["type"]
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-book-tag": node.attrs.id,
        "data-book-atom": "",
        contenteditable: "false",
        class:
          "mx-0.5 inline-flex min-w-4 justify-center rounded bg-foreground/10 px-1 align-baseline font-sans text-[0.7em] text-muted-foreground select-none",
      }),
      ATOM_LABELS[kind] ?? "•",
    ]
  },
})

export const bookExtensions = ({
  tags,
  placeholder,
}: {
  tags: InlineTag[]
  placeholder: string
}) => [
  OneBlock,
  Paragraph,
  Text,
  HardBreak.configure({ keepMarks: true }),
  UndoRedo,
  Placeholder.configure({ placeholder }),
  TagMark.configure({ tags }),
  TagAtom.configure({ tags }),
]
