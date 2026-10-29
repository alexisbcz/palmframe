import { cn } from "@workspace/ui/lib/utils"

import type { Locale } from "@/i18n/core"

// Inline SVG flags: emoji flags don't render on Windows. English uses the
// UK flag, matching the British spelling of the copy ("colour").
const FLAGS: Record<Locale, React.ReactNode> = {
  en: (
    <>
      <clipPath id="flag-gb-clip">
        <path d="M0 0v30h60V0z" />
      </clipPath>
      <clipPath id="flag-gb-diag">
        <path d="M30 15h30v15zv15H0zH0V0zV0h30z" />
      </clipPath>
      <g clipPath="url(#flag-gb-clip)">
        <path d="M0 0v30h60V0z" fill="#012169" />
        <path d="M0 0l60 30m0-30L0 30" stroke="#fff" strokeWidth="6" />
        <path
          d="M0 0l60 30m0-30L0 30"
          clipPath="url(#flag-gb-diag)"
          stroke="#C8102E"
          strokeWidth="4"
        />
        <path d="M30 0v30M0 15h60" stroke="#fff" strokeWidth="10" />
        <path d="M30 0v30M0 15h60" stroke="#C8102E" strokeWidth="6" />
      </g>
    </>
  ),
  fr: (
    <>
      <path fill="#002654" d="M0 0h15v30H0z" />
      <path fill="#fff" d="M15 0h15v30H15z" />
      <path fill="#CE1126" d="M30 0h15v30H30z" />
    </>
  ),
  es: (
    <>
      <path fill="#AA151B" d="M0 0h45v30H0z" />
      <path fill="#F1BF00" d="M0 7.5h45v15H0z" />
    </>
  ),
  de: (
    <>
      <path fill="#000" d="M0 0h45v10H0z" />
      <path fill="#DD0000" d="M0 10h45v10H0z" />
      <path fill="#FFCE00" d="M0 20h45v10H0z" />
    </>
  ),
  it: (
    <>
      <path fill="#009246" d="M0 0h15v30H0z" />
      <path fill="#fff" d="M15 0h15v30H15z" />
      <path fill="#CE2B37" d="M30 0h15v30H30z" />
    </>
  ),
}

export function Flag({
  locale,
  className,
}: {
  locale: Locale
  className?: string
}) {
  // The span holds the 3:2 size: menus and buttons force any bare svg
  // child to a 16px square, and "size-full" opts the svg out of that.
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block shrink-0 overflow-hidden", className)}
    >
      {/* The UK flag is 2:1, so it is cropped to 3:2 like flag icon sets do. */}
      <svg
        viewBox={locale === "en" ? "0 0 60 30" : "0 0 45 30"}
        preserveAspectRatio="xMidYMid slice"
        className="size-full"
      >
        {FLAGS[locale]}
      </svg>
    </span>
  )
}
