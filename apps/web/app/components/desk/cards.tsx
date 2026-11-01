import * as React from "react"

import { useT } from "@/i18n/core"
import type { Scene } from "@/lib/desk/fountain"
import {
  countWords,
  STATUSES,
  type Manuscript,
  type Part,
  type Status,
} from "@/lib/desk/model"

import { messages } from "./desk.messages"

function useDrag(onMove: (from: number, to: number) => void) {
  const [dragging, setDragging] = React.useState<number | null>(null)
  const [over, setOver] = React.useState<number | null>(null)
  const props = (i: number) => ({
    draggable: true,
    "data-dragging": dragging === i || undefined,
    "data-over": over === i && dragging !== i ? true : undefined,
    onDragStart: (e: React.DragEvent) => {
      setDragging(i)
      e.dataTransfer.effectAllowed = "move"
      e.dataTransfer.setData("text/plain", String(i))
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
      setOver(i)
    },
    onDragEnd: () => {
      setDragging(null)
      setOver(null)
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      if (dragging !== null && dragging !== i) onMove(dragging, i)
      setDragging(null)
      setOver(null)
    },
  })
  return props
}

const ACTIVE_SCENE = (scenes: Scene[], line: number) => {
  let at = -1
  scenes.forEach((s, i) => {
    if (s.line <= line) at = i
  })
  return at
}

export function Cards({
  manuscript: m,
  current,
  scenes,
  caretLine,
  onPick,
  onPickScene,
  onAdd,
  onDelete,
  onReorder,
  onMoveScene,
  onBoard,
}: {
  manuscript: Manuscript
  current: string
  scenes: Scene[]
  caretLine: number
  onPick(id: string): void
  onPickScene(line: number): void
  onAdd(): void
  onDelete(id: string): void
  onReorder(from: number, to: number): void
  onMoveScene(from: number, to: number): void
  onBoard(): void
}) {
  const t = useT(messages)
  const drag = useDrag(m.kind === "screenplay" ? onMoveScene : onReorder)
  const active = ACTIVE_SCENE(scenes, caretLine)
  const label = m.kind === "poetry" ? t("cards.poem") : t("cards.chapter")

  return (
    <nav className="dk-cards" aria-label={t("cards.title")}>
      <div className="dk-cards-scroll">
        {m.kind === "screenplay"
          ? scenes.map((s, i) => (
              <button
                key={`${s.line}-${s.number}`}
                type="button"
                className="dk-card"
                data-active={i === active || undefined}
                style={
                  {
                    "--tilt": `${((i * 37) % 5) * 0.14 - 0.3}deg`,
                  } as React.CSSProperties
                }
                onClick={() => onPickScene(s.line)}
                {...drag(i)}
              >
                <span className="dk-card-no">{s.number}</span>
                <strong>{s.heading}</strong>
                <span className="dk-card-body">
                  {s.synopsis || s.characters.join(", ") || " "}
                </span>
              </button>
            ))
          : m.parts.map((p, i) => (
              <div
                key={p.id}
                className="dk-card"
                data-active={p.id === current || undefined}
                data-status={p.status}
                style={
                  {
                    "--tilt": `${((i * 37) % 5) * 0.14 - 0.3}deg`,
                  } as React.CSSProperties
                }
                {...drag(i)}
              >
                <button
                  type="button"
                  className="dk-card-hit"
                  onClick={() => onPick(p.id)}
                >
                  <span className="dk-card-no">{i + 1}</span>
                  <strong>{p.title || `${label} ${i + 1}`}</strong>
                  <span className="dk-card-body">
                    {p.synopsis || p.body.slice(0, 80) || " "}
                  </span>
                  <span className="dk-card-foot">
                    {t("cards.words", { count: countWords(p.body) })}
                  </span>
                </button>
                {m.parts.length > 1 ? (
                  <button
                    type="button"
                    className="dk-card-x"
                    aria-label={t("cards.delete", {
                      name: p.title || `${label} ${i + 1}`,
                    })}
                    onClick={() => onDelete(p.id)}
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ))}
        {m.kind === "screenplay" && !scenes.length ? (
          <p className="dk-card dk-card-hint">{t("cards.noScenes")}</p>
        ) : null}
      </div>
      <div className="flex gap-2">
        {m.kind !== "screenplay" ? (
          <button type="button" className="dk-tab-btn flex-1" onClick={onAdd}>
            {m.kind === "poetry" ? t("cards.addPoem") : t("cards.addChapter")}
          </button>
        ) : null}
        <button type="button" className="dk-tab-btn flex-1" onClick={onBoard}>
          {t("cards.board")}
        </button>
      </div>
    </nav>
  )
}

export function Corkboard({
  manuscript: m,
  scenes,
  onClose,
  onPick,
  onPickScene,
  onReorder,
  onMoveScene,
  patchPart,
}: {
  manuscript: Manuscript
  scenes: Scene[]
  onClose(): void
  onPick(id: string): void
  onPickScene(line: number): void
  onReorder(from: number, to: number): void
  onMoveScene(from: number, to: number): void
  patchPart(id: string, patch: Partial<Part>): void
}) {
  const t = useT(messages)
  const drag = useDrag(m.kind === "screenplay" ? onMoveScene : onReorder)
  return (
    <div className="dk-board" role="dialog" aria-label={t("cards.board")}>
      <header className="flex items-center justify-between gap-4">
        <h2 className="dk-board-title">{t("cards.board")}</h2>
        <button type="button" className="dk-tab-btn" onClick={onClose}>
          {t("close")}
        </button>
      </header>
      <p className="dk-board-hint">{t("cards.boardHint")}</p>
      <div className="dk-pins">
        {m.kind === "screenplay"
          ? scenes.map((s, i) => (
              <button
                key={`${s.line}-${s.number}`}
                type="button"
                className="dk-pin"
                style={
                  {
                    "--tilt": `${((i * 53) % 7) * 0.4 - 1.2}deg`,
                  } as React.CSSProperties
                }
                onClick={() => onPickScene(s.line)}
                {...drag(i)}
              >
                <i aria-hidden className="dk-tack" />
                <strong>
                  {s.number}. {s.heading}
                </strong>
                <span>{s.synopsis || " "}</span>
                <em>{s.characters.join(", ")}</em>
              </button>
            ))
          : m.parts.map((p, i) => (
              <div
                key={p.id}
                className="dk-pin"
                data-status={p.status}
                style={
                  {
                    "--tilt": `${((i * 53) % 7) * 0.4 - 1.2}deg`,
                  } as React.CSSProperties
                }
                {...drag(i)}
              >
                <i aria-hidden className="dk-tack" />
                <button
                  type="button"
                  className="text-start"
                  onClick={() => onPick(p.id)}
                >
                  <strong>
                    {i + 1}. {p.title || t("untitled")}
                  </strong>
                </button>
                <textarea
                  aria-label={t("cards.synopsis")}
                  placeholder={t("cards.synopsis")}
                  value={p.synopsis}
                  onChange={(e) =>
                    patchPart(p.id, { synopsis: e.target.value })
                  }
                />
                <label className="dk-pin-status">
                  <span className="sr-only">{t("cards.status")}</span>
                  <select
                    value={p.status}
                    onChange={(e) =>
                      patchPart(p.id, { status: e.target.value as Status })
                    }
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {t(`status.${s}`)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
      </div>
    </div>
  )
}
