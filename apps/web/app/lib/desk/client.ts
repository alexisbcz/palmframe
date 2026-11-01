import type { Supabase } from "@/lib/supabase.browser"

import {
  FORMATS,
  safeName,
  titled,
  type FormatId,
  type Trim,
} from "./export/common"
import { totalWords, type Manuscript } from "./model"

export function download(name: string, mime: string, data: BlobPart) {
  const url = URL.createObjectURL(new Blob([data], { type: mime }))
  const a = document.createElement("a")
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export type Saved = "ok" | "conflict" | "error"

export async function saveManuscript(
  supabase: Supabase,
  id: string,
  m: Manuscript,
  revision: number
): Promise<{ result: Saved; revision: number }> {
  const { data, error } = await supabase
    .from("comic_manuscripts")
    .update({
      title: m.title.slice(0, 200),
      words: totalWords(m),
      data: m,
      revision: revision + 1,
    })
    .eq("id", id)
    .eq("revision", revision)
    .select("revision")
  if (error) return { result: "error", revision }
  if (!data?.length) return { result: "conflict", revision }
  return { result: "ok", revision: data[0]!.revision }
}

export async function renderPdf(
  m: Manuscript,
  style: "book" | "manuscript",
  trim: Trim
) {
  const res = await fetch("/api/desk/pdf", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ manuscript: m, style, trim }),
  })
  if (!res.ok) throw new Error(`PDF failed (${res.status})`)
  return res.arrayBuffer()
}

export async function exportAs(
  source: Manuscript,
  format: FormatId,
  trim: Trim
) {
  const m = titled(source)
  const { ext, mime } = FORMATS[format]
  const base = safeName(m.title)
  const name =
    format === "manuscript" ? `${base}-manuscript.${ext}` : `${base}.${ext}`
  if (format === "pdf" || format === "manuscript") {
    const pdf = await renderPdf(
      m,
      format === "pdf" ? "book" : "manuscript",
      trim
    )
    download(name, mime, pdf)
    return
  }
  // Heavier writers load on demand, so the Desk opens quickly.
  const text = await import("./export/text")
  const writers: Record<string, () => BlobPart | Promise<BlobPart>> = {
    epub: async () =>
      (await import("./export/epub")).toEpub(
        m,
        `urn:uuid:${crypto.randomUUID()}`
      ) as BlobPart,
    tex: async () => (await import("./export/latex")).toLatex(m, trim),
    docx: () => text.toDocx(m) as BlobPart,
    fountain: () => text.toFountain(m),
    fdx: () => text.toFdx(m),
    html: () => text.toHtml(m),
    md: () => text.toMarkdown(m),
    rtf: () => text.toRtf(m),
    txt: () => text.toPlain(m),
  }
  download(name, mime, await writers[format]!())
}

export async function importFile(file: File, kind: Manuscript["kind"]) {
  const text = await file.text()
  const name = file.name.replace(/\.[^.]+$/, "")
  const { fromFdx, fromFountain, fromText } = await import("./export/text")
  if (/\.fdx$/i.test(file.name)) return fromFdx(text, name)
  if (/\.(fountain|spmd)$/i.test(file.name) || kind === "screenplay")
    return fromFountain(text, name)
  return fromText(text, kind, name)
}
