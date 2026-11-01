import * as React from "react"

import { useT } from "@/i18n/core"
import type { Element } from "@/lib/desk/fountain"
import type { Kind } from "@/lib/desk/model"
import { countWords } from "@/lib/desk/model"
import { hasDictionary, rhymesFor } from "@/lib/desk/poetry"
import type { Alert } from "@/lib/desk/vale/vale"

import { messages } from "./desk.messages"
import type { MenuAnchor } from "./editor"

const mac = () =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
const mod = (key: string) => (mac() ? `⌘${key}` : `Ctrl+${key}`)

export const ELEMENTS = [
  { id: "scene", key: "1", short: "INT" },
  { id: "action", key: "2", short: "ACT" },
  { id: "character", key: "3", short: "CHR" },
  { id: "parenthetical", key: "4", short: "( )" },
  { id: "dialogue", key: "5", short: "DLG" },
  { id: "transition", key: "6", short: "CUT" },
] as const

export interface MenuActions {
  undo(): void
  redo(): void
  cut(): void
  copy(): void
  paste(): void
  selectLine(): void
  mark(mark: string): void
  sceneBreak(): void
  find(word: string): void
  setElement(to: Element): void
  rhymes(word: string): void
  swapWord(word: string): void
  applyAlert(a: Alert): void
  acceptAlert(a: Alert): void
  muteRule(check: string): void
}

// A slip of card that opens where you clicked. Roving focus, arrows, Home, End
// and Escape: it's a real menu under the paper.
export function ContextMenu({
  anchor,
  kind,
  alert,
  actions,
  onClose,
}: {
  anchor: MenuAnchor
  kind: Kind
  alert: Alert | null
  actions: MenuActions
  onClose(): void
}) {
  const t = useT(messages)
  const ref = React.useRef<HTMLDivElement>(null)
  const [pos, setPos] = React.useState({ left: anchor.x, top: anchor.y })

  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({
      left: Math.max(8, Math.min(anchor.x, window.innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(anchor.y, window.innerHeight - r.height - 8)),
    })
    el.querySelector<HTMLElement>("[role^=menuitem]:not(:disabled)")?.focus()
  }, [anchor])

  React.useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    window.addEventListener("mousedown", close)
    return () => window.removeEventListener("mousedown", close)
  }, [onClose])

  const act = (f: () => void) => () => {
    onClose()
    f()
  }
  const keys = (e: React.KeyboardEvent) => {
    const items = [
      ...(ref.current?.querySelectorAll<HTMLElement>(
        "[role^=menuitem]:not(:disabled)"
      ) ?? []),
    ]
    const i = items.indexOf(document.activeElement as HTMLElement)
    const go = (n: number) => {
      e.preventDefault()
      items[(n + items.length) % items.length]?.focus()
    }
    if (e.key === "ArrowDown") go(i + 1)
    if (e.key === "ArrowUp") go(i - 1)
    if (e.key === "Home") go(0)
    if (e.key === "End") go(items.length - 1)
    if (e.key === "Escape") {
      e.stopPropagation()
      onClose()
    }
  }

  const word = anchor.selected.trim() || anchor.word
  const has = !!anchor.selected
  const hits =
    kind === "poetry" && word && hasDictionary() ? rhymesFor(word, 8) : []

  // A function, not a component: a component declared here would remount on
  // every render and take the keyboard focus with it.
  const item = (o: {
    label: string
    hint?: string
    onPick(): void
    checked?: boolean
    disabled?: boolean
  }) => (
    <button
      key={o.label}
      type="button"
      role={o.checked === undefined ? "menuitem" : "menuitemradio"}
      aria-checked={o.checked}
      className="dk-menu-item"
      disabled={o.disabled}
      onClick={act(o.onPick)}
    >
      <span>{o.label}</span>
      {o.hint ? <kbd>{o.hint}</kbd> : null}
    </button>
  )

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={t("menu.label")}
      className="dk-menu"
      style={pos}
      onKeyDown={keys}
      onContextMenu={(e) => e.preventDefault()}
    >
      {alert ? (
        <div className="dk-menu-note" data-level={alert.level}>
          <p>{alert.message}</p>
          {alert.fix !== undefined
            ? item({
                label: alert.fix
                  ? t("notes.applyTo", { fix: alert.fix })
                  : t("notes.strike"),
                onPick: () => actions.applyAlert(alert),
              })
            : null}
          {item({
            label: t("notes.ignore"),
            onPick: () => actions.acceptAlert(alert),
          })}
          {item({
            label: t("menu.muteRule", {
              rule: alert.check.split(".").pop() ?? "",
            }),
            onPick: () => actions.muteRule(alert.check),
          })}
        </div>
      ) : null}

      {kind === "screenplay" ? (
        <div role="group" aria-label={t("menu.element")}>
          {ELEMENTS.map((e) =>
            item({
              label: t(`elements.${e.id}`),
              hint: mod(e.key),
              checked: anchor.type === e.id,
              onPick: () => actions.setElement(e.id),
            })
          )}
          <hr />
        </div>
      ) : null}

      {hits.length ? (
        <div>
          <p className="dk-menu-head">{t("verse.rhymesFor", { word })}</p>
          <div className="dk-menu-chips">
            {hits.map((h) => (
              <button
                key={h.word}
                type="button"
                role="menuitem"
                data-kind={h.kind}
                onClick={act(() => actions.swapWord(h.word))}
              >
                {h.word}
              </button>
            ))}
          </div>
          {item({
            label: t("menu.allRhymes"),
            onPick: () => actions.rhymes(word),
          })}
          <hr />
        </div>
      ) : null}

      {kind === "novel" ? (
        <>
          {item({
            label: t("rail.italic"),
            hint: mod("I"),
            disabled: !has,
            onPick: () => actions.mark("*"),
          })}
          {item({
            label: t("rail.bold"),
            hint: mod("B"),
            disabled: !has,
            onPick: () => actions.mark("**"),
          })}
          {item({ label: t("menu.sceneBreak"), onPick: actions.sceneBreak })}
          <hr />
        </>
      ) : null}

      {word
        ? item({
            label: t("menu.find", {
              word: word.length > 22 ? `${word.slice(0, 20)}…` : word,
            }),
            onPick: () => actions.find(word),
          })
        : null}
      {item({ label: t("menu.selectLine"), onPick: actions.selectLine })}
      <hr />
      {item({
        label: t("menu.cut"),
        hint: mod("X"),
        disabled: !has,
        onPick: actions.cut,
      })}
      {item({
        label: t("menu.copy"),
        hint: mod("C"),
        disabled: !has,
        onPick: actions.copy,
      })}
      {item({ label: t("menu.paste"), hint: mod("V"), onPick: actions.paste })}
      <hr />
      {item({ label: t("menu.undo"), hint: mod("Z"), onPick: actions.undo })}
      {item({
        label: t("menu.redo"),
        hint: mac() ? "⇧⌘Z" : "Ctrl+Y",
        onPick: actions.redo,
      })}
      <p className="dk-menu-foot">{t("menu.native")}</p>
    </div>
  )
}

// The strip that rises over a selection. `onMouseDown` keeps the selection alive.
export function Bubble({
  info,
  kind,
  type,
  actions,
  onMenu,
}: {
  info: { text: string; rect: DOMRect }
  kind: Kind
  type: Element | null
  actions: MenuActions
  onMenu(): void
}) {
  const t = useT(messages)
  const ref = React.useRef<HTMLDivElement>(null)
  const [left, setLeft] = React.useState(info.rect.left + info.rect.width / 2)
  React.useLayoutEffect(() => {
    const w = ref.current?.offsetWidth ?? 0
    const middle = info.rect.left + info.rect.width / 2
    setLeft(
      Math.max(w / 2 + 8, Math.min(middle, window.innerWidth - w / 2 - 8))
    )
  }, [info])
  const below = info.rect.top < 60
  const hold = (f: () => void) => (e: React.MouseEvent) => {
    e.preventDefault()
    f()
  }
  const word = info.text.trim()
  const single = !info.text.includes("\n")
  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label={t("menu.selection")}
      className="dk-bubble"
      data-below={below || undefined}
      style={{ left, top: below ? info.rect.bottom + 10 : info.rect.top - 10 }}
    >
      {kind === "novel" && single ? (
        <>
          <button
            type="button"
            aria-label={t("rail.italic")}
            onMouseDown={hold(() => actions.mark("*"))}
          >
            <i>I</i>
          </button>
          <button
            type="button"
            aria-label={t("rail.bold")}
            onMouseDown={hold(() => actions.mark("**"))}
          >
            <b>B</b>
          </button>
          <span className="dk-bubble-rule" />
        </>
      ) : null}
      {kind === "screenplay" && single
        ? ELEMENTS.map((e) => (
            <button
              key={e.id}
              type="button"
              className="dk-bubble-el"
              data-on={type === e.id || undefined}
              aria-label={t(`elements.${e.id}`)}
              aria-pressed={type === e.id}
              title={t(`elements.${e.id}`)}
              onMouseDown={hold(() => actions.setElement(e.id))}
            >
              {e.short}
            </button>
          ))
        : null}
      {kind === "screenplay" && single ? (
        <span className="dk-bubble-rule" />
      ) : null}
      {kind === "poetry" && single ? (
        <>
          <button type="button" onMouseDown={hold(() => actions.rhymes(word))}>
            {t("menu.rhymes")}
          </button>
          <span className="dk-bubble-rule" />
        </>
      ) : null}
      <button
        type="button"
        onMouseDown={hold(() => actions.find(word))}
        disabled={!single}
      >
        {t("rail.find")}
      </button>
      <button type="button" onMouseDown={hold(actions.cut)}>
        {t("menu.cut")}
      </button>
      <button type="button" onMouseDown={hold(actions.copy)}>
        {t("menu.copy")}
      </button>
      <button
        type="button"
        aria-label={t("menu.more")}
        onMouseDown={hold(onMenu)}
      >
        ⋯
      </button>
      <span className="dk-bubble-count">
        {t("cards.words", { count: countWords(info.text) })}
      </span>
    </div>
  )
}
