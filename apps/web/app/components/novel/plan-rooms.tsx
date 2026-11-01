import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { PlusSignIcon } from "@hugeicons/core-free-icons"

import { useT } from "@/i18n/core"
import {
  BOX_STYLES,
  TEXT_FONTS,
  WEATHERS,
  nid,
  type BoxStyle,
  type GameMap,
  type MapPin,
  type Novel,
  type TextFont,
  type VarKind,
  type Weather,
} from "@/lib/novel/model"
import { assetUrl } from "@/lib/novel/paper"

import { Darkroom, type Shot } from "./darkroom"
import { Dial, FocusRing, Key, Knob, Plate, Toggle, tick } from "./hardware"
import { messages } from "./novel.messages"
import { ConditionEditor, ScenePicker } from "./step-console"
import { useWork } from "./work"

export function MapsRoom() {
  const t = useT(messages)
  const { novel, update } = useWork()
  const [active, setActive] = React.useState<string | null>(
    novel.maps[0]?.id ?? null
  )
  const [pin, setPin] = React.useState<string | null>(null)
  const [shot, setShot] = React.useState<Shot | null>(null)
  const map = novel.maps.find((m) => m.id === active) ?? novel.maps[0]
  const table = React.useRef<HTMLDivElement>(null)
  const selected = map?.pins.find((p) => p.id === pin)

  const change = (patch: Partial<GameMap>, merge?: string) =>
    map &&
    update((n) => {
      const m = n.maps.find((v) => v.id === map.id)
      if (m) Object.assign(m, patch)
    }, merge)
  const changePin = (id: string, patch: Partial<MapPin>, merge?: string) =>
    map &&
    update((n) => {
      const p = n.maps
        .find((v) => v.id === map.id)
        ?.pins.find((v) => v.id === id)
      if (p) Object.assign(p, patch)
    }, merge)
  const position = (e: { clientX: number; clientY: number }) => {
    const box = table.current!.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (e.clientY - box.top) / box.height)),
    }
  }
  const shoot = (m: GameMap) =>
    setShot({
      kind: "map",
      name: m.name,
      brief: m.prompt || m.name,
      onKeep: (url, prompt) =>
        update((n) => {
          const v = n.maps.find((x) => x.id === m.id)
          if (v) Object.assign(v, { url, prompt })
        }),
    })

  return (
    <div className="nv-scroll grid h-full gap-2 overflow-y-auto p-2 lg:grid-cols-[minmax(0,1fr)_300px] lg:overflow-hidden">
      <div className="flex min-h-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {novel.maps.map((m) => (
            <Key
              key={m.id}
              aria-current={map?.id === m.id ? "page" : undefined}
              onClick={() => {
                setActive(m.id)
                setPin(null)
              }}
            >
              {m.name}
            </Key>
          ))}
          <Key
            tone="fire"
            onClick={() => {
              const m: GameMap = {
                id: nid("mp"),
                name: t("maps.newName", { count: novel.maps.length + 1 }),
                url: "",
                prompt: "",
                pins: [],
              }
              update((n) => n.maps.push(m))
              setActive(m.id)
              shoot(m)
            }}
          >
            <HugeiconsIcon
              icon={PlusSignIcon}
              strokeWidth={2}
              className="size-4"
            />
            {t("maps.add")}
          </Key>
        </div>
        {map ? (
          <div className="nv-monitor mx-auto w-full max-w-[min(100%,calc((100dvh-190px)*1.6))]">
            <div
              ref={table}
              className="nv-screen cursor-crosshair"
              style={{ aspectRatio: "16 / 10" }}
              onClick={(e) => {
                const created: MapPin = {
                  id: nid("pn"),
                  ...position(e),
                  label: t("maps.newPin"),
                  scene: null,
                  when: null,
                }
                update((n) =>
                  n.maps.find((v) => v.id === map.id)?.pins.push(created)
                )
                setPin(created.id)
                tick(1.3)
              }}
            >
              {map.url ? (
                <img
                  src={assetUrl(map.url)}
                  alt={map.name}
                  draggable={false}
                  className="absolute inset-0 size-full object-cover"
                />
              ) : (
                <div className="nv-engraved grid size-full place-items-center">
                  {t("maps.noPaper")}
                </div>
              )}
              {map.pins.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-label={p.label}
                  className="absolute -translate-x-1/2 -translate-y-full cursor-grab touch-none border-0 bg-transparent p-0"
                  style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    setPin(p.id)
                    e.currentTarget.setPointerCapture(e.pointerId)
                  }}
                  onPointerMove={(e) => {
                    if (e.currentTarget.hasPointerCapture(e.pointerId))
                      changePin(p.id, position(e), `pin-${p.id}`)
                  }}
                >
                  <span className="mb-0.5 block rounded-sm bg-[#efe6d2] px-1.5 font-(family-name:--type) text-xs font-bold whitespace-nowrap text-[#2a2118] shadow">
                    {p.label}
                  </span>
                  <i
                    className="nv-pin relative! mx-auto block"
                    style={{
                      outline:
                        pin === p.id ? "2px solid var(--amber)" : undefined,
                    }}
                  />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="p-6 text-center text-sm text-[#b5a994]">
            {t("maps.empty")}
          </p>
        )}
      </div>
      <Plate
        title={t("maps.slip")}
        bodyClassName="nv-scroll overflow-y-auto p-3 grid gap-3 content-start"
      >
        {map ? (
          <>
            <label className="grid gap-1">
              <span className="nv-engraved">{t("maps.name")}</span>
              <input
                className="nv-field"
                value={map.name}
                onChange={(e) => change({ name: e.target.value }, "name")}
              />
            </label>
            <Key onClick={() => shoot(map)}>{t("maps.draw")}</Key>
            {selected ? (
              <div className="nv-tray grid gap-2 rounded-md p-2.5">
                <span className="nv-engraved">{t("maps.pin")}</span>
                <input
                  aria-label={t("maps.pinLabel")}
                  className="nv-field"
                  value={selected.label}
                  onChange={(e) =>
                    changePin(selected.id, { label: e.target.value }, "label")
                  }
                />
                <ScenePicker
                  label={t("console.leadsTo")}
                  value={selected.scene}
                  allowNone={t("none")}
                  onChange={(scene) => changePin(selected.id, { scene })}
                />
                <span className="nv-engraved">{t("console.availableIf")}</span>
                <ConditionEditor
                  value={selected.when}
                  onChange={(when) => changePin(selected.id, { when })}
                />
                <Key
                  tone="danger"
                  onClick={() => {
                    change({
                      pins: map.pins.filter((p) => p.id !== selected.id),
                    })
                    setPin(null)
                  }}
                >
                  {t("maps.removePin")}
                </Key>
              </div>
            ) : (
              <p className="text-sm text-[#b5a994]">{t("maps.help")}</p>
            )}
            <Key
              tone="danger"
              onClick={() => {
                update(
                  (n) => void (n.maps = n.maps.filter((m) => m.id !== map.id))
                )
                setActive(null)
              }}
            >
              {t("maps.remove")}
            </Key>
          </>
        ) : null}
      </Plate>
      {shot ? <Darkroom shot={shot} onClose={() => setShot(null)} /> : null}
    </div>
  )
}

function Bay({
  title,
  onAdd,
  addLabel,
  children,
}: {
  title: string
  onAdd: () => void
  addLabel: string
  children: React.ReactNode
}) {
  return (
    <Plate
      title={title}
      bodyClassName="nv-scroll overflow-y-auto p-3 grid gap-2 content-start"
      actions={
        <Key size="icon" aria-label={addLabel} onClick={onAdd}>
          <HugeiconsIcon
            icon={PlusSignIcon}
            strokeWidth={2}
            className="size-4"
          />
        </Key>
      }
    >
      {children}
    </Plate>
  )
}

export function SwitchboardRoom() {
  const t = useT(messages)
  const { novel, update } = useWork()
  const [shot, setShot] = React.useState<Shot | null>(null)
  const edit = <K extends "variables" | "items" | "endings">(
    key: K,
    id: string,
    patch: Partial<Novel[K][number]>,
    merge?: string
  ) =>
    update((n) => {
      const row = (n[key] as { id: string }[]).find((x) => x.id === id)
      if (row) Object.assign(row, patch)
    }, merge)
  const drop = (key: "variables" | "items" | "endings", id: string) =>
    update((n) => {
      const list = n[key] as { id: string }[]
      list.splice(
        list.findIndex((x) => x.id === id),
        1
      )
    })
  const Remove = ({ onClick }: { onClick: () => void }) => (
    <button
      type="button"
      aria-label={t("stage.remove")}
      className="cursor-pointer px-1 text-[#b5a994]"
      onClick={onClick}
    >
      ×
    </button>
  )
  return (
    <div className="nv-scroll grid h-full gap-2 overflow-y-auto p-2 xl:grid-cols-3 xl:overflow-hidden">
      <Bay
        title={t("switchboard.variables")}
        addLabel={t("switchboard.addVariable")}
        onAdd={() =>
          update((n) =>
            n.variables.push({
              id: nid("vr"),
              name: `var_${n.variables.length + 1}`,
              kind: "number",
              initial: 0,
              hud: false,
              max: 10,
            })
          )
        }
      >
        {novel.variables.map((v) => (
          <div key={v.id} className="nv-tray grid gap-2 rounded-md p-2.5">
            <div className="flex items-center gap-2">
              <i className="nv-jack" aria-hidden />
              <input
                aria-label={t("switchboard.variableName")}
                className="nv-field font-(family-name:--readout)"
                value={v.name}
                onChange={(e) =>
                  edit(
                    "variables",
                    v.id,
                    { name: e.target.value.replace(/[^\p{L}\p{N}_]/gu, "_") },
                    `n-${v.id}`
                  )
                }
              />
              <Remove onClick={() => drop("variables", v.id)} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <select
                aria-label={t("switchboard.kind")}
                className="nv-field max-w-24"
                value={v.kind}
                onChange={(e) => {
                  const kind = e.target.value as VarKind
                  edit("variables", v.id, {
                    kind,
                    initial:
                      kind === "number" ? 0 : kind === "flag" ? false : "",
                  })
                }}
              >
                {(["number", "flag", "text"] as const).map((k) => (
                  <option key={k} value={k}>
                    {t(`switchboard.kinds.${k}`)}
                  </option>
                ))}
              </select>
              {v.kind === "number" ? (
                <Knob
                  size={48}
                  hideValue={false}
                  label={t("switchboard.initial")}
                  value={Number(v.initial)}
                  min={-20}
                  max={100}
                  step={1}
                  format={String}
                  onChange={(initial) =>
                    edit("variables", v.id, { initial }, `i-${v.id}`)
                  }
                />
              ) : v.kind === "flag" ? (
                <Toggle
                  label={t("switchboard.initial")}
                  value={!!v.initial}
                  onChange={(initial) => edit("variables", v.id, { initial })}
                />
              ) : (
                <input
                  aria-label={t("switchboard.initial")}
                  className="nv-field"
                  value={String(v.initial)}
                  onChange={(e) =>
                    edit(
                      "variables",
                      v.id,
                      { initial: e.target.value },
                      `i-${v.id}`
                    )
                  }
                />
              )}
              {v.hud && v.kind === "number" ? (
                <Knob
                  size={48}
                  label={t("switchboard.max")}
                  value={v.max}
                  min={1}
                  max={100}
                  step={1}
                  format={String}
                  onChange={(max) =>
                    edit("variables", v.id, { max }, `m-${v.id}`)
                  }
                />
              ) : null}
              <Toggle
                label={t("switchboard.hud")}
                value={v.hud}
                onChange={(hud) => edit("variables", v.id, { hud })}
              />
            </div>
          </div>
        ))}
        {!novel.variables.length ? (
          <p className="text-sm text-[#b5a994]">
            {t("switchboard.emptyVariables")}
          </p>
        ) : null}
      </Bay>
      <Bay
        title={t("switchboard.items")}
        addLabel={t("switchboard.addItem")}
        onAdd={() =>
          update((n) =>
            n.items.push({
              id: nid("it"),
              name: t("switchboard.newItem", { count: n.items.length + 1 }),
              description: "",
              url: "",
            })
          )
        }
      >
        {novel.items.map((i) => (
          <div
            key={i.id}
            className="nv-tray grid grid-cols-[56px_1fr_auto] gap-2 rounded-md p-2.5"
          >
            <button
              type="button"
              aria-label={t("switchboard.drawItem", { name: i.name })}
              className="nv-checker size-14 cursor-pointer overflow-hidden rounded"
              onClick={() =>
                setShot({
                  kind: "item",
                  name: i.name,
                  brief: i.description || i.name,
                  onKeep: (url) => edit("items", i.id, { url }),
                })
              }
            >
              {i.url ? (
                <img
                  src={assetUrl(i.url)}
                  alt=""
                  className="size-full object-contain"
                />
              ) : null}
            </button>
            <div className="grid min-w-0 gap-1">
              <input
                aria-label={t("switchboard.itemName")}
                className="nv-field"
                value={i.name}
                onChange={(e) =>
                  edit("items", i.id, { name: e.target.value }, `n-${i.id}`)
                }
              />
              <input
                aria-label={t("switchboard.description")}
                placeholder={t("switchboard.description")}
                className="nv-field"
                value={i.description}
                onChange={(e) =>
                  edit(
                    "items",
                    i.id,
                    { description: e.target.value },
                    `d-${i.id}`
                  )
                }
              />
            </div>
            <Remove onClick={() => drop("items", i.id)} />
          </div>
        ))}
        {!novel.items.length ? (
          <p className="text-sm text-[#b5a994]">
            {t("switchboard.emptyItems")}
          </p>
        ) : null}
      </Bay>
      <Bay
        title={t("switchboard.endings")}
        addLabel={t("switchboard.addEnding")}
        onAdd={() =>
          update((n) =>
            n.endings.push({
              id: nid("en"),
              name: t("switchboard.newEnding", { count: n.endings.length + 1 }),
              description: "",
            })
          )
        }
      >
        {novel.endings.map((e) => (
          <div
            key={e.id}
            className="nv-tray grid grid-cols-[1fr_auto] gap-2 rounded-md p-2.5"
          >
            <div className="grid min-w-0 gap-1">
              <input
                aria-label={t("switchboard.endingName")}
                className="nv-field"
                value={e.name}
                onChange={(ev) =>
                  edit("endings", e.id, { name: ev.target.value }, `n-${e.id}`)
                }
              />
              <input
                aria-label={t("switchboard.description")}
                placeholder={t("switchboard.description")}
                className="nv-field"
                value={e.description}
                onChange={(ev) =>
                  edit(
                    "endings",
                    e.id,
                    { description: ev.target.value },
                    `d-${e.id}`
                  )
                }
              />
            </div>
            <Remove onClick={() => drop("endings", e.id)} />
          </div>
        ))}
        {!novel.endings.length ? (
          <p className="text-sm text-[#b5a994]">
            {t("switchboard.emptyEndings")}
          </p>
        ) : null}
      </Bay>
      {shot ? <Darkroom shot={shot} onClose={() => setShot(null)} /> : null}
    </div>
  )
}

const LANGUAGES = ["en", "fr", "es", "de", "it", "ja", "ko", "zh", "pt", "ru"]

export function FrontRoom() {
  const t = useT(messages)
  const { novel, update } = useWork()
  const set = (patch: Partial<Novel>, merge?: string) =>
    update((n) => void Object.assign(n, patch), merge)
  const title = novel.titleScreen
  const theme = novel.theme
  const back = novel.backdrops.find((b) => b.id === title.backdrop)
  const setTitle = (patch: Partial<Novel["titleScreen"]>, merge?: string) =>
    update((n) => void Object.assign(n.titleScreen, patch), merge)
  const setTheme = (patch: Partial<Novel["theme"]>, merge?: string) =>
    update((n) => void Object.assign(n.theme, patch), merge)
  return (
    <div className="nv-scroll grid h-full gap-2 overflow-y-auto p-2 xl:grid-cols-[minmax(0,1fr)_360px] xl:overflow-hidden">
      <div className="nv-scroll grid min-h-0 content-start gap-2 overflow-y-auto">
        <div className="nv-monitor mx-auto w-full max-w-3xl">
          <div className="nv-screen" style={{ aspectRatio: "16 / 9" }}>
            {back?.url ? (
              <img
                src={assetUrl(back.url)}
                alt=""
                className="absolute inset-0 size-full object-cover"
              />
            ) : null}
            <div className="bg-gradient-to-e absolute inset-0 from-black/70 to-transparent" />
            <div className="absolute inset-y-0 start-[7%] flex max-w-[60%] flex-col justify-center gap-2">
              <p
                className="text-4xl leading-none font-semibold"
                style={{ fontFamily: "'Fraunces Variable', serif" }}
              >
                {novel.title || t("untitled")}
              </p>
              <p className="text-sm opacity-80">{title.tagline}</p>
              <p
                className="mt-3 text-lg"
                style={{
                  color: theme.accent,
                  fontFamily: "'Fraunces Variable', serif",
                }}
              >
                {t("front.start")}
              </p>
            </div>
          </div>
        </div>
        <Plate
          title={t("front.textbox")}
          bodyClassName="p-4 flex flex-wrap items-center justify-around gap-5"
        >
          <Dial<BoxStyle>
            label={t("front.box")}
            value={theme.box}
            options={BOX_STYLES.map((b) => ({
              value: b,
              label: t(`front.boxes.${b}`),
            }))}
            onChange={(box) => setTheme({ box })}
          />
          <Dial<TextFont>
            label={t("front.font")}
            value={theme.font}
            options={TEXT_FONTS.map((f) => ({
              value: f,
              label: t(`front.fonts.${f}`),
            }))}
            onChange={(font) => setTheme({ font })}
          />
          <div className="flex gap-5">
            <Toggle
              label={t("front.sideImage")}
              value={theme.sideImage}
              onChange={(sideImage) => setTheme({ sideImage })}
            />
            <Toggle
              label={t("front.spotlight")}
              value={theme.spotlight}
              onChange={(spotlight) => setTheme({ spotlight })}
            />
          </div>
          <label className="grid gap-1">
            <span className="nv-engraved">{t("front.accent")}</span>
            <input
              type="color"
              className="h-10 w-20 cursor-pointer rounded bg-transparent"
              value={theme.accent}
              onChange={(e) => setTheme({ accent: e.target.value }, "accent")}
            />
          </label>
        </Plate>
      </div>
      <Plate
        title={t("front.titleCard")}
        bodyClassName="nv-scroll overflow-y-auto p-3 grid gap-3 content-start"
      >
        <label className="grid gap-1">
          <span className="nv-engraved">{t("front.author")}</span>
          <input
            className="nv-field"
            value={novel.author}
            onChange={(e) => set({ author: e.target.value }, "author")}
          />
        </label>
        <label className="grid gap-1">
          <span className="nv-engraved">{t("front.tagline")}</span>
          <input
            className="nv-field"
            value={title.tagline}
            onChange={(e) => setTitle({ tagline: e.target.value }, "tagline")}
          />
        </label>
        <label className="grid gap-1">
          <span className="nv-engraved">{t("front.synopsis")}</span>
          <textarea
            className="nv-field min-h-20"
            value={novel.synopsis}
            onChange={(e) => set({ synopsis: e.target.value }, "synopsis")}
          />
        </label>
        <label className="grid gap-1">
          <span className="nv-engraved">{t("front.backdrop")}</span>
          <select
            className="nv-field"
            value={title.backdrop ?? ""}
            onChange={(e) => setTitle({ backdrop: e.target.value || null })}
          >
            <option value="">{t("none")}</option>
            {novel.backdrops.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="nv-engraved">{t("front.music")}</span>
          <select
            className="nv-field"
            value={title.music ?? ""}
            onChange={(e) => setTitle({ music: e.target.value || null })}
          >
            <option value="">{t("none")}</option>
            {novel.tracks
              .filter((k) => k.kind === "music")
              .map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
          </select>
        </label>
        <div className="grid gap-1">
          <span className="nv-engraved">{t("front.weather")}</span>
          <FocusRing<Weather>
            label={t("front.weather")}
            value={title.weather}
            options={WEATHERS.map((w) => ({
              value: w,
              label: t(`weather.${w}`),
            }))}
            onChange={(weather) => setTitle({ weather })}
          />
        </div>
        <div className="grid gap-1">
          <span className="nv-engraved">{t("front.ratio")}</span>
          <FocusRing<Novel["ratio"]>
            label={t("front.ratio")}
            value={novel.ratio}
            options={(["16:9", "3:2", "4:3", "9:16"] as const).map((r) => ({
              value: r,
              label: r,
            }))}
            onChange={(ratio) => set({ ratio })}
          />
        </div>
        <label className="grid gap-1">
          <span className="nv-engraved">{t("front.language")}</span>
          <select
            className="nv-field"
            value={novel.language}
            onChange={(e) => set({ language: e.target.value })}
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {new Intl.DisplayNames([l], { type: "language" }).of(l)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="nv-engraved">{t("front.artStyle")}</span>
          <textarea
            className="nv-field min-h-16"
            value={novel.artStyle}
            onChange={(e) => set({ artStyle: e.target.value }, "style")}
          />
        </label>
      </Plate>
    </div>
  )
}
