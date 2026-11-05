// A story as a newsletter email: HTML with inline styles (mail clients ignore
// stylesheets) and a plain-text twin. Pure, so it's tested and previewed.
import { type Inline, parseMarkdown, safeHref } from "@/lib/media/markdown"

export interface IssueInput {
  publication: { name: string; tagline: string; accent: string }
  story: { title: string; dek: string; body: string; cover: string | null }
  storyUrl: string
  unsubscribeUrl: string
}

const escape = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

function inline(nodes: Inline[], accent: string) {
  return nodes
    .map((n) => {
      if (n.kind === "strong") return `<strong>${escape(n.text)}</strong>`
      if (n.kind === "em") return `<em>${escape(n.text)}</em>`
      if (n.kind === "link") {
        const href = safeHref(n.href)
        return href
          ? `<a href="${escape(href)}" style="color:${accent}">${escape(n.text)}</a>`
          : escape(n.text)
      }
      return escape(n.text)
    })
    .join("")
}

const plain = (nodes: Inline[]) =>
  nodes
    .map((n) => (n.kind === "link" ? `${n.text} (${n.href})` : n.text))
    .join("")

const SERIF = "Georgia,'Times New Roman',serif"
const SANS = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif"

export function renderIssue({
  publication,
  story,
  storyUrl,
  unsubscribeUrl,
}: IssueInput) {
  const accent = /^#[0-9a-f]{6}$/i.test(publication.accent)
    ? publication.accent
    : "#3d7bff"
  const blocks = parseMarkdown(story.body)
  const p = `margin:0 0 18px;font:17px/1.6 ${SERIF};color:#1a1a1a`
  const body = blocks
    .map((b) => {
      if (b.kind === "heading")
        return `<h2 style="margin:28px 0 12px;font:700 20px/1.3 ${SANS};color:#111">${inline(b.text, accent)}</h2>`
      if (b.kind === "quote")
        return `<blockquote style="margin:0 0 18px;padding-left:16px;border-left:3px solid ${accent};font:italic 17px/1.6 ${SERIF};color:#333">${inline(b.text, accent)}</blockquote>`
      if (b.kind === "list") {
        const tag = b.ordered ? "ol" : "ul"
        return `<${tag} style="${p};padding-left:22px">${b.items.map((i) => `<li style="margin-bottom:8px">${inline(i, accent)}</li>`).join("")}</${tag}>`
      }
      return `<p style="${p}">${inline(b.text, accent)}</p>`
    })
    .join("\n")
  const cover = story.cover && safeHref(story.cover)
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(story.title)}</title></head>
<body style="margin:0;padding:0;background:#f4f2ec">
<div style="display:none;max-height:0;overflow:hidden">${escape(story.dek)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ec"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#fbfaf6;border-radius:12px;overflow:hidden">
<tr><td style="padding:22px 28px;border-bottom:3px solid ${accent}">
<div style="font:800 20px/1 ${SANS};letter-spacing:-0.01em;text-transform:uppercase;color:#111">${escape(publication.name)}</div>
${publication.tagline ? `<div style="margin-top:6px;font:13px/1.4 ${SANS};color:#666">${escape(publication.tagline)}</div>` : ""}
</td></tr>
${cover ? `<tr><td><img src="${escape(cover)}" width="640" alt="" style="display:block;width:100%;height:auto"></td></tr>` : ""}
<tr><td style="padding:28px 28px 8px">
<h1 style="margin:0 0 12px;font:700 30px/1.15 ${SERIF};color:#111">${escape(story.title)}</h1>
<p style="margin:0 0 24px;font:italic 19px/1.45 ${SERIF};color:#4a4a4a">${escape(story.dek)}</p>
${body}
<p style="margin:28px 0 0"><a href="${escape(storyUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:${accent};color:#fff;font:600 15px ${SANS};text-decoration:none">Read it with its sources</a></p>
</td></tr>
<tr><td style="padding:24px 28px 28px;font:12px/1.5 ${SANS};color:#888">
Reported by an AI agent from public sources and checked by software and a second model. Errors are possible.<br>
<a href="${escape(unsubscribeUrl)}" style="color:#888">Unsubscribe</a>
</td></tr>
</table></td></tr></table>
</body></html>`
  const text = [
    publication.name.toUpperCase(),
    "",
    story.title,
    story.dek,
    "",
    ...blocks.map((b) => {
      if (b.kind === "heading") return `\n${plain(b.text).toUpperCase()}`
      if (b.kind === "list")
        return b.items.map((i) => `- ${plain(i)}`).join("\n")
      return plain(b.text)
    }),
    "",
    `Read it with its sources: ${storyUrl}`,
    "",
    "Reported by an AI agent from public sources. Errors are possible.",
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join("\n")
  return { subject: story.title, html, text }
}
