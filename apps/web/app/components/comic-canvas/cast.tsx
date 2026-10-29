import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  DiceIcon,
  PencilEdit02Icon,
  PlusSignIcon,
  SparklesIcon,
  Tick02Icon,
  UserIcon,
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
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import { cn } from "@workspace/ui/lib/utils"

import { useT } from "@/i18n/core"

import { messages } from "./cast.messages"
import { uid, type Character, type Look, type PanelLayer } from "./model"
import { roving } from "./roving"
import { TagField } from "./tag-field"
import type { ComicEditor } from "./use-editor"
import { renderPortrait, renderSheet } from "./use-generator"

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

  const toggle = (id: string) =>
    editor.update(panel.id, {
      cast: inShot.includes(id)
        ? inShot.filter((c) => c !== id)
        : [...inShot, id],
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
                className="block w-full cursor-pointer outline-none"
                onClick={() => toggle(c.id)}
              >
                <span
                  className={cn(
                    "relative block size-12 rounded-full ring-1 ring-foreground/10 transition group-hover/cast:ring-foreground/40",
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
                className="absolute -end-1 -top-1 flex size-5 cursor-pointer items-center justify-center rounded-full bg-background text-muted-foreground opacity-0 shadow-sm ring-1 ring-foreground/10 transition group-focus-within/cast:opacity-100 group-hover/cast:opacity-100 hover:text-foreground"
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
          className="w-12 shrink-0 cursor-pointer outline-none"
          data-roving
          onClick={() =>
            setEditing({ id: uid(), name: "", kind: "girl", tags: [] })
          }
        >
          <span className="flex size-12 items-center justify-center rounded-full border border-dashed text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground">
            <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
          </span>
          <span className="mt-1 block text-center text-[10px] text-muted-foreground">
            {cast.length ? t("new") : t("addCharacter")}
          </span>
        </button>
      </div>
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
      setDraft((d) => ({ ...d, sheet: src, seed }))
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

      <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-4">
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
              isDisabled={sheeting || !draft.tags.length}
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
                isDisabled={sheeting}
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
        <p className="text-[11px] text-muted-foreground">
          {t("dialog.sheetHelp")}
        </p>
        {sheetError && (
          <p className="text-xs text-destructive">
            {t("dialog.sheetFailed", { error: sheetError })}
          </p>
        )}
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
