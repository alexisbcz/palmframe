import * as React from "react"
import { useNavigate } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowDown01Icon, PlusSignIcon } from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Spinner } from "@workspace/ui/components/spinner"

import { useViewer } from "@/components/account/account-menu"
import { useT } from "@/i18n/core"

import { messages } from "./catalog.messages"
import { catalogRequest, editorLink } from "./client"

type Recent = { id: string; title: string; cover: string | null }

// The way from the catalog into a carousel. Signed out, the editor keeps the
// carousel in this browser, so there's only one place to go.
export function UseMenu({ ids, label }: { ids: string[]; label: string }) {
  const t = useT(messages)
  const viewer = useViewer()
  const navigate = useNavigate()
  const [recent, setRecent] = React.useState<Recent[]>([])
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!viewer) return
    fetch("/api/catalog?recent=1")
      .then((r) => r.json())
      .then((json) => setRecent(json.projects ?? []))
      .catch(() => {})
  }, [viewer])

  const start = async () => {
    setBusy(true)
    setError(null)
    try {
      const { id } = await catalogRequest({ intent: "carousel" })
      navigate(editorLink(id, ids))
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  if (!viewer)
    return (
      <Button
        className="w-full"
        onPress={() => navigate(editorLink(null, ids))}
      >
        {label}
      </Button>
    )

  return (
    <div className="flex flex-col gap-1">
      <DropdownMenuTrigger>
        <Button className="w-full" isDisabled={busy}>
          {busy && <Spinner data-icon="inline-start" />}
          {label}
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            strokeWidth={2}
            data-icon="inline-end"
          />
        </Button>
        <DropdownMenu
          className="w-(--trigger-width)"
          onAction={(key) =>
            key === "new"
              ? void start()
              : navigate(editorLink(String(key), ids))
          }
        >
          <DropdownMenuItem id="new">
            <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
            {t("use.new")}
          </DropdownMenuItem>
          {recent.length > 0 && <DropdownMenuSeparator />}
          {recent.map((p) => (
            <DropdownMenuItem key={p.id} id={p.id} textValue={p.title}>
              {p.cover ? (
                <img
                  src={p.cover}
                  alt=""
                  className="size-5 rounded-sm object-cover ring-1 ring-foreground/10"
                />
              ) : (
                <span className="size-5 rounded-sm bg-muted" />
              )}
              <span className="truncate">{p.title || t("use.untitled")}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenu>
      </DropdownMenuTrigger>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
