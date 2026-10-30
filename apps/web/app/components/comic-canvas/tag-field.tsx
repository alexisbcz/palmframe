import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon } from "@hugeicons/core-free-icons"

import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"

import { useLocale, useT } from "@/i18n/core"

import { addTag, normalizeTag } from "./anima-tags"
import {
  lookup,
  promptName,
  searchTags,
  useTagDb,
  type TagCategory,
} from "./tag-db"
import { messages } from "./tag-field.messages"

// Danbooru's own category colours, so tags read the same as on the site.
const CATEGORY_CHIP: Record<TagCategory, string> = {
  general: "bg-muted",
  artist: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  meta: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
}
const CATEGORY_DOT: Record<TagCategory, string> = {
  general: "bg-sky-500",
  artist: "bg-rose-500",
  meta: "bg-amber-500",
}

let fieldCount = 0

// Tags as chips, with type-ahead over Danbooru's 21k most used tags.
// Enter, Tab or a comma adds the highlighted tag, or the text as typed.
export function TagField({
  tags,
  onChange,
  placeholder,
  autoFocus,
}: {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  autoFocus?: boolean
}) {
  const db = useTagDb()
  const t = useT(messages)
  const { locale } = useLocale()
  const compact = React.useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        notation: "compact",
        maximumFractionDigits: 1,
      }),
    [locale]
  )
  const [query, setQuery] = React.useState("")
  const [active, setActive] = React.useState(0)
  const [focused, setFocused] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [listId] = React.useState(() => `tag-field-${++fieldCount}`)
  const suggestions = React.useMemo(
    () => (db ? searchTags(db, query, tags) : []),
    [db, query, tags]
  )
  const open = focused && !!query.trim()

  const commit = (raw?: string) => {
    const picked = suggestions[active]
    const text = raw ?? (picked ? promptName(picked.tag) : query)
    const next = text
      .split(",")
      .map(normalizeTag)
      .filter(Boolean)
      // An alias resolves to the tag Danbooru (and so Anima) actually uses.
      .map((tag) => {
        const known = db?.byAlias.get(tag)
        return known && !lookup(db, tag) ? promptName(known) : tag
      })
      .reduce(addTag, tags)
    if (next !== tags) onChange(next)
    setQuery("")
    setActive(0)
    inputRef.current?.focus()
  }

  return (
    <div className="relative">
      <div
        className="flex min-h-9 flex-wrap items-center gap-1 rounded-lg border border-input p-1 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag) => {
          const info = lookup(db, tag)
          const unknown = db && !info && !tag.startsWith("(")
          return (
            <span
              key={tag}
              title={
                info
                  ? t("info", {
                      category: t(`category.${info.category}`),
                      count: info.count,
                      posts: info.count.toLocaleString(locale),
                    })
                  : unknown
                    ? t("unknown")
                    : undefined
              }
              className={cn(
                "inline-flex h-6 items-center gap-0.5 rounded-md ps-2 pe-0.5 text-xs",
                CATEGORY_CHIP[info?.category ?? "general"],
                unknown &&
                  "border border-dashed border-foreground/30 bg-transparent"
              )}
            >
              {tag}
              <button
                type="button"
                aria-label={t("remove", { tag })}
                className="relative inline-flex size-5 cursor-pointer items-center justify-center rounded-sm text-muted-foreground outline-none after:absolute after:-inset-2 hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring pointer-fine:after:hidden"
                onClick={(e) => {
                  e.stopPropagation()
                  onChange(tags.filter((other) => other !== tag))
                }}
              >
                <HugeiconsIcon
                  icon={Cancel01Icon}
                  strokeWidth={2}
                  className="size-3"
                />
              </button>
            </span>
          )
        })}
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          aria-label={t("addTag")}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={
            open && suggestions[active] ? `${listId}-${active}` : undefined
          }
          className="h-6 min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
          placeholder={
            tags.length
              ? t("addTagPlaceholder")
              : (placeholder ?? t("placeholder"))
          }
          value={query}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            const v = e.target.value
            if (v.endsWith(",")) return commit(v.slice(0, -1))
            setQuery(v)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) return
            if ((e.key === "Enter" || e.key === "Tab") && query.trim()) {
              e.preventDefault()
              commit()
            } else if (e.key === "ArrowDown" && suggestions.length) {
              e.preventDefault()
              setActive((a) => (a + 1) % suggestions.length)
            } else if (e.key === "ArrowUp" && suggestions.length) {
              e.preventDefault()
              setActive(
                (a) => (a - 1 + suggestions.length) % suggestions.length
              )
            } else if (e.key === "Escape" && query) {
              e.stopPropagation()
              setQuery("")
            } else if (e.key === "Backspace" && !query && tags.length) {
              onChange(tags.slice(0, -1))
            }
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text")
            if (!text.includes(",")) return
            e.preventDefault()
            commit(text)
          }}
        />
      </div>

      {open && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10">
          {!db ? (
            <p className="flex items-center gap-2 p-2.5 text-xs text-muted-foreground">
              <Spinner className="size-3.5" />
              {t("loading")}
            </p>
          ) : (
            <>
              <ul id={listId} role="listbox" aria-label={t("list")}>
                {suggestions.map((s, i) => (
                  <li
                    key={s.tag.name}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm",
                      i === active && "bg-accent text-accent-foreground"
                    )}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => commit(promptName(s.tag))}
                  >
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        CATEGORY_DOT[s.tag.category]
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {promptName(s.tag)}
                      {s.via && (
                        <span className="text-muted-foreground">
                          {" "}
                          ← {s.via}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {compact.format(s.tag.count)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="border-t px-2.5 py-1.5 text-[11px] text-muted-foreground">
                {suggestions.length
                  ? t("keys")
                  : t("noMatch", { tag: normalizeTag(query) })}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
