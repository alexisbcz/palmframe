import * as React from "react"
import { Link, useRevalidator } from "react-router"
import { cn } from "cn"

import { buttonVariants } from "@workspace/ui/components/button"
import { Switch } from "@workspace/ui/components/switch"

import { messages as toolMessages } from "@/components/tools/tools.messages"
import { useT } from "@/i18n/core"
import type { Viewer } from "@/lib/database"
import { TOOL_IDS, toolPath } from "@/lib/tools/catalog"
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
  const tt = useT(toolMessages)
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
    {
      id: "desk",
      name: t("labs.desk"),
      hint: t("labs.deskHint"),
      to: "/desk",
      open: t("labs.openDesk"),
    },
    {
      id: "sites",
      name: t("labs.sites"),
      hint: t("labs.sitesHint"),
      to: "/sites",
      open: t("labs.openSites"),
    },
    {
      id: "dub",
      name: t("labs.dub"),
      hint: t("labs.dubHint"),
      to: "/dub",
      open: t("labs.openDub"),
    },
  ] as const

  const tools = TOOL_IDS.map((id) => ({
    id,
    name: tt(`${id}.name`),
    hint: tt(`${id}.hint`),
    to: toolPath(id),
    open: tt("open"),
  }))

  const row = (f: (typeof features)[number] | (typeof tools)[number]) => (
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
          className={cn(buttonVariants({ variant: "outline" }), "self-start")}
        >
          {f.open}
        </Link>
      )}
    </div>
  )

  return (
    <div className="flex flex-col gap-6">
      {features.map(row)}
      <div className="flex flex-col gap-6 border-t pt-6">
        <div>
          <h3 className="text-sm font-medium">{tt("labsGroup")}</h3>
          <p className="text-sm text-muted-foreground">
            {tt("labsCredit")}{" "}
            <a
              href="https://desertant.com"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              {tt("credit")}
            </a>
          </p>
        </div>
        {tools.map(row)}
      </div>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {t("errors.generic")}
        </p>
      )}
    </div>
  )
}
