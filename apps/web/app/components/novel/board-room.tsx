import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Delete02Icon,
  PlusSignIcon,
  QuillWrite01Icon,
} from "@hugeicons/core-free-icons"

import { useT } from "@/i18n/core"
import { ApiError, writeRequest } from "@/lib/novel/client"
import {
  SCENE_COLORS,
  newScene,
  nid,
  sceneTargets,
  type Scene,
} from "@/lib/novel/model"
import { bible } from "@/lib/novel/outline"
import { parseScene, printScene, slug } from "@/lib/novel/script"

import { Key, Plate, Swatches, Toggle, tick } from "./hardware"
import { messages } from "./novel.messages"
import { useWork } from "./work"

const CARD_W = 206
const CARD_H = 132
const BOARD_W = 3200
const BOARD_H = 2000

// Red thread between two pinned cards, sagging the way thread does.
function thread(x1: number, y1: number, x2: number, y2: number) {
  const sag = Math.min(
    70,
    16 + Math.abs(x2 - x1) * 0.1 + Math.abs(y2 - y1) * 0.05
  )
  return `M${x1} ${y1} Q${(x1 + x2) / 2} ${Math.max(y1, y2) + sag} ${x2} ${y2}`
}

export function useSceneWriter() {
  const { novel, update, notify } = useWork()
  const t = useT(messages)
  const [busy, setBusy] = React.useState<string | null>(null)
  const write = async (scene: Scene, instruction: string) => {
    setBusy(scene.id)
    try {
      const targets = sceneTargets(novel, scene)
        .map((id) => novel.scenes.find((s) => s.id === id)?.name)
        .filter((n): n is string => !!n)
        .map(slug)
      const { script } = await writeRequest<{ script: string }>({
        mode: "scene",
        bible: bible(novel),
        scene: scene.name,
        summary: scene.summary,
        instruction,
        current: printScene(novel, scene),
        next: targets,
        language: novel.language,
      })
      let bad = 0
      update((n) => {
        const { steps, errors } = parseScene(n, script, { create: true })
        bad = errors.length
        const s = n.scenes.find((x) => x.id === scene.id)
        if (s) s.steps = steps
      })
      notify(
        bad ? t("board.wroteWithErrors", { count: bad }) : t("board.wrote")
      )
    } catch (e) {
      notify(e instanceof ApiError ? e.message : t("errors.failed"))
    } finally {
      setBusy(null)
    }
  }
  return { write, busy }
}

export function BoardRoom() {
  const t = useT(messages)
  const {
    novel,
    update,
    scene: selected,
    setScene,
    setRoom,
    writer,
    play,
  } = useWork()
  const { write, busy } = useSceneWriter()
  const [instruction, setInstruction] = React.useState("")
  const [string, setString] = React.useState<{
    from: string
    x: number
    y: number
  } | null>(null)
  const board = React.useRef<HTMLDivElement>(null)
  const scene = novel.scenes.find((s) => s.id === selected) ?? novel.scenes[0]

  const point = (e: { clientX: number; clientY: number }) => {
    const box = board.current!.getBoundingClientRect()
    return { x: e.clientX - box.left, y: e.clientY - box.top }
  }

  const add = () => {
    const created = newScene(
      t("board.newSceneName", { count: novel.scenes.length + 1 })
    )
    const near = scene ?? { x: 60, y: 60 }
    created.x = near.x + 260
    created.y = near.y + 40
    update((n) => {
      n.scenes.push(created)
      n.start ??= created.id
    })
    setScene(created.id)
    tick(1)
  }

  const remove = (id: string) => {
    update((n) => {
      n.scenes = n.scenes.filter((s) => s.id !== id)
      if (n.start === id) n.start = n.scenes[0]?.id ?? null
    })
    setScene(novel.scenes.find((s) => s.id !== id)?.id ?? null)
  }

  const change = (patch: Partial<Scene>, merge?: string) =>
    scene &&
    update((n) => {
      const s = n.scenes.find((x) => x.id === scene.id)
      if (s) Object.assign(s, patch)
    }, merge)

  return (
    <div className="grid h-full grid-cols-1 grid-rows-[1fr_auto] md:grid-cols-[1fr_300px] md:grid-rows-1">
      <div className="nv-scroll relative min-h-0 overflow-auto">
        <div
          ref={board}
          className="nv-cork relative"
          style={{ width: BOARD_W, height: BOARD_H }}
          onClick={() => setScene(selected)}
        >
          <svg
            className="pointer-events-none absolute inset-0"
            width={BOARD_W}
            height={BOARD_H}
            aria-hidden
          >
            <defs>
              <filter id="thread-shadow">
                <feDropShadow
                  dx="1"
                  dy="3"
                  stdDeviation="1.4"
                  floodOpacity=".45"
                />
              </filter>
            </defs>
            <g
              filter="url(#thread-shadow)"
              fill="none"
              stroke="#c9281d"
              strokeWidth="2.2"
            >
              {novel.scenes.flatMap((s) =>
                sceneTargets(novel, s).flatMap((to) => {
                  const target = novel.scenes.find((x) => x.id === to)
                  if (!target) return []
                  return (
                    <path
                      key={`${s.id}-${to}`}
                      d={thread(
                        s.x + CARD_W - 12,
                        s.y + 8,
                        target.x + 12,
                        target.y + 8
                      )}
                    />
                  )
                })
              )}
              {string
                ? (() => {
                    const from = novel.scenes.find((s) => s.id === string.from)
                    return from ? (
                      <path
                        d={thread(
                          from.x + CARD_W - 12,
                          from.y + 8,
                          string.x,
                          string.y
                        )}
                        strokeDasharray="6 4"
                      />
                    ) : null
                  })()
                : null}
            </g>
          </svg>
          {novel.scenes.map((s, i) => (
            <SceneCard
              key={s.id}
              scene={s}
              index={i}
              isStart={novel.start === s.id}
              selected={selected === s.id}
              onSelect={() => setScene(s.id)}
              onOpen={() => {
                setScene(s.id)
                setRoom("stage")
              }}
              onMove={(x, y) =>
                update((n) => {
                  const c = n.scenes.find((v) => v.id === s.id)
                  if (c) {
                    c.x = Math.max(0, Math.min(BOARD_W - CARD_W, x))
                    c.y = Math.max(0, Math.min(BOARD_H - CARD_H, y))
                  }
                }, `move-${s.id}`)
              }
              onThread={(e) => {
                e.stopPropagation()
                e.preventDefault()
                setString({ from: s.id, ...point(e) })
                const move = (ev: PointerEvent) =>
                  setString({ from: s.id, ...point(ev) })
                const up = (ev: PointerEvent) => {
                  window.removeEventListener("pointermove", move)
                  window.removeEventListener("pointerup", up)
                  setString(null)
                  const p = point(ev)
                  const hit = novel.scenes.find(
                    (c) =>
                      c.id !== s.id &&
                      p.x >= c.x &&
                      p.x <= c.x + CARD_W &&
                      p.y >= c.y &&
                      p.y <= c.y + CARD_H
                  )
                  if (hit) {
                    tick(1.2)
                    update((n) => {
                      n.scenes
                        .find((v) => v.id === s.id)
                        ?.steps.push({
                          id: nid("st"),
                          t: "jump",
                          scene: hit.id,
                        })
                    })
                  }
                }
                window.addEventListener("pointermove", move)
                window.addEventListener("pointerup", up)
              }}
            />
          ))}
        </div>
      </div>
      <Plate
        title={t("board.slip")}
        className="m-2 max-h-[38vh] md:max-h-none"
        bodyClassName="nv-scroll overflow-y-auto p-3"
        actions={
          <Key onClick={add} aria-label={t("board.addScene")}>
            <HugeiconsIcon
              icon={PlusSignIcon}
              strokeWidth={2}
              className="size-4"
            />
            {t("board.addScene")}
          </Key>
        }
      >
        {scene ? (
          <div className="grid gap-3">
            <label className="grid gap-1">
              <span className="nv-engraved">{t("board.name")}</span>
              <input
                className="nv-field"
                value={scene.name}
                onChange={(e) => change({ name: e.target.value }, "name")}
              />
            </label>
            <label className="grid gap-1">
              <span className="nv-engraved">{t("board.summary")}</span>
              <textarea
                className="nv-field min-h-20 resize-y"
                value={scene.summary}
                onChange={(e) => change({ summary: e.target.value }, "summary")}
              />
            </label>
            <div className="grid gap-1">
              <span className="nv-engraved">{t("board.cardColor")}</span>
              <Swatches
                label={t("board.cardColor")}
                value={scene.color}
                options={SCENE_COLORS}
                onChange={(c) => change({ color: c })}
              />
            </div>
            <div className="flex items-start justify-around py-1">
              <Toggle
                label={t("board.fullPage")}
                value={scene.layout === "nvl"}
                onChange={(v) => change({ layout: v ? "nvl" : "adv" })}
              />
              <Toggle
                label={t("board.opening")}
                value={novel.start === scene.id}
                onChange={(v) => v && update((n) => void (n.start = scene.id))}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Key
                onClick={() => {
                  setRoom("stage")
                }}
              >
                {t("board.openOnStage")}
              </Key>
              <Key onClick={() => play(scene.id)}>
                {t("board.playFromHere")}
              </Key>
            </div>
            <div className="nv-tray grid gap-2 rounded-md p-2.5">
              <span className="nv-engraved flex items-center gap-1.5">
                <HugeiconsIcon
                  icon={QuillWrite01Icon}
                  strokeWidth={2}
                  className="size-3.5"
                />
                {t("board.writer")}
              </span>
              <textarea
                className="nv-field min-h-16 resize-y"
                placeholder={t("board.instruction")}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
              />
              <Key
                tone="fire"
                disabled={!!busy || writer?.available === false}
                onClick={() => void write(scene, instruction)}
              >
                {busy === scene.id ? t("board.writing") : t("board.writeScene")}
                {writer && !writer.free && busy !== scene.id
                  ? ` · ${t("credits", { count: writer.costs.scene })}`
                  : ""}
              </Key>
              {writer?.available === false ? (
                <p className="text-xs text-[#b5a994]">{t("board.writerOff")}</p>
              ) : null}
            </div>
            <Key
              tone="danger"
              disabled={novel.scenes.length < 2}
              onClick={() => remove(scene.id)}
            >
              <HugeiconsIcon
                icon={Delete02Icon}
                strokeWidth={2}
                className="size-4"
              />
              {t("board.deleteScene")}
            </Key>
            <p className="text-xs text-[#b5a994]">{t("board.hint")}</p>
          </div>
        ) : null}
      </Plate>
    </div>
  )
}

function SceneCard({
  scene,
  index,
  isStart,
  selected,
  onSelect,
  onOpen,
  onMove,
  onThread,
}: {
  scene: Scene
  index: number
  isStart: boolean
  selected: boolean
  onSelect: () => void
  onOpen: () => void
  onMove: (x: number, y: number) => void
  onThread: (e: React.PointerEvent<HTMLButtonElement>) => void
}) {
  const t = useT(messages)
  const start = React.useRef<{
    x: number
    y: number
    cx: number
    cy: number
  } | null>(null)
  const tilt = ((index * 37) % 5) - 2
  const lines = scene.steps.filter((s) => s.t === "say").length
  return (
    <article
      className="nv-card"
      data-selected={selected}
      data-scene={scene.id}
      style={
        {
          left: scene.x,
          top: scene.y,
          rotate: selected ? "0deg" : `${tilt * 0.4}deg`,
          "--card": scene.color,
        } as React.CSSProperties
      }
      tabIndex={0}
      aria-label={scene.name}
      onPointerDown={(e) => {
        onSelect()
        e.currentTarget.setPointerCapture(e.pointerId)
        start.current = { x: e.clientX, y: e.clientY, cx: scene.x, cy: scene.y }
      }}
      onPointerMove={(e) => {
        const s = start.current
        if (s) onMove(s.cx + e.clientX - s.x, s.cy + e.clientY - s.y)
      }}
      onPointerUp={() => (start.current = null)}
      onPointerCancel={() => (start.current = null)}
      onDoubleClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen()
      }}
    >
      <i
        className="nv-pin"
        style={{ top: 2, insetInlineStart: 5 }}
        aria-hidden
      />
      <button
        type="button"
        aria-label={t("board.thread")}
        title={t("board.thread")}
        className="nv-pin cursor-crosshair border-0 p-0"
        style={{ top: 2, insetInlineEnd: 5 }}
        onPointerDown={onThread}
      />
      <h3 className="truncate px-6 pt-2 pb-1 text-center text-[15px] leading-[24px] font-bold">
        {scene.name}
      </h3>
      <p className="line-clamp-3 min-h-[66px] px-3 pt-1 text-[13px] leading-[22px]">
        {scene.summary || " "}
      </p>
      <footer className="flex items-center justify-between px-3 pb-1.5 text-[11px] text-[#7c6d58]">
        <span>{t("board.lines", { count: lines })}</span>
        {isStart ? (
          <span
            className="nv-cue"
            style={{ "--tape": "#e7c66b" } as React.CSSProperties}
          >
            {t("board.opening")}
          </span>
        ) : null}
      </footer>
    </article>
  )
}
