import * as React from "react"
import { useNavigate } from "react-router"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import { FavouriteIcon } from "@hugeicons/core-free-icons"

import { useViewer } from "@/components/account/account-menu"
import { useT } from "@/i18n/core"

import { messages } from "./catalog.messages"
import { catalogRequest } from "./client"
import type { Asset } from "./model"

// Saved at once, and put back if the server says otherwise.
export function SaveButton({
  asset,
  className,
}: {
  asset: Pick<Asset, "id" | "name" | "saved">
  className?: string
}) {
  const t = useT(messages)
  const viewer = useViewer()
  const navigate = useNavigate()
  const [saved, setSaved] = React.useState(!!asset.saved)
  React.useEffect(() => setSaved(!!asset.saved), [asset.saved])

  const toggle = () => {
    if (!viewer) return navigate(`/login?next=/catalog/${asset.id}`)
    const next = !saved
    setSaved(next)
    catalogRequest({ intent: "save", id: asset.id, saved: next }).catch(() =>
      setSaved(!next)
    )
  }

  return (
    <button
      type="button"
      data-saved={saved}
      aria-pressed={saved}
      aria-label={t(saved ? "card.unsave" : "card.save", { name: asset.name })}
      className={cn(
        "flex size-8 cursor-pointer items-center justify-center rounded-lg bg-black/55 text-white backdrop-blur-sm transition-[color,opacity,scale] outline-none hover:bg-black/75 focus-visible:ring-3 focus-visible:ring-ring/60 active:scale-90 motion-reduce:active:scale-100",
        className
      )}
      onClick={toggle}
    >
      <HugeiconsIcon
        icon={FavouriteIcon}
        strokeWidth={2}
        className={cn("size-4", saved && "fill-rose-500 text-rose-500")}
      />
    </button>
  )
}
