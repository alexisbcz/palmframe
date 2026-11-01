import { strFromU8, strToU8, unzipSync, zipSync } from "fflate"

import { parseScript } from "../fountain"
import { emptyManuscript, newPart, type Kind, type Manuscript } from "../model"
import {
  blocksOf,
  byline,
  escapeXml,
  pagesOf,
  partLabel,
  plain,
  scriptOf,
} from "./common"

// Formats that are text with rules, and importing them back.

export function toFountain(m: Manuscript) {
  const title = [
    `Title: ${m.title}`,
    ...(m.author ? [`Credit: Written by`, `Author: ${m.author}`] : []),
    ...(m.contact ? [`Contact: ${m.contact.replace(/\n/g, "\n    ")}`] : []),
  ]
  return `${title.join("\n")}\n\n${m.parts.map((p) => p.body).join("\n\n")}\n`
}

const FDX_TYPE: Record<string, string> = {
  scene: "Scene Heading",
  action: "Action",
  character: "Character",
  parenthetical: "Parenthetical",
  dialogue: "Dialogue",
  transition: "Transition",
  centered: "Action",
  lyric: "Dialogue",
}

export function toFdx(m: Manuscript) {
  const paragraphs = scriptOf(m)
    .filter((l) => FDX_TYPE[l.type] && l.text)
    .map((l) => {
      const number =
        l.type === "scene" && l.number ? ` Number="${escapeXml(l.number)}"` : ""
      const align = l.type === "centered" ? ` Alignment="Center"` : ""
      return `    <Paragraph Type="${FDX_TYPE[l.type]}"${number}${align}><Text>${escapeXml(l.text)}</Text></Paragraph>`
    })
  const titlePage = [m.title, m.author ? "Written by" : "", m.author, m.contact]
    .filter(Boolean)
    .map(
      (t) =>
        `      <Paragraph Alignment="Center"><Text>${escapeXml(t)}</Text></Paragraph>`
    )
  return `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Template="No" Version="5">
  <Content>
${paragraphs.join("\n")}
  </Content>
  <TitlePage>
    <Content>
${titlePage.join("\n")}
    </Content>
  </TitlePage>
</FinalDraft>
`
}

const FROM_FDX: Record<string, (t: string) => string> = {
  "Scene Heading": (t) => `\n${/^(INT|EXT|EST|I\/E)/i.test(t) ? t : `.${t}`}\n`,
  Action: (t) => `\n${t}\n`,
  Character: (t) => `\n${t}\n`,
  Parenthetical: (t) => `${t.startsWith("(") ? t : `(${t})`}\n`,
  Dialogue: (t) => `${t}\n`,
  Transition: (t) => `\n> ${t}\n`,
}

export function fromFdx(xml: string, title = ""): Manuscript {
  const m = emptyManuscript("screenplay", title)
  const content = /<Content>([\s\S]*?)<\/Content>/.exec(xml)?.[1] ?? xml
  const decode = (s: string) =>
    s
      .replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&")
  let body = ""
  for (const p of content.matchAll(
    /<Paragraph[^>]*Type="([^"]+)"[^>]*>([\s\S]*?)<\/Paragraph>/g
  )) {
    const text = [...p[2]!.matchAll(/<Text[^>]*>([\s\S]*?)<\/Text>/g)]
      .map((t) => decode(t[1]!))
      .join("")
    body += (FROM_FDX[p[1]!] ?? FROM_FDX.Action!)(text)
  }
  m.parts[0]!.body = body.replace(/\n{3,}/g, "\n\n").trim()
  return m
}

export function fromFountain(source: string, name = ""): Manuscript {
  const m = emptyManuscript("screenplay", name)
  const text = source.replace(/\r\n?/g, "\n")
  const head = /^(?:[A-Za-z ]+:.*\n(?:[ \t]+.*\n)*)+\n/.exec(text)
  if (head) {
    for (const f of head[0].matchAll(
      /^([A-Za-z ]+):[ \t]*(.*(?:\n[ \t]+.*)*)/gm
    )) {
      const key = f[1]!.toLowerCase()
      const value = f[2]!.replace(/\n[ \t]+/g, "\n").trim()
      if (key === "title") m.title = value
      if (key === "author" || key === "authors") m.author = value
      if (key === "contact") m.contact = value
    }
  }
  m.parts[0]!.body = text.slice(head?.[0].length ?? 0).trim()
  return m
}

// Plain text or Markdown: `#` headings or "Chapter" lines start parts.
export function fromText(source: string, kind: Kind, name = ""): Manuscript {
  const m = emptyManuscript(kind, name)
  const text = source.replace(/\r\n?/g, "\n")
  const parts: { title: string; lines: string[] }[] = [{ title: "", lines: [] }]
  for (const line of text.split("\n")) {
    const h =
      /^#{1,3}\s+(.+)$/.exec(line) ??
      /^((?:chapter|chapitre|part|partie)\s+[\w-]+.*)$/i.exec(line)
    if (h) parts.push({ title: h[1]!.trim(), lines: [] })
    else parts[parts.length - 1]!.lines.push(line)
  }
  const filled = parts.filter((p) => p.title || p.lines.join("").trim())
  const form = kind === "poetry" ? "free" : undefined
  m.parts = filled.map((p) => {
    const body = p.lines.join("\n").trim()
    return newPart(
      p.title,
      // Prose paragraphs arrive blank-line separated; the desk keeps one line each.
      kind === "novel"
        ? body.replace(/\n\s*\n/g, "\n").replace(/\n{2,}/g, "\n")
        : body,
      form
    )
  })
  if (!m.parts.length) m.parts = [newPart("", "", form)]
  return m
}

export function toMarkdown(m: Manuscript) {
  const out = [`# ${m.title}`, ...(m.author ? [`\n*${m.author}*`] : []), ""]
  m.parts.forEach((p, i) => {
    const label = partLabel(m, p, i)
    if (label) out.push(`## ${label}`, "")
    for (const b of blocksOf(m, p)) {
      if (b.t === "p")
        out.push(
          b.runs
            .map((r) =>
              r.bold && r.italic
                ? `***${r.text}***`
                : r.bold
                  ? `**${r.text}**`
                  : r.italic
                    ? `*${r.text}*`
                    : r.text
            )
            .join(""),
          ""
        )
      else if (b.t === "break") out.push("***", "")
      else if (b.t === "stanza")
        out.push(b.lines.map((l) => `${l}  `).join("\n"), "")
    }
  })
  return `${out.join("\n").trim()}\n`
}

export function toPlain(m: Manuscript) {
  if (m.kind === "screenplay")
    return pagesOf(m)
      .map(
        (p) =>
          `${" ".repeat(70)}${p.number}.\n\n${p.lines
            .map((l) => {
              const indent =
                l.type === "character" || l.type === "contd"
                  ? 22
                  : l.type === "dialogue"
                    ? 10
                    : l.type === "parenthetical"
                      ? 16
                      : l.type === "more"
                        ? 22
                        : 0
              return " ".repeat(indent) + l.text
            })
            .join("\n")}`
      )
      .join("\f\n")
  const out = [m.title, byline(m), ""]
  m.parts.forEach((p, i) => {
    const label = partLabel(m, p, i)
    if (label) out.push(label.toUpperCase(), "")
    for (const b of blocksOf(m, p)) {
      if (b.t === "p") out.push(plain(b.runs), "")
      else if (b.t === "break") out.push("* * *", "")
      else if (b.t === "stanza") out.push(...b.lines, "")
    }
  })
  return `${out.join("\n").trim()}\n`
}

const rtfEscape = (s: string) =>
  s
    .replace(/[\\{}]/g, (c) => `\\${c}`)
    .replace(/[\u0080-￿]/g, (c) => {
      const n = c.charCodeAt(0)
      return `\\u${n > 32767 ? n - 65536 : n}?`
    })

export function toRtf(m: Manuscript) {
  const out = [
    `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Times New Roman;}}\\f0\\fs24`,
    `\\qc\\b\\fs48 ${rtfEscape(m.title)}\\b0\\fs24\\par\\qc ${rtfEscape(m.author)}\\par\\page\\ql`,
  ]
  m.parts.forEach((p, i) => {
    const label = partLabel(m, p, i)
    if (label)
      out.push(`\\qc\\b\\fs32 ${rtfEscape(label)}\\b0\\fs24\\par\\ql\\par`)
    for (const b of blocksOf(m, p)) {
      if (b.t === "p") {
        const runs = b.runs
          .map(
            (r) =>
              `${r.italic ? "\\i " : ""}${r.bold ? "\\b " : ""}${rtfEscape(r.text)}${r.bold ? "\\b0 " : ""}${r.italic ? "\\i0 " : ""}`
          )
          .join("")
        out.push(`${b.first ? "\\fi0" : "\\fi360"} ${runs}\\par`)
      } else if (b.t === "break") out.push(`\\qc * * *\\par\\ql`)
      else if (b.t === "stanza")
        out.push(
          `${b.lines.map((l) => `\\fi0 ${rtfEscape(l)}\\line`).join("")}\\par\\par`
        )
    }
    if (i < m.parts.length - 1) out.push("\\page")
  })
  out.push("}")
  return out.join("\n")
}

export const inlineHtml = (
  runs: { text: string; italic?: boolean; bold?: boolean }[]
) =>
  runs
    .map((r) => {
      let h = escapeXml(r.text)
      if (r.italic) h = `<em>${h}</em>`
      if (r.bold) h = `<strong>${h}</strong>`
      return h
    })
    .join("")

const SCRIPT_CLASS: Record<string, string> = {
  scene: "scene",
  action: "action",
  character: "character",
  parenthetical: "paren",
  dialogue: "dialogue",
  transition: "transition",
  centered: "centered",
  lyric: "lyric",
}

export function scriptHtml(body: string) {
  return parseScript(body)
    .filter((l) => SCRIPT_CLASS[l.type] && l.text)
    .map(
      (l) =>
        `<p class="${SCRIPT_CLASS[l.type]}">${escapeXml(l.text.replace(/\*+/g, ""))}</p>`
    )
    .join("\n")
}

export const partHtml = (m: Manuscript, i: number) => {
  const part = m.parts[i]!
  if (m.kind === "screenplay") return scriptHtml(part.body)
  return blocksOf(m, part)
    .map((b) => {
      if (b.t === "p")
        return `<p${b.first ? ' class="first"' : ""}>${inlineHtml(b.runs)}</p>`
      if (b.t === "break") return `<p class="break">⁂</p>`
      if (b.t === "stanza")
        return `<div class="stanza">${b.lines.map((l) => `<p class="line">${escapeXml(l)}</p>`).join("")}</div>`
      return ""
    })
    .join("\n")
}

export const BOOK_CSS = `body{font-family:Georgia,"EB Garamond",serif;line-height:1.5;margin:1em}
h1{text-align:center;font-weight:normal;margin:2em 0 1.5em}
p{margin:0;text-indent:1.4em;text-align:justify}
p.first{text-indent:0}
p.break{text-align:center;text-indent:0;margin:1em 0}
.title{text-align:center;margin-top:30%}
.title h1{font-size:2em;margin:0 0 .5em}
.title p{text-align:center;text-indent:0}
.stanza{margin:0 0 1.2em}
.line{text-indent:-1.5em;margin-left:1.5em;text-align:left}
.scene,.action,.character,.paren,.dialogue,.transition,.centered,.lyric{font-family:"Courier Prime","Courier New",Courier,monospace;text-indent:0;text-align:left;line-height:1.2}
.scene{font-weight:bold;margin:1.6em 0 .8em}
.action{margin:0 0 .8em}
.character{margin:.8em 0 0 38%}
.paren{margin:0 0 0 30%}
.dialogue{margin:0 15% .8em 18%}
.lyric{margin:0 15% .8em 18%;font-style:italic}
.transition{text-align:right;margin:.8em 0}
.centered{text-align:center;margin:.8em 0}`

export function toHtml(m: Manuscript) {
  const parts = m.parts
    .map((p, i) => {
      const label = partLabel(m, p, i)
      return `<section>${label ? `<h1>${escapeXml(label)}</h1>` : ""}\n${partHtml(m, i)}\n</section>`
    })
    .join("\n")
  return `<!doctype html>
<html lang="${m.language}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeXml(m.title)}</title>
<style>${BOOK_CSS}
body{max-width:34em;margin:2em auto;padding:0 1em}</style></head>
<body><div class="title"><h1>${escapeXml(m.title)}</h1><p>${escapeXml(m.author)}</p></div>
${parts}
</body></html>
`
}

// DOCX ----------------------------------------------------------------------

const wRun = (text: string, props = "") =>
  `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`

const wPara = (style: string, runs: string) =>
  `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr>${runs}</w:p>`

const STYLE = (id: string, name: string, para: string, run = "") =>
  `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/>${id === "Body" ? "" : '<w:basedOn w:val="Body"/>'}<w:pPr>${para}</w:pPr><w:rPr>${run}</w:rPr></w:style>`

const courier = `<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/><w:sz w:val="24"/>`

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia"/><w:sz w:val="24"/></w:rPr></w:rPrDefault></w:docDefaults>
${STYLE("Body", "Normal", '<w:spacing w:line="360" w:lineRule="auto"/><w:ind w:firstLine="360"/>')}
${STYLE("First", "First Paragraph", '<w:ind w:firstLine="0"/>')}
${STYLE("Title", "Title", '<w:jc w:val="center"/><w:ind w:firstLine="0"/>', '<w:sz w:val="56"/>')}
${STYLE("Heading1", "heading 1", '<w:keepNext/><w:pageBreakBefore/><w:spacing w:after="480"/><w:jc w:val="center"/><w:ind w:firstLine="0"/>', '<w:sz w:val="36"/>')}
${STYLE("Break", "Scene Break", '<w:jc w:val="center"/><w:ind w:firstLine="0"/>')}
${STYLE("Verse", "Verse", '<w:spacing w:line="276" w:lineRule="auto"/><w:ind w:left="360" w:hanging="360"/>')}
${STYLE("Scene", "Scene Heading", '<w:keepNext/><w:spacing w:before="240" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/>', `${courier}<w:b/>`)}
${STYLE("Action", "Action", '<w:spacing w:before="240" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/>', courier)}
${STYLE("Character", "Character", '<w:keepNext/><w:spacing w:before="240" w:line="240" w:lineRule="auto"/><w:ind w:left="3168" w:firstLine="0"/>', courier)}
${STYLE("Parenthetical", "Parenthetical", '<w:keepNext/><w:spacing w:line="240" w:lineRule="auto"/><w:ind w:left="2304" w:right="2304" w:firstLine="0"/>', courier)}
${STYLE("Dialogue", "Dialogue", '<w:spacing w:line="240" w:lineRule="auto"/><w:ind w:left="1440" w:right="2160" w:firstLine="0"/>', courier)}
${STYLE("Transition", "Transition", '<w:spacing w:before="240" w:line="240" w:lineRule="auto"/><w:jc w:val="right"/><w:ind w:firstLine="0"/>', courier)}
</w:styles>`

const DOCX_SCRIPT: Record<string, string> = {
  scene: "Scene",
  action: "Action",
  character: "Character",
  parenthetical: "Parenthetical",
  dialogue: "Dialogue",
  lyric: "Dialogue",
  transition: "Transition",
  centered: "Break",
}

export function toDocx(m: Manuscript) {
  const body = [
    wPara("Title", wRun(m.title)),
    ...(m.author ? [wPara("Break", wRun(m.author))] : []),
  ]
  if (m.kind === "screenplay") {
    for (const l of scriptOf(m))
      if (DOCX_SCRIPT[l.type] && l.text)
        body.push(wPara(DOCX_SCRIPT[l.type]!, wRun(l.text.replace(/\*+/g, ""))))
  } else {
    m.parts.forEach((p, i) => {
      const label = partLabel(m, p, i)
      if (label) body.push(wPara("Heading1", wRun(label)))
      for (const b of blocksOf(m, p)) {
        if (b.t === "p")
          body.push(
            wPara(
              b.first ? "First" : "Body",
              b.runs
                .map((r) =>
                  wRun(
                    r.text,
                    `${r.bold ? "<w:b/>" : ""}${r.italic ? "<w:i/>" : ""}`
                  )
                )
                .join("")
            )
          )
        else if (b.t === "break") body.push(wPara("Break", wRun("* * *")))
        else if (b.t === "stanza") {
          for (const l of b.lines) body.push(wPara("Verse", wRun(l)))
          body.push(wPara("Verse", ""))
        }
      }
    })
  }
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join("")}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="${m.kind === "screenplay" ? 2160 : 1440}"/></w:sectPr></w:body></w:document>`
  return zipSync({
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
    ),
    "word/_rels/document.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
    ),
    "word/document.xml": strToU8(documentXml),
    "word/styles.xml": strToU8(STYLES),
  })
}

// Used by tests to look inside a zip.
export const readZip = (bytes: Uint8Array) =>
  Object.fromEntries(
    Object.entries(unzipSync(bytes)).map(([k, v]) => [k, strFromU8(v)])
  )
