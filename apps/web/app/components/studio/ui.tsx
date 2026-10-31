import * as React from "react"
import { useNavigate } from "react-router"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import { SparklesIcon } from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"

import { useLocale, useT } from "@/i18n/core"
import { COSTS } from "@/lib/credits"
import { type StudioError, useStudioCall } from "@/lib/studio/client"
import type { StudioSource } from "@/lib/studio/model"
import { messages } from "@/routes/studio.messages"

export function PageTitle({ title, intro }: { title: string; intro: string }) {
  return (
    <div className="max-w-2xl">
      <h1 className="studio-title text-4xl">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{intro}</p>
    </div>
  )
}

// The slanted badge, in pink for what stands out in a table.
export function Slant({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        "inline-flex -skew-x-[8deg] items-center rounded-[5px] bg-pink-600 px-1.5 py-px text-xs font-extrabold whitespace-nowrap text-white italic tabular-nums",
        className
      )}
    >
      {children}
    </span>
  )
}

export function Failure({ code }: { code: StudioError | null }) {
  const t = useT(messages)
  if (!code) return null
  return (
    <p
      role="alert"
      className="rounded-lg bg-pink-600/15 px-3 py-2 text-sm text-pink-300"
    >
      {t(`errors.${code}`)}
    </p>
  )
}

// Hot-linked: these come from platform CDNs, which refuse most referrers and
// expire, so a broken one falls back to the empty tile.
export function Thumb({
  src,
  className,
}: {
  src: string | null
  className?: string
}) {
  const [broken, setBroken] = React.useState(false)
  return (
    <span
      className={cn(
        "block shrink-0 overflow-hidden rounded-lg bg-muted",
        className
      )}
    >
      {src && !broken && (
        <img
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className="size-full object-cover"
        />
      )}
    </span>
  )
}

export function useCompact() {
  const { locale } = useLocale()
  return (n: number | null) =>
    n === null
      ? "—"
      : new Intl.NumberFormat(locale, {
          notation: "compact",
          maximumFractionDigits: 1,
        }).format(n)
}

// Every source ends here: a storyboard, then its page.
export function PlanButton({
  source,
  size = "sm",
  white,
}: {
  source: StudioSource
  size?: "sm" | "default"
  white?: boolean
}) {
  const t = useT(messages)
  const { locale } = useLocale()
  const navigate = useNavigate()
  const { busy, error, call } = useStudioCall()
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        size={size}
        variant={white ? "default" : "outline"}
        isDisabled={busy !== null}
        className={cn(white && "bg-white text-black hover:bg-white/90")}
        onPress={async () => {
          const r = await call<{ id: string }>("plan", {
            intent: "board",
            source,
            language: locale,
          })
          if (r) navigate(`/studio/boards/${r.id}`)
        }}
      >
        {busy ? (
          <Spinner />
        ) : (
          <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} />
        )}
        {busy
          ? t("board.planning")
          : t("board.plan", { cost: COSTS.studio_board })}
      </Button>
      <Failure code={error} />
    </span>
  )
}
