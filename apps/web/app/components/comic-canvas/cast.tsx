import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Delete02Icon,
  DiceIcon,
  PencilEdit02Icon,
  PlusSignIcon,
  SparklesIcon,
  Tick02Icon,
  UserIcon,
} from "@hugeicons/core-free-icons"

import { Badge } from "@workspace/ui/components/badge"
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
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import { cn } from "@workspace/ui/lib/utils"

import { COSTS } from "@/lib/credits"
import { useT } from "@/i18n/core"

import { messages } from "./cast.messages"
import {
  sheetReady,
  uid,
  type Character,
  type Look,
  type Outfit,
  type PanelLayer,
} from "./model"
import { roving } from "./roving"
import { TagField } from "./tag-field"
import type { ComicEditor } from "./use-editor"
import { renderOutfit, renderPortrait, renderSheet } from "./use-generator"
import { RefSummary } from "./world"

export function Avatar({
  character,
  className,
}: {
  character: Pick<Character, "name" | "portrait">
  className?: string
}) {
  return (
    <span
      className={cn(
        "flex items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-medium text-muted-foreground",
        className
      )}
    >
      {character.portrait ? (
        <img
          src={character.portrait}
          alt=""
          className="size-full scale-125 object-cover object-top"
        />
      ) : character.name.trim() ? (
        character.name.trim().slice(0, 2)
      ) : (
        <HugeiconsIcon icon={UserIcon} strokeWidth={2} className="size-4" />
      )}
    </span>
  )
}

// Who is in this panel. Click a face to cast them, the pencil to edit them.
export function CastRow({
  panel,
  editor,
}: {
  panel: PanelLayer
  editor: ComicEditor
}) {
  const cast = editor.project.cast ?? []
  const [editing, setEditing] = React.useState<Character | null>(null)
  const inShot = panel.cast ?? []
  const t = useT(messages)

  const wear = (id: string, outfit?: string) => {
    const { [id]: _, ...rest } = panel.outfits ?? {}
    return outfit ? { ...rest, [id]: outfit } : rest
  }

  const toggle = (id: string) =>
    editor.update(panel.id, {
      cast: inShot.includes(id)
        ? inShot.filter((c) => c !== id)
        : [...inShot, id],
      outfits: wear(id),
    })

  return (
    <section className="flex flex-col gap-1.5" aria-label={t("title")}>
      <div className="flex items-baseline gap-2">
        <h4 className="text-xs font-medium text-muted-foreground">
          {t("title")}
        </h4>
        <span className="min-w-0 truncate text-xs">
          {cast
            .filter((c) => inShot.includes(c.id))
            .map((c) => c.name)
            .join(", ")}
        </span>
      </div>
      <div
        data-roving-group
        onKeyDown={roving({ axis: "x" })}
        className="-mx-3 flex [scrollbar-width:none] gap-2 overflow-x-auto [mask-image:linear-gradient(to_right,black_85%,transparent)] px-3 pt-0.5 pb-1"
      >
        {cast.map((c) => {
          const on = inShot.includes(c.id)
          return (
            <div key={c.id} className="group/cast relative w-12 shrink-0">
              <button
                type="button"
                data-roving
                aria-pressed={on}
                aria-label={t(on ? "remove" : "add", { name: c.name })}
                title={c.tags.join(", ")}
                className="group/pick block w-full cursor-pointer outline-none"
                onClick={() => toggle(c.id)}
              >
                <span
                  className={cn(
                    "relative block size-12 rounded-full ring-1 ring-foreground/10 transition group-hover/cast:ring-foreground/40 group-focus-visible/pick:ring-3 group-focus-visible/pick:ring-ring/50",
                    on &&
                      "ring-2 ring-amber-500 group-hover/cast:ring-amber-500"
                  )}
                >
                  <Avatar character={c} className="size-full" />
                  {on && (
                    <span className="absolute -end-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full bg-amber-500 text-amber-950 ring-2 ring-background">
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
                  {c.name}
                </span>
              </button>
              <button
                type="button"
                aria-label={t("edit", { name: c.name })}
                className="absolute -end-1 -top-1 flex size-5 cursor-pointer items-center justify-center rounded-full bg-background text-muted-foreground opacity-0 shadow-sm ring-1 ring-foreground/10 transition group-focus-within/cast:opacity-100 group-hover/cast:opacity-100 hover:text-foreground pointer-coarse:opacity-100"
                onClick={() => setEditing(c)}
              >
                <HugeiconsIcon
                  icon={PencilEdit02Icon}
                  strokeWidth={2}
                  className="size-3"
                />
              </button>
            </div>
          )
        })}
        <button
          type="button"
          className="group/pick w-12 shrink-0 cursor-pointer outline-none"
          data-roving
          onClick={() =>
            setEditing({ id: uid(), name: "", kind: "girl", tags: [] })
          }
        >
          <span className="flex size-12 items-center justify-center rounded-full border border-dashed text-muted-foreground transition-colors group-focus-visible/pick:border-ring group-focus-visible/pick:ring-3 group-focus-visible/pick:ring-ring/50 hover:border-foreground/40 hover:text-foreground">
            <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
          </span>
          <span className="mt-1 block text-center text-[10px] text-muted-foreground">
            {cast.length ? t("new") : t("addCharacter")}
          </span>
        </button>
      </div>
      {cast
        .filter((c) => inShot.includes(c.id) && c.outfits?.length)
        .map((c) => (
          <OutfitPick
            key={c.id}
            character={c}
            worn={panel.outfits?.[c.id]}
            onPick={(id) =>
              editor.update(panel.id, { outfits: wear(c.id, id) })
            }
          />
        ))}
      <RefSummary panel={panel} project={editor.project} />
      {editing && (
        <CharacterDialog
          character={editing}
          look={editor.project.look}
          isNew={!cast.some((c) => c.id === editing.id)}
          onClose={() => setEditing(null)}
          onSave={(c, isNew) => {
            editor.saveCharacter(c)
            // A character made from a panel goes straight into it.
            if (isNew && !inShot.includes(c.id))
              editor.update(panel.id, { cast: [...inShot, c.id] })
            setEditing(null)
          }}
          onDelete={(id) => {
            editor.removeCharacter(id)
            setEditing(null)
          }}
        />
      )}
    </section>
  )
}

// What one cast member wears on this panel.
function OutfitPick({
  character,
  worn,
  onPick,
}: {
  character: Character
  worn?: string
  onPick: (outfit?: string) => void
}) {
  const t = useT(messages)
  const current = character.outfits?.some((o) => o.id === worn) ? worn : null
  const chip = (id: string | null, label: string, image?: string) => (
    <button
      key={id ?? "own"}
      type="button"
      data-roving
      aria-pressed={current === id}
      onClick={() => onPick(id ?? undefined)}
      className={cn(
        "flex h-7 max-w-full cursor-pointer items-center gap-1 rounded-md px-1.5 text-[11px] ring-1 ring-foreground/10 transition outline-none hover:ring-foreground/40 focus-visible:ring-3 focus-visible:ring-ring/50",
        current === id && "font-medium ring-2 ring-amber-500"
      )}
    >
      {image && (
        <img src={image} alt="" className="size-5 rounded object-cover" />
      )}
      <span className="truncate">{label}</span>
    </button>
  )
  return (
    <div
      role="group"
      aria-label={t("outfitOf", { name: character.name })}
      data-roving-group
      onKeyDown={roving({ axis: "x" })}
      className="flex flex-col gap-1"
    >
      <span className="truncate text-[11px] text-muted-foreground">
        {t("outfitOf", { name: character.name })}
      </span>
      <div className="flex flex-wrap gap-1">
        {chip(null, t("ownClothes"))}
        {character.outfits?.map((o) => chip(o.id, o.name, o.sheet))}
      </div>
    </div>
  )
}

const KINDS = [
  { id: "girl", label: "dialog.kindGirl" },
  { id: "boy", label: "dialog.kindBoy" },
  { id: "other", label: "dialog.kindOther" },
] as const satisfies { id: Character["kind"]; label: string }[]

function CharacterDialog({
  character,
  look,
  isNew,
  onClose,
  onSave,
  onDelete,
}: {
  character: Character
  look?: Look
  isNew: boolean
  onClose: () => void
  onSave: (c: Character, isNew: boolean) => void
  onDelete: (id: string) => void
}) {
  const [draft, setDraft] = React.useState(character)
  const [rendering, setRendering] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [sheeting, setSheeting] = React.useState(false)
  const [sheetError, setSheetError] = React.useState<string | null>(null)
  const valid = !!draft.name.trim()
  const t = useT(messages)
  const locked = draft.status === "locked"
  const setStatus = (status: Character["status"]) =>
    setDraft((d) => ({ ...d, status }))
  const setOutfits = (fn: (outfits: Outfit[]) => Outfit[]) =>
    setDraft((d) => ({ ...d, outfits: fn(d.outfits ?? []) }))

  const portrait = async (newSeed: boolean) => {
    const seed =
      newSeed || draft.seed === undefined
        ? Math.floor(Math.random() * 2 ** 32)
        : draft.seed
    setRendering(true)
    setError(null)
    try {
      const src = await renderPortrait(draft, seed, look)
      setDraft((d) => ({ ...d, portrait: src, seed }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRendering(false)
    }
  }

  // The sheet keeps the portrait's seed, so both show the same person.
  const sheet = async (newSeed: boolean) => {
    const seed =
      newSeed || draft.seed === undefined
        ? Math.floor(Math.random() * 2 ** 32)
        : draft.seed
    setSheeting(true)
    setSheetError(null)
    try {
      const src = await renderSheet(draft, seed, look)
      // A new sheet starts over: it needs approving, and outfits drawn from
      // the old one would bring the old face back.
      setDraft((d) => ({
        ...d,
        sheet: src,
        seed,
        status: "draft",
        outfits: d.outfits?.map(({ sheet: _, ...o }) => o),
      }))
    } catch (e) {
      setSheetError(e instanceof Error ? e.message : String(e))
    } finally {
      setSheeting(false)
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
            ? t("dialog.newTitle")
            : t("dialog.editTitle", { name: character.name })}
        </DialogTitle>
        <DialogDescription>{t("dialog.description")}</DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-4">
        <div className="flex flex-col gap-2">
          <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/10">
            {draft.portrait ? (
              <img
                src={draft.portrait}
                alt={
                  draft.name.trim()
                    ? t("dialog.portraitOf", { name: draft.name })
                    : t("dialog.portraitUnnamed")
                }
                className="size-full object-cover"
              />
            ) : (
              <span className="flex size-full items-center justify-center p-3 text-center text-xs text-muted-foreground">
                {t("dialog.noPortrait")}
              </span>
            )}
            {rendering && (
              <span className="absolute inset-0 flex items-center justify-center bg-background/60">
                <Spinner />
              </span>
            )}
          </div>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              isDisabled={rendering || !draft.tags.length}
              onPress={() => portrait(false)}
            >
              <HugeiconsIcon
                icon={SparklesIcon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              {draft.portrait ? t("dialog.redraw") : t("dialog.portrait")}
            </Button>
            {draft.portrait && (
              <Button
                size="icon-sm"
                variant="outline"
                aria-label={t("dialog.newSeed")}
                isDisabled={rendering}
                onPress={() => portrait(true)}
              >
                <HugeiconsIcon icon={DiceIcon} strokeWidth={2} />
              </Button>
            )}
          </div>
          {error && (
            <p className="text-xs text-destructive">
              {t("dialog.portraitFailed", { error })}
            </p>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {t("dialog.name")}
            </span>
            <Input
              autoFocus={isNew}
              placeholder="Maya"
              value={draft.name}
              onChange={(e) =>
                setDraft((d) => ({ ...d, name: e.target.value }))
              }
            />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {t("dialog.countsAs")}
            </span>
            <ToggleGroup
              size="sm"
              variant="outline"
              spacing={0}
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={[draft.kind]}
              onSelectionChange={(keys) => {
                const kind = [...keys][0] as Character["kind"] | undefined
                if (kind) setDraft((d) => ({ ...d, kind }))
              }}
            >
              {KINDS.map((k) => (
                <ToggleGroupItem key={k.id} id={k.id}>
                  {t(k.label)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {t("dialog.look")}
            </span>
            <TagField
              tags={draft.tags}
              onChange={(tags) => setDraft((d) => ({ ...d, tags }))}
              placeholder="short hair, black hair, round eyewear, hoodie…"
            />
            <p className="text-[11px] text-muted-foreground">
              {t("dialog.lookHelp")}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {t("dialog.sheet")}
          </span>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              isDisabled={sheeting || locked || !draft.tags.length}
              onPress={() => sheet(false)}
            >
              <HugeiconsIcon
                icon={SparklesIcon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              {draft.sheet ? t("dialog.redrawSheet") : t("dialog.drawSheet")}
            </Button>
            {draft.sheet && (
              <Button
                size="icon-sm"
                variant="outline"
                aria-label={t("dialog.sheetNewSeed")}
                isDisabled={sheeting || locked}
                onPress={() => sheet(true)}
              >
                <HugeiconsIcon icon={DiceIcon} strokeWidth={2} />
              </Button>
            )}
          </div>
        </div>
        <div className="relative aspect-[3/2] overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/10">
          {draft.sheet ? (
            <img
              src={draft.sheet}
              alt={t("dialog.sheetOf", {
                name: draft.name.trim() || t("dialog.portraitUnnamed"),
              })}
              className="size-full object-contain"
            />
          ) : (
            <span className="flex size-full items-center justify-center p-4 text-center text-xs text-balance text-muted-foreground">
              {t("dialog.noSheet")}
            </span>
          )}
          {sheeting && (
            <span className="absolute inset-0 flex items-center justify-center bg-background/60">
              <Spinner />
            </span>
          )}
        </div>
        {draft.status && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={draft.status === "draft" ? "outline" : "secondary"}>
              {t(`dialog.status.${draft.status}`)}
            </Badge>
            <span className="me-auto" />
            {draft.status === "draft" && (
              <Button size="sm" onPress={() => setStatus("approved")}>
                {t("dialog.approve")}
              </Button>
            )}
            {draft.status === "approved" && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => setStatus("draft")}
                >
                  {t("dialog.backToDraft")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onPress={() => setStatus("locked")}
                >
                  {t("dialog.lock")}
                </Button>
              </>
            )}
            {locked && (
              <Button
                size="sm"
                variant="outline"
                onPress={() => setStatus("approved")}
              >
                {t("dialog.unlock")}
              </Button>
            )}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground">
          {t(
            draft.status === "draft"
              ? "dialog.draftHelp"
              : locked
                ? "dialog.lockedHelp"
                : "dialog.sheetHelp"
          )}
          {!locked &&
            draft.outfits?.some((o) => o.sheet) &&
            ` ${t("dialog.redrawClears")}`}
        </p>
        {sheetError && (
          <p className="text-xs text-destructive">
            {t("dialog.sheetFailed", { error: sheetError })}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            {t("dialog.outfits")}
          </span>
          <Button
            size="sm"
            variant="outline"
            onPress={() =>
              setOutfits((o) => [...o, { id: uid(), name: "", tags: [] }])
            }
          >
            <HugeiconsIcon
              icon={PlusSignIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {t("dialog.addOutfit")}
          </Button>
        </div>
        {draft.outfits?.map((o) => (
          <OutfitEditor
            key={o.id}
            outfit={o}
            character={draft}
            look={look}
            onChange={(patch) =>
              setOutfits((all) =>
                all.map((x) => (x.id === o.id ? { ...x, ...patch } : x))
              )
            }
            onDelete={() =>
              setOutfits((all) => all.filter((x) => x.id !== o.id))
            }
          />
        ))}
        <p className="text-[11px] text-muted-foreground">
          {t(
            sheetReady(draft)
              ? "dialog.outfitsHelp"
              : "dialog.outfitsNeedApproval"
          )}
        </p>
      </div>

      <DialogFooter>
        {!isNew && (
          <Button
            variant="ghost"
            className="text-destructive sm:me-auto"
            onPress={() => onDelete(character.id)}
          >
            {t("dialog.delete")}
          </Button>
        )}
        <Button variant="outline" onPress={onClose}>
          {t("dialog.cancel")}
        </Button>
        <Button isDisabled={!valid} onPress={() => onSave(draft, isNew)}>
          {isNew ? t("dialog.addToCast") : t("dialog.save")}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

// One change of clothes. Drawing it needs an approved sheet to draw from.
function OutfitEditor({
  outfit,
  character,
  look,
  onChange,
  onDelete,
}: {
  outfit: Outfit
  character: Character
  look?: Look
  onChange: (patch: Partial<Outfit>) => void
  onDelete: () => void
}) {
  const [drawing, setDrawing] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const t = useT(messages)

  const draw = async () => {
    const seed = Math.floor(Math.random() * 2 ** 32)
    setDrawing(true)
    setError(null)
    try {
      const sheet = await renderOutfit(character, outfit, seed, look)
      onChange({ sheet, seed })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setDrawing(false)
    }
  }

  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-2 rounded-lg p-2 ring-1 ring-foreground/10">
      <div className="relative aspect-[3/2] overflow-hidden rounded bg-muted">
        {outfit.sheet ? (
          <img
            src={outfit.sheet}
            alt={t("dialog.outfitOf", {
              name: character.name.trim() || t("dialog.portraitUnnamed"),
              outfit: outfit.name,
            })}
            className="size-full object-contain"
          />
        ) : (
          <span className="flex size-full items-center justify-center p-1 text-center text-[10px] text-muted-foreground">
            {t("dialog.noOutfitImage")}
          </span>
        )}
        {drawing && (
          <span className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Spinner />
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex gap-1">
          <Input
            aria-label={t("dialog.outfitName")}
            placeholder={t("dialog.outfitName")}
            value={outfit.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t("dialog.deleteOutfit", { outfit: outfit.name })}
            onPress={onDelete}
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
          </Button>
        </div>
        <TagField
          tags={outfit.tags}
          onChange={(tags) => onChange({ tags })}
          placeholder="raincoat, yellow coat, rubber boots…"
        />
        <Button
          size="sm"
          variant="outline"
          className="self-start"
          isDisabled={
            drawing ||
            !sheetReady(character) ||
            (!outfit.name.trim() && !outfit.tags.length)
          }
          onPress={draw}
        >
          <HugeiconsIcon
            icon={SparklesIcon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          {t(outfit.sheet ? "dialog.redrawOutfit" : "dialog.drawOutfit", {
            credits: COSTS.panel_ref,
          })}
        </Button>
        {error && (
          <p className="text-xs text-destructive">
            {t("dialog.outfitFailed", { error })}
          </p>
        )}
      </div>
    </div>
  )
}
