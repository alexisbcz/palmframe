import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Location01Icon,
  PencilEdit02Icon,
  PlusSignIcon,
  SparklesIcon,
  Tick02Icon,
  Upload04Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"
import { Tooltip, TooltipTrigger } from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

import { COSTS } from "@/lib/credits"
import { useT } from "@/i18n/core"

import {
  MAX_REFS,
  sheetReady,
  uid,
  type ComicProject,
  type Look,
  type PanelLayer,
  type WorldItem,
} from "./model"
import { readImageFile } from "./render"
import { roving } from "./roving"
import { panelCost } from "./story"
import { TagField } from "./tag-field"
import type { ComicEditor } from "./use-editor"
import { panelMembers, panelRefs, renderWorldItem } from "./use-generator"
import { messages } from "./world.messages"

// What the panel's references add up to, and who they left out.
export function RefSummary({
  panel,
  project,
}: {
  panel: PanelLayer
  project: ComicProject
}) {
  const t = useT(messages)
  const { refs, dropped } = panelRefs(panel, project)
  const drafts = panelMembers(panel, project.cast).filter(
    (c) => c.sheet && !sheetReady(c)
  )
  return (
    <div className="flex flex-col gap-0.5 border-t pt-2 text-[11px] text-muted-foreground">
      <p className="tabular-nums">
        {refs.length
          ? t("summary.refs", {
              used: refs.length,
              max: MAX_REFS,
              credits: panelCost(panel, project),
              plain: COSTS.panel,
            })
          : t("summary.none", { credits: COSTS.panel })}
      </p>
      {dropped.length > 0 && (
        <p className="text-amber-700 dark:text-amber-400">
          {t("summary.dropped", {
            names: dropped.map((r) => (r.item ?? r.character).name).join(", "),
            max: MAX_REFS,
          })}
        </p>
      )}
      {drafts.length > 0 && (
        <p className="text-amber-700 dark:text-amber-400">
          {t("summary.drafts", {
            names: drafts.map((c) => c.name).join(", "),
          })}
        </p>
      )}
    </div>
  )
}

// What this panel's world would be with the item toggled. A panel happens in
// one place, so a new location replaces the old one.
function toggled(panel: PanelLayer, item: WorldItem, world: WorldItem[]) {
  const attached = panel.world ?? []
  if (attached.includes(item.id)) return attached.filter((id) => id !== item.id)
  if (item.kind === "prop") return [...attached, item.id]
  const places = world.filter((w) => w.kind === "location").map((w) => w.id)
  return [...attached.filter((id) => !places.includes(id)), item.id]
}

// The recurring places and objects in this panel. Click to attach, the
// pencil to edit; each one says what attaching it does to the price.
export function WorldRow({
  panel,
  editor,
}: {
  panel: PanelLayer
  editor: ComicEditor
}) {
  const { project } = editor
  const world = project.world ?? []
  const [editing, setEditing] = React.useState<WorldItem | null>(null)
  const attached = panel.world ?? []
  const t = useT(messages)

  const row = (kind: WorldItem["kind"]) => (
    <div className="flex flex-col gap-1">
      <h5 className="text-[11px] text-muted-foreground">
        {t(kind === "location" ? "location" : "props")}
      </h5>
      <div
        data-roving-group
        onKeyDown={roving({ axis: "x" })}
        className="-mx-3 flex [scrollbar-width:none] gap-2 overflow-x-auto [mask-image:linear-gradient(to_right,black_85%,transparent)] px-3 pt-0.5 pb-1"
      >
        {world
          .filter((w) => w.kind === kind)
          .map((item) => {
            const on = attached.includes(item.id)
            const next = {
              ...panel,
              world: toggled(panel, item, world),
            }
            const delta = panelCost(next, project) - panelCost(panel, project)
            const full =
              !on &&
              panelRefs(next, project).dropped.length >
                panelRefs(panel, project).dropped.length
            const credits = `${delta < 0 ? "−" : "+"}${Math.abs(delta)}`
            return (
              <div key={item.id} className="group/item relative w-16 shrink-0">
                <button
                  type="button"
                  data-roving
                  disabled={full}
                  aria-pressed={on}
                  aria-label={t(on ? "detach" : "attach", {
                    name: item.name,
                    credits,
                  })}
                  title={
                    full ? t("full", { max: MAX_REFS }) : item.tags.join(", ")
                  }
                  className="group/pick block w-full cursor-pointer outline-none disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => editor.update(panel.id, { world: next.world })}
                >
                  <span
                    className={cn(
                      "relative block aspect-square overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/10 transition group-hover/item:ring-foreground/40 group-focus-visible/pick:ring-3 group-focus-visible/pick:ring-ring/50",
                      on &&
                        "ring-2 ring-amber-500 group-hover/item:ring-amber-500"
                    )}
                  >
                    {item.image ? (
                      <img
                        src={item.image}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <span className="flex size-full items-center justify-center p-1 text-center text-[10px] text-muted-foreground">
                        {t("wordsOnly")}
                      </span>
                    )}
                    {on && (
                      <span className="absolute end-0.5 bottom-0.5 flex size-4 items-center justify-center rounded-full bg-amber-500 text-amber-950 ring-2 ring-background">
                        <HugeiconsIcon
                          icon={Tick02Icon}
                          strokeWidth={3}
                          className="size-2.5"
                        />
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "mt-1 block truncate text-center text-[10px] text-muted-foreground",
                      on && "font-medium text-foreground"
                    )}
                  >
                    {item.name}
                  </span>
                  <span className="block truncate text-center text-[10px] text-muted-foreground tabular-nums">
                    {t("effect", { credits })}
                  </span>
                </button>
                <TooltipTrigger>
                  <button
                    type="button"
                    aria-label={t("edit", { name: item.name })}
                    className="absolute -end-1 -top-1 flex size-5 cursor-pointer items-center justify-center rounded-full bg-background text-muted-foreground opacity-0 shadow-sm ring-1 ring-foreground/10 transition group-focus-within/item:opacity-100 group-hover/item:opacity-100 after:absolute after:-inset-2 hover:text-foreground pointer-coarse:opacity-100 pointer-fine:after:hidden"
                    onClick={() => setEditing(item)}
                  >
                    <HugeiconsIcon
                      icon={PencilEdit02Icon}
                      strokeWidth={2}
                      className="size-3"
                    />
                  </button>
                  <Tooltip>{t("edit", { name: item.name })}</Tooltip>
                </TooltipTrigger>
              </div>
            )
          })}
        <button
          type="button"
          data-roving
          className="group/pick w-16 shrink-0 cursor-pointer outline-none"
          onClick={() => setEditing({ id: uid(), name: "", kind, tags: [] })}
        >
          <span className="flex aspect-square items-center justify-center rounded-lg border border-dashed text-muted-foreground transition-colors group-focus-visible/pick:border-ring group-focus-visible/pick:ring-3 group-focus-visible/pick:ring-ring/50 hover:border-foreground/40 hover:text-foreground">
            <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
          </span>
          <span className="mt-1 block text-center text-[10px] text-muted-foreground">
            {t(kind === "location" ? "newLocation" : "newProp")}
          </span>
        </button>
      </div>
    </div>
  )

  return (
    <section className="flex flex-col gap-2" aria-label={t("title")}>
      <h4 className="text-xs font-medium text-muted-foreground">
        {t("title")}
      </h4>
      {row("location")}
      {row("prop")}
      <RefSummary panel={panel} project={project} />
      {editing && (
        <WorldItemDialog
          item={editing}
          look={project.look}
          isNew={!world.some((w) => w.id === editing.id)}
          onClose={() => setEditing(null)}
          onSave={(item, isNew) => {
            editor.saveWorldItem(item)
            // An item made from a panel goes straight into it.
            if (isNew)
              editor.update(panel.id, {
                world: toggled(panel, item, [...world, item]),
              })
            setEditing(null)
          }}
          onDelete={(id) => {
            editor.removeWorldItem(id)
            setEditing(null)
          }}
        />
      )}
    </section>
  )
}

function WorldItemDialog({
  item,
  look,
  isNew,
  onClose,
  onSave,
  onDelete,
}: {
  item: WorldItem
  look?: Look
  isNew: boolean
  onClose: () => void
  onSave: (item: WorldItem, isNew: boolean) => void
  onDelete: (id: string) => void
}) {
  const [draft, setDraft] = React.useState(item)
  const [rendering, setRendering] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const file = React.useRef<HTMLInputElement>(null)
  const location = draft.kind === "location"
  const t = useT(messages)

  const draw = async () => {
    const seed = Math.floor(Math.random() * 2 ** 32)
    setRendering(true)
    setError(null)
    try {
      const image = await renderWorldItem(draft, seed, look)
      setDraft((d) => ({ ...d, image, seed }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRendering(false)
    }
  }

  const upload = async (picked: File) => {
    setError(null)
    try {
      const { src } = await readImageFile(picked, 1536)
      setDraft(({ seed: _, ...d }) => ({ ...d, image: src }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Dialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      className="sm:max-w-lg"
    >
      <DialogHeader>
        <DialogTitle>
          {isNew
            ? t(location ? "dialog.newLocation" : "dialog.newProp")
            : t("edit", { name: item.name })}
        </DialogTitle>
        <DialogDescription>
          {t(location ? "dialog.locationHelp" : "dialog.propHelp")}
        </DialogDescription>
      </DialogHeader>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          {t("dialog.name")}
        </span>
        <Input
          autoFocus={isNew}
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        />
      </label>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          {t("dialog.description")}
        </span>
        <TagField
          tags={draft.tags}
          onChange={(tags) => setDraft((d) => ({ ...d, tags }))}
          placeholder={
            location
              ? "cafe, wooden tables, large windows…"
              : "red umbrella, broken handle…"
          }
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {t("dialog.image")}
          </span>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              isDisabled={rendering}
              onPress={() => file.current?.click()}
            >
              <HugeiconsIcon
                icon={Upload04Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              {t("dialog.upload")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              isDisabled={
                rendering || (!draft.name.trim() && !draft.tags.length)
              }
              onPress={draw}
            >
              <HugeiconsIcon
                icon={SparklesIcon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              {t(draft.image ? "dialog.redraw" : "dialog.draw", {
                credits: COSTS.sheet,
              })}
            </Button>
          </div>
          <input
            ref={file}
            type="file"
            accept="image/*"
            hidden
            aria-label={t("dialog.upload")}
            onChange={(e) => {
              const picked = e.target.files?.[0]
              e.target.value = ""
              if (picked) void upload(picked)
            }}
          />
        </div>
        <div className="relative aspect-[3/2] overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/10">
          {draft.image ? (
            <img
              src={draft.image}
              alt={t("dialog.imageOf", {
                name: draft.name.trim() || t("title"),
              })}
              className="size-full object-contain"
            />
          ) : (
            <span className="flex size-full flex-col items-center justify-center gap-1 p-4 text-center text-xs text-balance text-muted-foreground">
              <HugeiconsIcon icon={Location01Icon} strokeWidth={2} />
              {t("dialog.noImage", {
                plain: COSTS.panel,
                credits: COSTS.panel_ref,
              })}
            </span>
          )}
          {rendering && (
            <span className="absolute inset-0 flex items-center justify-center bg-background/60">
              <Spinner />
            </span>
          )}
        </div>
        {error && (
          <p className="text-xs text-destructive">
            {t("dialog.failed", { error })}
          </p>
        )}
      </div>

      <DialogFooter>
        {!isNew && (
          <Button
            variant="ghost"
            className="text-destructive sm:me-auto"
            onPress={() => onDelete(item.id)}
          >
            {t("dialog.delete")}
          </Button>
        )}
        <Button variant="outline" onPress={onClose}>
          {t("dialog.cancel")}
        </Button>
        <Button
          isDisabled={!draft.name.trim()}
          onPress={() => onSave(draft, isNew)}
        >
          {t(isNew ? "dialog.add" : "dialog.save")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
