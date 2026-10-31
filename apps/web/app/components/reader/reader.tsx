import * as React from "react"
import { Link } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Tooltip, TooltipTrigger } from "@workspace/ui/components/tooltip"

import { pageDoc, type ComicProject } from "@/components/comic-canvas/model"
import { renderToBlob, type ImageCache } from "@/components/comic-canvas/render"
import { useT } from "@/i18n/core"

import { messages } from "./reader.messages"

const ABUSE_EMAIL = "abuse@palmframe.com"

// The lettering in reading order, for screen readers.
function altText(project: ComicProject, index: number) {
  return [...project.pages[index]!.layers]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .flatMap((l) =>
      l.type !== "panel" && l.text.trim() ? [l.text.trim()] : []
    )
    .join(" ")
}

// Slides drawn by the same renderer as the export, one after the other, so
// the first shows up first.
function useSlides(project: ComicProject) {
  const [slides, setSlides] = React.useState<string[]>([])
  React.useEffect(() => {
    let live = true
    const images: ImageCache = new Map()
    const urls: string[] = []
    ;(async () => {
      for (const i of project.pages.keys()) {
        const blob = await renderToBlob(
          pageDoc(project, i),
          images,
          "image/jpeg"
        )
        if (!live || !blob) return
        urls.push(URL.createObjectURL(blob))
        setSlides([...urls])
      }
    })()
    return () => {
      live = false
      urls.forEach(URL.revokeObjectURL)
    }
  }, [project])
  return slides
}

// One slide at a time, swiped like the Instagram carousel it came from.
export function Reader({
  title,
  project,
  url,
}: {
  title: string
  project: ComicProject
  url: string
}) {
  const t = useT(messages)
  const slides = useSlides(project)
  const track = React.useRef<HTMLDivElement>(null)
  const [index, setIndex] = React.useState(0)
  const count = project.pages.length

  const goTo = React.useCallback((i: number) => {
    const el = track.current
    if (!el) return
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches
    el.scrollTo({
      left: i * el.clientWidth,
      behavior: still ? "auto" : "smooth",
    })
  }, [])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goTo(Math.min(index + 1, count - 1))
      if (e.key === "ArrowLeft") goTo(Math.max(index - 1, 0))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [goTo, index, count])

  const report = `mailto:${ABUSE_EMAIL}?subject=${encodeURIComponent(
    t("reportSubject")
  )}&body=${encodeURIComponent(`${t("reportBody")}\n\n${url}`)}`

  return (
    <main className="flex h-svh flex-col bg-background text-foreground">
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 px-4">
        <h1 className="min-w-0 truncate text-sm font-medium">
          {title || t("untitled")}
        </h1>
        {count > 1 && (
          <span
            aria-live="polite"
            className="shrink-0 text-sm text-muted-foreground tabular-nums"
          >
            {t("position", { n: index + 1, total: count })}
          </span>
        )}
      </header>

      <div className="relative min-h-0 flex-1">
        <div
          ref={track}
          dir="ltr"
          role="group"
          aria-roledescription={t("carousel")}
          aria-label={title || t("untitled")}
          tabIndex={0}
          onScroll={(e) => {
            const el = e.currentTarget
            setIndex(Math.round(el.scrollLeft / el.clientWidth))
          }}
          className="flex size-full snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto overscroll-x-contain outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset [&::-webkit-scrollbar]:hidden"
        >
          {project.pages.map((page, i) => (
            <div
              key={page.id}
              className="flex size-full shrink-0 snap-center snap-always items-center justify-center px-3 sm:px-16"
            >
              {slides[i] ? (
                <img
                  src={slides[i]}
                  alt={t("slide", {
                    n: i + 1,
                    total: count,
                    text: altText(project, i),
                  })}
                  draggable={false}
                  className="max-h-full max-w-full rounded-sm object-contain shadow-sm ring-1 ring-foreground/10"
                />
              ) : (
                <Skeleton
                  className="max-h-full w-full max-w-[min(100%,32rem)]"
                  style={{
                    aspectRatio: `${project.width} / ${project.height}`,
                  }}
                />
              )}
            </div>
          ))}
        </div>
        {count > 1 && (
          <>
            <TooltipTrigger isDisabled={index === 0}>
              <Button
                variant="outline"
                size="icon"
                aria-label={t("previous")}
                isDisabled={index === 0}
                onPress={() => goTo(index - 1)}
                className="absolute start-3 top-1/2 -translate-y-1/2 max-sm:hidden"
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
              </Button>
              <Tooltip>{t("previous")}</Tooltip>
            </TooltipTrigger>
            <TooltipTrigger isDisabled={index === count - 1}>
              <Button
                variant="outline"
                size="icon"
                aria-label={t("next")}
                isDisabled={index === count - 1}
                onPress={() => goTo(index + 1)}
                className="absolute end-3 top-1/2 -translate-y-1/2 max-sm:hidden"
              >
                <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
              </Button>
              <Tooltip>{t("next")}</Tooltip>
            </TooltipTrigger>
          </>
        )}
      </div>

      <Footer report={report} />
    </main>
  )
}

function Footer({ report }: { report?: string }) {
  const t = useT(messages)
  return (
    <footer className="flex h-11 shrink-0 items-center justify-between gap-3 px-4 text-xs text-muted-foreground">
      <Link
        to="/"
        className="rounded-xs py-3 transition-colors hover:text-foreground"
      >
        {t("madeWith")}
      </Link>
      {report && (
        <a
          href={report}
          className="rounded-xs py-3 transition-colors hover:text-foreground"
        >
          {t("report")}
        </a>
      )}
    </footer>
  )
}

// A wrong or revoked link looks the same as one that never existed.
export function ReaderMissing({ missing }: { missing: boolean }) {
  const t = useT(messages)
  return (
    <main className="flex h-svh flex-col bg-background text-foreground">
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-lg font-semibold">
          {t(missing ? "missing.title" : "failed.title")}
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          {t(missing ? "missing.body" : "failed.body")}
        </p>
      </div>
      <Footer />
    </main>
  )
}
