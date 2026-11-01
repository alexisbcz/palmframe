import * as React from "react"
import { Link, useRevalidator } from "react-router"
import { cn } from "cn"

import { buttonVariants } from "@workspace/ui/components/button"
import { Switch } from "@workspace/ui/components/switch"

import { useT } from "@/i18n/core"
import type { Viewer } from "@/lib/database"
import { messages } from "@/routes/machines.messages"

type Feature = keyof Viewer["labs"]

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

  const toggle = async (feature: Feature, on: boolean) => {
    setBusy(true)
    setFailed(false)
    try {
      const res = await fetch("/api/machines", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intent: "labs", feature, on }),
      })
      if (!res.ok) throw new Error("failed")
      await revalidator.revalidate()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  const features = [
    {
      id: "machines",
      name: t("labs.machines"),
      hint: t("labs.machinesHint"),
      to: "/studio",
      open: t("labs.open"),
    },
    {
      id: "novels",
      name: t("labs.novels"),
      hint: t("labs.novelsHint"),
      to: "/novels",
      open: t("labs.openNovels"),
    },
  ] as const

  return (
    <div className="flex flex-col gap-6">
      {features.map((f) => (
        <div key={f.id} className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p id={`labs-${f.id}`} className="text-sm font-medium">
                {f.name}
              </p>
              <p className="text-sm text-muted-foreground">{f.hint}</p>
            </div>
            <Switch
              aria-labelledby={`labs-${f.id}`}
              isSelected={viewer.labs[f.id]}
              isDisabled={busy}
              onChange={(on) => void toggle(f.id, on)}
              className="mt-0.5"
            />
          </div>
          {viewer.labs[f.id] && (
            <Link
              to={f.to}
              onClick={onClose}
              className={cn(
                buttonVariants({ variant: "outline" }),
                "self-start"
              )}
            >
              {f.open}
            </Link>
          )}
        </div>
      ))}
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {t("errors.generic")}
        </p>
      )}
    </div>
  )
}
