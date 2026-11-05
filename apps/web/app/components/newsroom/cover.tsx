import type * as React from "react"

import { type Template, templateById } from "@/lib/newsroom/templates"

// The template's colours as CSS variables, for a cover or a whole story.
export const lookStyle = (t: Template | null) =>
  (t
    ? {
        "--paper": t.look.paper,
        "--cover-ink": t.look.ink,
        "--accent": t.look.accent,
      }
    : {}) as React.CSSProperties

// A picture when there is one, otherwise the headline set like a magazine
// cover in the template's colours, so a story never shows an empty frame.
export function Cover({
  template,
  title,
  image,
  small,
  bare,
  className,
}: {
  template: string | null
  title: string
  image?: string | null
  small?: boolean
  // Masthead only: the story's own header carries the headline.
  bare?: boolean
  className?: string
}) {
  const t = templateById(template)
  return (
    <div
      className={`nr-cover ${className ?? ""}`}
      data-face={t?.look.face ?? "grotesk"}
      data-image={image ? true : undefined}
      data-small={small || undefined}
      style={lookStyle(t)}
    >
      {image && <img src={image} alt="" loading="lazy" decoding="async" />}
      <div className="nr-cover-type">
        <div className="nr-cover-mast">
          <span>{t?.name ?? "Newsroom"}</span>
          <em>PALMFRAME</em>
        </div>
        {!small && !bare && <h3 className="nr-cover-head">{title}</h3>}
        {small && <h3 className="nr-cover-head">{t?.name}</h3>}
      </div>
    </div>
  )
}
