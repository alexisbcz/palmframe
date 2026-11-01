import { expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { sampleFor } from "../samples"
import { emptyManuscript, inlineRuns, type Kind } from "../model"
import {
  readZip,
  fromFdx,
  fromFountain,
  fromText,
  toDocx,
  toFdx,
  toFountain,
  toHtml,
  toMarkdown,
  toPlain,
  toRtf,
} from "./text"
import { toEpub } from "./epub"
import { texEscape, toLatex } from "./latex"
import { toPdf } from "./pdf.server"

const KINDS: Kind[] = ["novel", "poetry", "screenplay"]
const has = (tool: string, flag = "--version") =>
  spawnSync(tool, [flag]).status === 0
const dir = mkdtempSync(join(tmpdir(), "desk-"))

test("inline marks", () => {
  expect(inlineRuns("A *b* **c** ***d*** 2*3*4")[1]).toEqual({
    text: "b",
    italic: true,
  })
  expect(inlineRuns("***d***")[0]).toEqual({
    text: "d",
    italic: true,
    bold: true,
  })
})

test("LaTeX escaping", () => {
  expect(texEscape("50% & $5 #1 a_b")).toBe("50\\% \\& \\$5 \\#1 a\\_b")
})

for (const kind of KINDS) {
  const m = sampleFor(kind)

  test.if(has("epubcheck"))(
    `${kind}: EPUB passes epubcheck`,
    () => {
      const file = join(dir, `${kind}.epub`)
      writeFileSync(file, toEpub(m))
      const run = spawnSync("epubcheck", [file], { encoding: "utf8" })
      // The message follows the machine's language; the counts don't.
      expect(run.stdout).toMatch(/0 \S+ \/ 0 \S+ \/ 0 \S+/)
      expect(run.status).toBe(0)
    },
    60000
  )

  test.if(has("tectonic"))(
    `${kind}: LaTeX compiles`,
    () => {
      const file = join(dir, `${kind}.tex`)
      writeFileSync(file, toLatex(m))
      const run = spawnSync(
        "tectonic",
        ["--keep-logs", "-c", "minimal", file],
        {
          encoding: "utf8",
        }
      )
      if (run.status !== 0) console.log(run.stdout, run.stderr.slice(-1500))
      expect(run.status).toBe(0)
    },
    180000
  )

  test.if(has("pandoc"))(
    `${kind}: DOCX opens and keeps its text`,
    () => {
      const file = join(dir, `${kind}.docx`)
      writeFileSync(file, toDocx(m))
      const run = spawnSync("pandoc", [file, "-s", "-t", "markdown"], {
        encoding: "utf8",
      })
      expect(run.status).toBe(0)
      expect(run.stdout).toContain(m.title)
      const needle = m.parts[0]!.body.split("\n").find((l) => l.length > 20)!
      expect(run.stdout.replace(/[\s\\]+/g, " ")).toContain(
        needle.slice(0, 16).replace(/[*"]/g, "")
      )
    },
    30000
  )

  test(`${kind}: PDF is real, with its text`, async () => {
    const bytes = await toPdf(m, "book", "5.5x8.5")
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-")
    const file = join(dir, `${kind}.pdf`)
    writeFileSync(file, bytes)
    if (has("pdftotext", "-v")) {
      const run = spawnSync("pdftotext", ["-layout", file, "-"], {
        encoding: "utf8",
      })
      expect(run.stdout).toContain(kind === "screenplay" ? "MARA" : m.title)
    }
  }, 30000)

  test(`${kind}: text formats`, () => {
    expect(toHtml(m)).toContain(m.title)
    expect(toPlain(m)).toContain(kind === "screenplay" ? "JONAS" : m.title)
    expect(toRtf(m)).toStartWith("{\\rtf1")
    if (kind !== "screenplay") expect(toMarkdown(m)).toContain(`# ${m.title}`)
  })
}

// A writer can reach for the Bindery before writing a word.
for (const kind of KINDS) {
  const empty = emptyManuscript(kind)

  test.if(has("epubcheck"))(
    `empty ${kind}: EPUB stays valid`,
    () => {
      const file = join(dir, `empty-${kind}.epub`)
      writeFileSync(file, toEpub(empty))
      expect(spawnSync("epubcheck", [file]).status).toBe(0)
    },
    60000
  )

  test.if(has("tectonic"))(
    `empty ${kind}: LaTeX compiles`,
    () => {
      const file = join(dir, `empty-${kind}.tex`)
      writeFileSync(file, toLatex(empty))
      expect(spawnSync("tectonic", ["-c", "minimal", file]).status).toBe(0)
    },
    120000
  )

  test(`empty ${kind}: everything else still writes`, async () => {
    expect((await toPdf(empty, "book", "a5")).length).toBeGreaterThan(500)
    expect(readZip(toDocx(empty))["word/document.xml"]).toBeTruthy()
    expect(toHtml(empty)).toContain("<html")
    expect(toRtf(empty)).toEndWith("}")
    expect(toPlain(empty)).toBeString()
  }, 30000)
}

test.if(has("tectonic"))(
  "LaTeX survives hostile characters",
  () => {
    const m = emptyManuscript("novel", "100% of #1 & $5_a~b^c")
    m.author = "A\\B {C}"
    m.parts[0]!.body =
      "50% *of* {this} & that_thing \\end{document} ~ ^ #\n***\n“Quoted” — ‘done’… É è ñ"
    const file = join(dir, "hostile.tex")
    writeFileSync(file, toLatex(m))
    expect(spawnSync("tectonic", ["-c", "minimal", file]).status).toBe(0)
  },
  120000
)

test("manuscript format PDF", async () => {
  const bytes = await toPdf(sampleFor("novel"), "manuscript", "5.5x8.5")
  expect(bytes.length).toBeGreaterThan(5000)
})

test("Fountain round-trips", () => {
  const m = sampleFor("screenplay")
  const back = fromFountain(toFountain(m))
  expect(back.title).toBe(m.title)
  expect(back.author).toBe(m.author)
  expect(back.parts[0]!.body).toBe(m.parts[0]!.body)
})

test("FDX round-trips element types", () => {
  const m = sampleFor("screenplay")
  const xml = toFdx(m)
  expect(xml).toContain('<Paragraph Type="Scene Heading">')
  const back = fromFdx(xml)
  expect(back.parts[0]!.body).toContain("INT. JONAS'S KITCHEN - LATER")
  expect(back.parts[0]!.body).toContain(
    "MARA\n(not turning)\nI know what it was."
  )
})

test("text imports split on headings", () => {
  const m = fromText(
    "# One\n\nFirst para.\n\nSecond.\n\n# Two\n\nThird.",
    "novel"
  )
  expect(m.parts.map((p) => p.title)).toEqual(["One", "Two"])
  expect(m.parts[0]!.body).toBe("First para.\nSecond.")
})

test("DOCX has the parts Word needs", () => {
  const files = readZip(toDocx(sampleFor("novel")))
  expect(Object.keys(files)).toContain("word/document.xml")
  expect(files["word/document.xml"]).toContain("Weighing House")
})
