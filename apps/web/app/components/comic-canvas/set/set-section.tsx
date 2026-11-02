import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { CubeIcon } from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"

import { useT } from "@/i18n/core"

import { Section } from "../controls"
import type { PanelLayer } from "../model"
import type { ComicEditor } from "../use-editor"

import type { SetCapture } from "./set-dialog"
import { messages } from "./set.messages"

// three.js is large, and most sessions never open a set.
const SetDialog = React.lazy(() => import("./set-dialog"))

export function SetSection({
  panel,
  editor,
}: {
  panel: PanelLayer
  editor: ComicEditor
}) {
  const t = useT(messages)
  const [open, setOpen] = React.useState(false)

  const use = ({ scene, src, guide, cast }: SetCapture) => {
    const merged = [...new Set([...(panel.cast ?? []), ...cast])]
    editor.update(panel.id, {
      set: scene,
      ...(src && {
        src,
        fit: "cover" as const,
        imageZoom: 100,
        panX: 0,
        panY: 0,
      }),
      ...(guide && { guide: { src: guide, strength: "strict" as const } }),
      ...(merged.length > 0 && { cast: merged }),
    })
    setOpen(false)
  }

  return (
    <Section title={t("title")}>
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
      <Button variant="outline" onPress={() => setOpen(true)}>
        <HugeiconsIcon
          icon={CubeIcon}
          strokeWidth={2}
          data-icon="inline-start"
        />
        {panel.set ? t("edit") : t("open")}
      </Button>
      {open && (
        <React.Suspense fallback={null}>
          <SetDialog
            panel={panel}
            project={editor.projectRef.current}
            editor={editor}
            onClose={() => setOpen(false)}
            onUse={use}
          />
        </React.Suspense>
      )}
    </Section>
  )
}
