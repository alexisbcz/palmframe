import { describe, expect, test } from "bun:test"
import { getSchema } from "@tiptap/core"
import { Node } from "@tiptap/pm/model"

import { checkTags } from "./inline"
import type { InlineTag } from "./model"
import { fromDoc, normalize, tagsInSource, tagsToPlace, toDoc } from "./rich"
import { bookExtensions } from "./rich-extensions"

const tags: InlineTag[] = [
  { id: "g1", type: "i" },
  { id: "g2", type: "b" },
  { id: "x3", type: "noteref" },
  { id: "x4", type: "br" },
]

const schema = getSchema(bookExtensions({ tags, placeholder: "" }))

describe("rich text", () => {
  const stable = [
    "",
    "plain words",
    "<g1>italic</g1> then plain",
    "<g1>outer <g2>both</g2> outer</g1>",
    "a note<x3/> and a break<x4/>",
    "<g1>note inside<x3/></g1>",
    "an empty <g1></g1> anchor",
    "literal &lt;g1&gt; &amp; friends",
    "two\nlines",
    "<g1>over\ntwo lines</g1>",
    "  spaces   kept  ",
  ]

  test.each(stable)("%j survives the editor's schema", (text: string) => {
    const doc = toDoc(text, tags)
    const node = Node.fromJSON(schema, doc)
    node.check()
    expect(fromDoc(node.toJSON())).toBe(text)
  })

  test("literal brackets in the editor can't turn into tags", () => {
    const doc = {
      type: "doc" as const,
      content: [
        {
          type: "paragraph" as const,
          content: [{ type: "text", text: "<g1>not a tag</g1> & co" }],
        },
      ],
    }
    expect(fromDoc(doc)).toBe("&lt;g1&gt;not a tag&lt;/g1&gt; &amp; co")
    expect(checkTags("plain", fromDoc(doc))).toBeNull()
  })

  test("marks that overlap still come out balanced", () => {
    const i = {
      type: "bookTagMark" as const,
      attrs: { id: "g1", kind: "i" as const },
    }
    const b = {
      type: "bookTagMark" as const,
      attrs: { id: "g2", kind: "b" as const },
    }
    const out = fromDoc({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "a", marks: [i] },
            { type: "text", text: "b", marks: [i, b] },
            { type: "text", text: "c", marks: [b] },
          ],
        },
      ],
    })
    expect(out).toBe("<g1>a<g2>b</g2></g1><g2>c</g2>")
    expect(checkTags("<g1>a</g1><g2>b</g2>", out)).toBeNull()
  })

  test("unbalanced model output settles into something valid", () => {
    const out = normalize("<g1>a<g2>b</g1>c</g2>", tags)
    expect(checkTags("<g1>a</g1><g2>b</g2>", out)?.unbalanced).toBeFalsy()
    expect(normalize(out, tags)).toBe(out)
  })

  test("reports which tags still need a place", () => {
    const source = "<g1>a</g1> b<x3/>"
    expect(tagsInSource(source, tags).map((t) => t.id)).toEqual(["g1", "x3"])
    expect(tagsToPlace(source, "<g1>a</g1>", tags).map((t) => t.id)).toEqual([
      "x3",
    ])
  })
})
