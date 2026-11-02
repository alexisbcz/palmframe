import * as React from "react"

import {
  safeHref,
  type Link,
  type Post,
  type Product,
  type Site,
} from "@/lib/sites/model"

export interface SiteContext {
  site: Site
  // Where the site lives, like `/s/rosewater`. Empty in the editor.
  base: string
  slug: string
  live: boolean
  taken: string[]
  path: string
}

export const Ctx = React.createContext<SiteContext | null>(null)
export const useSite = () => React.useContext(Ctx)!

export function hrefFor(link: Link | null | undefined, ctx: SiteContext) {
  if (!link) return null
  if (link.kind === "page") {
    const page = ctx.site.pages.find((p) => p.id === link.page)
    if (!page) return null
    return `${ctx.base}/${page.slug}`.replace(/\/$/, "") || "/"
  }
  if (link.kind === "section") return `#${link.section}`
  if (link.kind === "email") return safeHref(`mailto:${link.email}`)
  if (link.kind === "phone") return safeHref(`tel:${link.phone}`)
  return safeHref(link.url)
}

const external = (href: string) => /^https?:/i.test(href)

export function SiteLink({
  link,
  className,
  style,
  children,
}: {
  link?: Link | null
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
}) {
  const ctx = useSite()
  const href = hrefFor(link, ctx)
  if (!href)
    return (
      <span className={className} style={style}>
        {children}
      </span>
    )
  return (
    <a
      className={className}
      style={style}
      href={ctx.live ? href : undefined}
      {...(external(href) && { target: "_blank", rel: "noopener nofollow" })}
    >
      {children}
    </a>
  )
}

export const postPath = (ctx: SiteContext, p: Post) =>
  `${ctx.base}/blog/${p.slug}`
export const productPath = (ctx: SiteContext, p: Product) =>
  `${ctx.base}/shop/${p.slug}`
