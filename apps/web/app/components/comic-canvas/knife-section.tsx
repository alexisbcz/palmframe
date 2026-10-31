import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  LayoutTwoColumnIcon,
  LayoutTwoRowIcon,
} from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"

import { useT } from "@/i18n/core"

import { Section, SliderInput } from "./controls"
import { loadImage } from "./edit-tools"
import { knifeLayer, knifeRefusal, type KnifeAxis } from "./knife"
import type { PanelLayer } from "./model"
import { messages } from "./panel-splitter.messages"
import type { ComicEditor } from "./use-editor"

// Cuts the selected panel in two where it stands, art and all.
export function KnifeSection({
  panel,
  editor,
}: {
  panel: PanelLayer
  editor: ComicEditor
}) {
  const t = useT(messages)
  const [at, setAt] = React.useState(50)
  const [problem, setProblem] = React.useState<string | null>(null)

  // Reasons that need no image. A stretched image is found on the press.
  const refusal = (axis: KnifeAxis) =>
    knifeRefusal(panel, { axis, at: at / 100 }, null)
  const blocked = refusal("x") === refusal("y") ? refusal("x") : null

  const cut = async (axis: KnifeAxis) => {
    setProblem(null)
    const plan = { axis, at: at / 100 }
    let image: { width: number; height: number } | null = null
    if (panel.src) {
      try {
        const img = await loadImage(panel.src)
        image = { width: img.naturalWidth, height: img.naturalHeight }
      } catch {
        setProblem(t("knife.unreadable"))
        return
      }
    }
    const refused = knifeRefusal(panel, plan, image)
    if (refused) {
      setProblem(t(`knife.refusals.${refused}`))
      return
    }
    editor.commit((d) => {
      const layers = knifeLayer(d, panel.id, plan, image)
      return layers ? { ...d, layers } : d
    })
  }

  const message = blocked ? t(`knife.refusals.${blocked}`) : problem

  return (
    <Section title={t("knife.title")}>
      <SliderInput
        label={t("knife.at")}
        suffix="%"
        min={10}
        max={90}
        value={at}
        onChange={(v) => {
          setAt(v)
          setProblem(null)
        }}
      />
      <div className="flex flex-col gap-2">
        <Button
          variant="outline"
          className="min-w-0 justify-start"
          isDisabled={!!refusal("x")}
          onPress={() => void cut("x")}
        >
          <HugeiconsIcon
            icon={LayoutTwoColumnIcon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          <span className="truncate">{t("knife.x")}</span>
        </Button>
        <Button
          variant="outline"
          className="min-w-0 justify-start"
          isDisabled={!!refusal("y")}
          onPress={() => void cut("y")}
        >
          <HugeiconsIcon
            icon={LayoutTwoRowIcon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          <span className="truncate">{t("knife.y")}</span>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {message ?? t("knife.hint")}
      </p>
    </Section>
  )
}
