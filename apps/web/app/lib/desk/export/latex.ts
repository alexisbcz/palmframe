import { paginate } from "../fountain"
import type { Manuscript, Run } from "../model"
import {
  blocksOf,
  partLabel,
  scriptOf,
  titled,
  TRIMS,
  type Trim,
} from "./common"

// Real LaTeX, meant to be read and edited: memoir for books, its verse
// environment for poems, and a small self-contained preamble for scripts so
// the file compiles without a screenplay class installed.

export const texEscape = (s: string) =>
  s
    .replace(/\\/g, "\u0000")
    .replace(/([&%$#_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/\u0000/g, "\\textbackslash{}")
    .replace(/"([^"]*)"/g, "``$1''")
    .replace(/…/g, "\\ldots{}")

const runs = (list: Run[]) =>
  list
    .map((r) => {
      let t = texEscape(r.text)
      if (r.italic) t = `\\emph{${t}}`
      if (r.bold) t = `\\textbf{${t}}`
      return t
    })
    .join("")

const pt = (n: number) => `${n.toFixed(2)}bp`

const COMMON = (m: Manuscript) =>
  [
    `\\usepackage[${m.language === "fr" ? "french" : "english"}]{babel}`,
    `\\usepackage[T1]{fontenc}`,
    `\\usepackage[utf8]{inputenc}`,
    `\\usepackage{ebgaramond}`,
    `\\usepackage{microtype}`,
  ].join("\n")

function book(m: Manuscript, trim: Trim) {
  const { w, h } = TRIMS[trim]
  const out = [
    `% ${m.title}. Compile with tectonic, or: pdflatex book.tex`,
    `\\documentclass[11pt,twoside,openright]{memoir}`,
    COMMON(m),
    `\\setstocksize{${pt(h)}}{${pt(w)}}`,
    `\\settrimmedsize{\\stockheight}{\\stockwidth}{*}`,
    `\\setlrmarginsandblock{0.14\\stockwidth}{0.11\\stockwidth}{*}`,
    `\\setulmarginsandblock{0.1\\stockheight}{0.12\\stockheight}{*}`,
    `\\checkandfixthelayout`,
    `\\chapterstyle{bianchi}`,
    `\\makeevenhead{headings}{\\thepage}{\\scshape ${texEscape(m.author)}}{}`,
    `\\makeoddhead{headings}{}{\\scshape ${texEscape(m.title)}}{\\thepage}`,
    `\\pagestyle{headings}`,
    `\\title{${texEscape(m.title)}}`,
    `\\author{${texEscape(m.author)}}`,
    `\\date{}`,
    `\\begin{document}`,
    `\\frontmatter`,
    `\\begin{titlingpage}\\maketitle\\end{titlingpage}`,
    ...(m.parts.length > 1 ? [`\\tableofcontents*`] : []),
    `\\mainmatter`,
    ``,
  ]
  m.parts.forEach((p, i) => {
    const label = partLabel(m, p, i)
    out.push(
      m.kind === "poetry"
        ? `\\poemtitle{${texEscape(label)}}`
        : `\\chapter{${texEscape(label)}}`
    )
    const blocks = blocksOf(m, p)
    if (m.kind === "poetry") {
      if (!blocks.length) return
      out.push(`\\begin{verse}`)
      blocks.forEach((b, s) => {
        if (b.t !== "stanza") return
        out.push(
          b.lines
            .map(
              (l, n) => `${texEscape(l)}${n < b.lines.length - 1 ? "\\\\" : ""}`
            )
            .join("\n")
        )
        if (s < blocks.length - 1) out.push("\\\\!\n")
      })
      out.push(`\\end{verse}`, `\\clearpage`, ``)
      return
    }
    for (const b of blocks) {
      if (b.t === "p")
        out.push(`${b.first ? "\\noindent " : ""}${runs(b.runs)}`, "")
      else if (b.t === "break") out.push(`\\fancybreak{$*\\quad*\\quad*$}`, "")
    }
  })
  out.push(`\\end{document}`, ``)
  return out.join("\n").replace(/\\\\!\n\n/g, "\\\\!\n")
}

function script(m: Manuscript) {
  const pages = paginate(scriptOf(m))
  const preamble = [
    `% ${m.title}. Compile with tectonic, or: pdflatex script.tex`,
    `\\documentclass[12pt,letterpaper]{article}`,
    `\\usepackage[T1]{fontenc}`,
    `\\usepackage[utf8]{inputenc}`,
    `\\usepackage{courier}`,
    `\\usepackage[left=1.5in,right=1in,top=1in,bottom=1in,headsep=12pt,headheight=12pt]{geometry}`,
    `\\usepackage{fancyhdr}`,
    `\\renewcommand{\\familydefault}{\\ttdefault}`,
    `\\setlength{\\parindent}{0pt}`,
    `\\setlength{\\parskip}{0pt}`,
    `\\renewcommand{\\baselinestretch}{1}`,
    `\\pagestyle{fancy}\\fancyhf{}\\renewcommand{\\headrulewidth}{0pt}`,
    `\\fancyhead[R]{\\thepage.}`,
    `\\newcommand{\\sline}[3]{\\par\\noindent\\hspace*{#1}\\parbox[t]{#2}{\\raggedright #3}\\par}`,
    `\\begin{document}`,
    `\\thispagestyle{empty}`,
    `\\vspace*{3in}`,
    `\\begin{center}{\\Large ${texEscape(m.title.toUpperCase())}}\\\\[2em]${m.author ? `Written by\\\\[1em]${texEscape(m.author)}` : ""}\\end{center}`,
    `\\vfill`,
    ...(m.contact.trim()
      ? [`{${texEscape(m.contact.trim()).replace(/\n/g, "\\\\\n")}}`]
      : []),
    `\\newpage`,
    `\\setcounter{page}{1}`,
  ]
  const INDENT: Record<string, [number, number]> = {
    character: [2.2, 3.3],
    contd: [2.2, 3.3],
    more: [2.2, 3.3],
    parenthetical: [1.6, 2.5],
    dialogue: [1, 3.5],
    lyric: [1, 3.5],
  }
  if (!pages.length)
    return `${preamble.join("\n")}\n\\mbox{}\n\\end{document}\n`
  const body = pages.map((p, n) => {
    const lines = p.lines.map((l) => {
      if (l.type === "blank" || !l.text) return `\\mbox{}\\\\`
      const text = texEscape(l.text)
      const [left, width] = INDENT[l.type] ?? [0, 6]
      if (l.type === "transition") return `\\hfill ${text}\\\\`
      if (l.type === "centered")
        return `\\mbox{}\\hfill ${text}\\hfill\\mbox{}\\\\`
      if (l.type === "scene") return `\\textbf{${text}}\\\\`
      return left ? `\\sline{${left}in}{${width}in}{${text}}` : `${text}\\\\`
    })
    return `${lines.join("\n")}${n < pages.length - 1 ? "\n\\newpage" : ""}`
  })
  return `${preamble.join("\n")}\n${body.join("\n")}\n\\end{document}\n`
}

export function toLatex(source: Manuscript, trim: Trim = "5.5x8.5") {
  const m = titled(source)
  return m.kind === "screenplay" ? script(m) : book(m, trim)
}
