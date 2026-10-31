import * as React from "react"
import { Link, useRevalidator } from "react-router"
import { cn } from "cn"

import { buttonVariants } from "@workspace/ui/components/button"
import { Switch } from "@workspace/ui/components/switch"

import { useT } from "@/i18n/core"
import type { Viewer } from "@/lib/database"
import { messages } from "@/routes/machines.messages"

export function LabsSection({
  viewer,
  onClose,
}: {
  viewer: Viewer
  onClose: () => void
}) {
  const t = useT(messages)
  const revalidator = useRevalidator()
  const [busy, setBusy] = React.useState(false)
  const [failed, setFailed] = React.useState(false)

  const toggle = async (on: boolean) => {
    setBusy(true)
    setFailed(false)
    try {
      const res = await fetch("/api/machines", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intent: "labs", on }),
      })
      if (!res.ok) throw new Error("failed")
      await revalidator.revalidate()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-6">
        <div>
          <p id="labs-machines" className="text-sm font-medium">
            {t("labs.machines")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("labs.machinesHint")}
          </p>
        </div>
        <Switch
          aria-labelledby="labs-machines"
          isSelected={viewer.labs.machines}
          isDisabled={busy}
          onChange={toggle}
          className="mt-0.5"
        />
      </div>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {t("errors.generic")}
        </p>
      )}
      {viewer.labs.machines && (
        <Link
          to="/studio"
          onClick={onClose}
          className={cn(buttonVariants({ variant: "outline" }), "self-start")}
        >
          {t("labs.open")}
        </Link>
      )}
    </div>
  )
}
