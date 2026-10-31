import {
  inlineRuns,
  layoutItems,
  textOf,
  type ExportBook,
  type ExportSegment,
} from "./common"

const escapeMd = (s: string) => s.replace(/([\\`*_[\]<])/g, "\\$1")

function inline(text: string, s: ExportSegment) {
  return inlineRuns(text, s.tags)
    .map((run) => {
      if (run.br) return "  \n"
      if (!run.text) return ""
      let out = run.code ? `\`${run.text}\`` : escapeMd(run.text)
      const edge = /^(\s*)([\s\S]*?)(\s*)$/.exec(out)!
      const wrap = (mark: string) => {
        out = `${edge[1]}${mark}${edge[2]}${mark}${edge[3]}`
      }
      if (run.bold && run.italic) wrap("***")
      else if (run.bold) wrap("**")
      else if (run.italic) wrap("*")
      if (run.strike) wrap("~~")
      if (run.href) out = `[${out}](${run.href})`
      return out
    })
    .join("")
}

function block(s: ExportSegment, text: string) {
  const body = inline(text, s)
  if (s.kind === "heading")
    return `${"#".repeat(Math.min(s.level ?? 2, 6))} ${body}`
  if (s.kind === "quote") return `> ${body}`
  if (s.kind === "list_item") return `- ${body}`
  if (s.kind === "footnote") return `<small>${body}</small>`
  if (s.kind === "caption") return `*${body}*`
  return body
}

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ")

export function buildMarkdown(book: ExportBook) {
  const out: string[] = []
  for (const chapter of book.chapters) {
    if (chapter.segments.every((s) => s.kind === "meta")) continue
    for (const item of layoutItems(chapter.segments)) {
      if (item.type === "table") {
        const rows = item.rows.map(
          (row) =>
            `| ${row
              .map((c) =>
                cell(
                  book.bilingual
                    ? `${inline(c.source, c)} / ${inline(textOf(c), c)}`
                    : inline(textOf(c), c)
                )
              )
              .join(" | ")} |`
        )
        const cols = item.rows[0]?.length ?? 1
        rows.splice(1, 0, `|${" --- |".repeat(cols)}`)
        out.push(rows.join("\n"))
        continue
      }
      const s = item.segment
      if (s.kind === "rule") out.push("---")
      else if (s.kind === "code") out.push(`\`\`\`\n${s.source}\n\`\`\``)
      else if (s.kind === "image") {
        if (s.asset) out.push(`![${escapeMd(textOf(s))}](${s.asset})`)
      } else {
        if (book.bilingual && s.kind !== "heading")
          out.push(`> ${inline(s.source, s)}`)
        out.push(block(s, textOf(s)))
      }
    }
  }
  const title = book.chapters
    .flatMap((c) => c.segments)
    .find((s) => s.locator === "meta:title")
  const header = [
    "---",
    `title: ${JSON.stringify(title?.target ?? book.title)}`,
    book.author && `author: ${JSON.stringify(book.author)}`,
    `lang: ${book.targetLang}`,
    "---",
  ]
    .filter(Boolean)
    .join("\n")
  return new TextEncoder().encode(`${header}\n\n${out.join("\n\n")}\n`)
}
