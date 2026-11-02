import * as React from "react"

import { fontsHref, type Site } from "@/lib/sites/model"

import { SiteView } from "./site"

// A live, scaled-down site. Drawn only once it's near the screen, so a gallery
// of templates doesn't lay out every page at once.
export function SitePreview({
  make,
  width = 1200,
  height,
  page = 0,
  eager,
}: {
  make: () => Site
  width?: number
  height?: number
  page?: number
  eager?: boolean
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [scale, setScale] = React.useState(0)
  const [site, setSite] = React.useState<Site | null>(null)
  React.useEffect(() => {
    const node = ref.current
    if (!node) return
    const measure = new ResizeObserver(([entry]) =>
      setScale(entry!.contentRect.width / width)
    )
    measure.observe(node)
    const near = new IntersectionObserver(
      ([entry]) => {
        if (!entry!.isIntersecting) return
        setSite((s) => s ?? make())
        near.disconnect()
      },
      { rootMargin: "300px" }
    )
    if (eager) setSite((s) => s ?? make())
    else near.observe(node)
    return () => {
      measure.disconnect()
      near.disconnect()
    }
  }, [make, width, eager])
  return (
    <div ref={ref} className="fr-preview" aria-hidden>
      {site && scale > 0 && (
        <div
          className="fr-preview-page"
          style={{
            width,
            height: height ?? undefined,
            transform: `scale(${scale})`,
          }}
        >
          <link
            rel="stylesheet"
            href={fontsHref([site.theme.heading, site.theme.body])}
            precedence="default"
          />
          <SiteView site={site} page={site.pages[page] ?? site.pages[0]!} />
        </div>
      )}
    </div>
  )
}
