import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Copy01Icon,
  DiceIcon,
  LockIcon,
  SquareUnlock02Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Toggle } from "@workspace/ui/components/toggle"
import { cn } from "@workspace/ui/lib/utils"

import { ModelLabel } from "@/components/model-label"
import { useLocale, useT } from "@/i18n/core"

import { TAG_GROUPS, VISUAL_GROUPS, addTag } from "./anima-tags"
import { NumberInput, Row } from "./controls"
import { messages } from "./generate-panel.messages"
import { messages as lookMessages } from "./look.messages"
import {
  DEFAULT_LOOK,
  type PaletteId,
  type PanelLayer,
  type StyleId,
} from "./model"
import type { ComicEditor } from "./use-editor"
import {
  DEFAULT_STEPS,
  PALETTES,
  STYLES,
  buildKleinPrompt,
  buildPrompt,
  lookOf,
  usesKlein,
  type Generator,
} from "./use-generator"
import { roving } from "./roving"

// Pieces of the generation UI that the composer opens in its popovers.

// The text-only groups, for tags that don't need a picture.
export function TagBrowser({
  tags,
  onChange,
}: {
  tags: string[]
  onChange: (tags: string[]) => void
}) {
  const t = useT(messages)
  return (
    <Accordion allowsMultipleExpanded>
      {TAG_GROUPS.filter((g) => !VISUAL_GROUPS.includes(g.id)).map((group) => {
        const picked = group.tags.filter((tag) => tags.includes(tag)).length
        return (
          <AccordionItem key={group.id} id={group.id}>
            <AccordionTrigger className="py-2 text-xs">
              <span className="flex items-center gap-1.5">
                {t(`groups.${group.id}`)}
                {picked > 0 && (
                  <span className="rounded-full bg-amber-500/15 px-1.5 text-[10px] leading-4 text-amber-700 tabular-nums dark:text-amber-300">
                    {picked}
                  </span>
                )}
                {group.single && (
                  <span className="text-[10px] font-normal text-muted-foreground">
                    {t("pickOne")}
                  </span>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent className="flex flex-wrap gap-1 pb-2">
              {group.tags.map((tag) => (
                <Toggle
                  key={tag}
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs font-normal data-selected:border-amber-500 data-selected:bg-amber-500/15 data-selected:text-amber-700 dark:data-selected:text-amber-300"
                  isSelected={tags.includes(tag)}
                  onChange={(on) =>
                    onChange(
                      on ? addTag(tags, tag) : tags.filter((x) => x !== tag)
                    )
                  }
                >
                  {tag}
                </Toggle>
              ))}
            </AccordionContent>
          </AccordionItem>
        )
      })}
    </Accordion>
  )
}

export function PromptPreview({
  prompt,
  negative,
}: {
  prompt: string
  negative: string
}) {
  const t = useT(messages)
  const [copied, setCopied] = React.useState(false)
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-muted/60 p-2.5 font-mono text-[11px] leading-relaxed break-words">
      <p>
        <span className="text-muted-foreground">+ </span>
        {prompt}
      </p>
      {negative && <p className="text-muted-foreground">− {negative}</p>}
      <Button
        variant="ghost"
        size="xs"
        className="self-end font-sans"
        onPress={async () => {
          await navigator.clipboard.writeText(
            `${prompt}\n\nNegative: ${negative}`
          )
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
      >
        <HugeiconsIcon
          icon={copied ? Tick02Icon : Copy01Icon}
          strokeWidth={2}
          data-icon="inline-start"
        />
        {copied ? t("copied") : t("copy")}
      </Button>
    </div>
  )
}

// Per-panel overrides and sampler settings, and the exact prompt sent.
export function AdvancedFields({
  panel,
  editor,
}: {
  panel: PanelLayer
  editor: ComicEditor
}) {
  const t = useT(messages)
  const tl = useT(lookMessages)
  const set = <K extends keyof PanelLayer>(key: K, value: PanelLayer[K]) =>
    editor.update(
      panel.id,
      { [key]: value } as Partial<PanelLayer>,
      `${panel.id}-${key}`
    )
  const look = lookOf(panel, editor.project.look)
  const carousel = editor.project.look ?? DEFAULT_LOOK
  const klein = usesKlein(panel, editor.project)
  const built = klein
    ? { prompt: buildKleinPrompt(panel, editor.project), negative: "" }
    : buildPrompt(panel, editor.project)

  return (
    <div className="flex flex-col gap-3">
      {look.style === "spot" && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline gap-2">
            <h4 className="text-xs font-medium text-muted-foreground">
              {tl("spotOn")}
            </h4>
            <span
              className="size-2.5 rounded-full"
              style={{
                background: PALETTES.find((p) => p.id === look.palette)?.swatch,
              }}
            />
          </div>
          <Input
            aria-label={tl("spotOn")}
            placeholder="hoodie, neon sign, eyes…"
            value={panel.spotOn ?? ""}
            onChange={(e) => set("spotOn", e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">{tl("spotHint")}</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Row label={tl("panelStyle")}>
          <NativeSelect
            size="sm"
            className="w-full"
            aria-label={tl("panelStyle")}
            value={panel.style ?? ""}
            onChange={(e) =>
              set("style", (e.target.value || undefined) as StyleId)
            }
          >
            <NativeSelectOption value="">
              {tl("sameAsCarousel", {
                name: tl(`styles.${carousel.style}`),
              })}
            </NativeSelectOption>
            {(Object.keys(STYLES) as StyleId[]).map((id) => (
              <NativeSelectOption key={id} value={id}>
                {tl(`styles.${id}`)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Row>
        {STYLES[look.style].palette && (
          <Row label={tl("panelPalette")}>
            <NativeSelect
              size="sm"
              className="w-full"
              aria-label={tl("panelPalette")}
              value={
                panel.palette === undefined ? "" : (panel.palette ?? "none")
              }
              onChange={(e) => {
                const v = e.target.value
                set(
                  "palette",
                  v === "" ? undefined : v === "none" ? null : (v as PaletteId)
                )
              }}
            >
              <NativeSelectOption value="">
                {tl("sameAsCarousel", {
                  name: carousel.palette
                    ? tl(`palettes.${carousel.palette}`)
                    : tl("auto"),
                })}
              </NativeSelectOption>
              <NativeSelectOption value="none">{tl("none")}</NativeSelectOption>
              {PALETTES.map((p) => (
                <NativeSelectOption key={p.id} value={p.id}>
                  {tl(`palettes.${p.id}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Row>
        )}
        <Row label={t("steps")}>
          <NumberInput
            aria-label={t("steps")}
            min={1}
            max={30}
            value={panel.steps ?? DEFAULT_STEPS}
            onChange={(v) => set("steps", v)}
          />
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {t("stepsHint")}
          </span>
        </Row>
        <Row label={t("seed")}>
          <NumberInput
            aria-label={t("seed")}
            min={0}
            max={2 ** 32 - 1}
            value={panel.seed ?? 0}
            onChange={(v) =>
              editor.update(
                panel.id,
                { seed: v, lockSeed: true },
                `${panel.id}-seed`
              )
            }
          />
          <Toggle
            variant="outline"
            aria-label={panel.lockSeed ? t("seedLocked") : t("seedPerTake")}
            isSelected={!!panel.lockSeed}
            onChange={(v) => set("lockSeed", v)}
          >
            <HugeiconsIcon
              icon={panel.lockSeed ? LockIcon : SquareUnlock02Icon}
              strokeWidth={2}
            />
          </Toggle>
          <Button
            variant="outline"
            size="icon"
            aria-label={t("randomSeed")}
            onPress={() =>
              editor.update(panel.id, {
                seed: Math.floor(Math.random() * 2 ** 32),
              })
            }
          >
            <HugeiconsIcon icon={DiceIcon} strokeWidth={2} />
          </Button>
        </Row>
        <Row label={t("avoid")}>
          <Input
            aria-label={t("avoid")}
            placeholder="hat, crowd, daylight…"
            value={panel.negative ?? ""}
            onChange={(e) => set("negative", e.target.value)}
          />
        </Row>
      </div>
      <div className="flex flex-col gap-1.5 pt-1">
        <span className="text-xs font-medium text-muted-foreground">
          {klein ? t("promptSentKlein") : t("promptSent")}
        </span>
        <PromptPreview {...built} />
      </div>
    </div>
  )
}

// What drew the panel's current image, when that's known.
export function DrawnWith({ panel }: { panel: PanelLayer }) {
  const t = useT(messages)
  if (!panel.src || !panel.model) return null
  return (
    <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <span className="shrink-0">{t("drawnWith")}</span>
      <ModelLabel model={panel.model} />
    </p>
  )
}

// This session's takes for the panel; click one to put it back.
export function TakesGrid({
  panel,
  editor,
  generator,
}: {
  panel: PanelLayer
  editor: ComicEditor
  generator: Generator
}) {
  const t = useT(messages)
  const { locale } = useLocale()
  const takes = generator.takes[panel.id] ?? []
  return (
    <>
      {takes.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {t("session")}
          </span>
          <div
            className="grid grid-cols-2 gap-1.5"
            data-roving-group
            onKeyDown={roving()}
          >
            {takes.map((take) => (
              <button
                key={take.src.slice(-64)}
                type="button"
                data-roving
                title={t("takeTitle", {
                  seed: take.seed,
                  seconds: (take.ms / 1000).toLocaleString(locale, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  }),
                })}
                className={cn(
                  "relative cursor-pointer overflow-hidden rounded-md ring-1 ring-foreground/10 outline-none hover:ring-foreground/40 focus-visible:ring-2 focus-visible:ring-ring",
                  panel.src === take.src &&
                    "ring-2 ring-amber-500 hover:ring-amber-500"
                )}
                style={{ aspectRatio: `${panel.width} / ${panel.height}` }}
                onClick={() =>
                  editor.update(panel.id, {
                    src: take.src,
                    seed: take.seed,
                    engine: take.engine,
                    model: take.model,
                  })
                }
              >
                <img
                  src={take.src}
                  alt={t("takeAlt", { seed: take.seed })}
                  className="size-full object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
