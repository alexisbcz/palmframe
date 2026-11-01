import * as React from "react"

import { useT } from "@/i18n/core"
import { assetUrl } from "@/lib/novel/paper"
import {
  EASES,
  GRADES,
  TRANSITIONS,
  WEATHERS,
  newClause,
  newOption,
  type ChoiceOption,
  type Clause,
  type CompareOp,
  type Condition,
  type Effect,
  type Grade,
  type Novel,
  type SetOp,
  type Step,
  type Transition,
  type Weather,
} from "@/lib/novel/model"

import { Fader, FocusRing, Key, Knob, Toggle, tick } from "./hardware"
import { messages } from "./novel.messages"
import { useWork } from "./work"

const seconds = (v: number) => `${v.toFixed(1)}s`
const percent = (v: number) => `${Math.round(v * 100)}%`

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-around gap-3">
      {children}
    </div>
  )
}

export const PEDALS: Record<string, string> = {
  none: "#8c8578",
  rain: "#7ea7c2",
  storm: "#5b6ea8",
  snow: "#dfe6ea",
  petals: "#eaa9bf",
  embers: "#e0703f",
  fog: "#b7bdb8",
  dust: "#cdb37e",
  fireflies: "#b6cf62",
  sepia: "#b98a52",
  mono: "#a8a8a8",
  night: "#3f5396",
  dusk: "#e88f4a",
  dream: "#dba6d6",
  noir: "#55524e",
  cold: "#79b3cf",
  memory: "#e2c78c",
}

function Pedals<T extends string>({
  value,
  options,
  labels,
  label,
  onChange,
}: {
  value: T
  options: readonly T[]
  labels: (v: T) => string
  label: string
  onChange: (v: T) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex flex-wrap justify-center gap-2.5 p-1 pb-2"
    >
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={o === value}
          className="nv-pedal"
          style={{ "--pedal": PEDALS[o] ?? "#8c8578" } as React.CSSProperties}
          onClick={() => {
            tick(1.4)
            onChange(o)
          }}
        >
          <i
            className="nv-led"
            data-on={o === value}
            style={{ "--c": "#ff4a38" } as React.CSSProperties}
          />
          <span className="nv-pedal-name">{labels(o)}</span>
          <span className="nv-pedal-stomp" />
        </button>
      ))}
    </div>
  )
}

function Timing({
  value,
  onChange,
  label,
}: {
  value: number
  onChange: (v: number) => void
  label?: string
}) {
  const t = useT(messages)
  return (
    <Knob
      label={label ?? t("console.time")}
      value={value}
      min={0}
      max={6}
      step={0.1}
      format={seconds}
      onChange={onChange}
    />
  )
}

function TransitionRing({
  value,
  onChange,
}: {
  value: Transition
  onChange: (v: Transition) => void
}) {
  const t = useT(messages)
  return (
    <div className="grid gap-1">
      <span className="nv-engraved">{t("console.transition")}</span>
      <FocusRing
        label={t("console.transition")}
        value={value}
        options={TRANSITIONS.map((v) => ({
          value: v,
          label: t(`transitions.${v}`),
        }))}
        onChange={onChange}
      />
    </div>
  )
}

function Slides({
  novel,
  kind,
  value,
  onChange,
}: {
  novel: Novel
  kind: "bg" | "cg"
  value: string | null
  onChange: (id: string | null) => void
}) {
  const t = useT(messages)
  const { setRoom } = useWork()
  const list = novel.backdrops.filter((b) => b.kind === kind)
  return (
    <div className="grid gap-2">
      <div
        role="radiogroup"
        aria-label={t("console.backdrop")}
        className="grid grid-cols-2 gap-2"
      >
        <button
          type="button"
          role="radio"
          aria-checked={!value}
          className="nv-slide cursor-pointer !p-1.5 text-xs aria-checked:outline-2 aria-checked:outline-[#ffb648]"
          onClick={() => onChange(null)}
        >
          <span className="grid aspect-video place-items-center bg-black text-[#b5a994]">
            {t("none")}
          </span>
        </button>
        {list.map((b) => (
          <button
            key={b.id}
            type="button"
            role="radio"
            aria-checked={value === b.id}
            className="nv-slide min-w-0 cursor-pointer !p-1.5 text-xs aria-checked:outline-2 aria-checked:outline-[#ffb648]"
            onClick={() => {
              tick(1)
              onChange(b.id)
            }}
          >
            {b.url ? (
              <img
                src={assetUrl(b.url)}
                alt=""
                className="aspect-video w-full object-cover"
              />
            ) : (
              <span className="grid aspect-video place-items-center bg-[#2a2622] text-[#b5a994]">
                ?
              </span>
            )}
            <span className="mt-1 block truncate">{b.name}</span>
          </button>
        ))}
      </div>
      {!list.length ? (
        <Key onClick={() => setRoom("sets")}>{t("console.goSets")}</Key>
      ) : null}
    </div>
  )
}

function CharacterSelect({
  value,
  onChange,
  allowAll,
}: {
  value: string | null
  onChange: (id: string) => void
  allowAll?: boolean
}) {
  const t = useT(messages)
  const { novel, setRoom } = useWork()
  if (!novel.characters.length)
    return <Key onClick={() => setRoom("cast")}>{t("console.goCast")}</Key>
  return (
    <select
      aria-label={t("console.character")}
      className="nv-field"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
    >
      {allowAll ? <option value="">{t("console.everyone")}</option> : null}
      {novel.characters.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  )
}

function Poses({
  who,
  value,
  onChange,
}: {
  who: string | null
  value: string | null
  onChange: (id: string | null) => void
}) {
  const t = useT(messages)
  const { novel } = useWork()
  const c = novel.characters.find((x) => x.id === who)
  if (!c?.sprites.length) return null
  return (
    <div className="grid gap-1">
      <span className="nv-engraved">{t("console.pose")}</span>
      <div
        role="radiogroup"
        aria-label={t("console.pose")}
        className="grid grid-cols-3 gap-1.5"
      >
        {c.sprites.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={value === s.id}
            className="nv-print !p-1 !pb-1 text-[11px] aria-checked:outline-2 aria-checked:outline-[#ffb648]"
            onClick={() => {
              tick(1)
              onChange(value === s.id ? null : s.id)
            }}
          >
            {s.url ? (
              <img
                src={assetUrl(s.url)}
                alt=""
                className="nv-checker h-16 w-full object-contain object-top"
              />
            ) : (
              <span className="nv-checker block h-16 w-full" />
            )}
            <span className="block truncate">{s.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Tapes({
  kind,
  value,
  onChange,
}: {
  kind: "music" | "ambience" | "sfx"
  value: string | null
  onChange: (id: string | null) => void
}) {
  const t = useT(messages)
  const { novel, setRoom } = useWork()
  const list = novel.tracks.filter((k) => k.kind === kind)
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-2 gap-2">
        {kind !== "sfx" ? (
          <button
            type="button"
            className="nv-tape"
            aria-pressed={!value}
            onClick={() => onChange(null)}
          >
            <span className="nv-tape-label">
              <span className="nv-tape-name">{t("console.silence")}</span>
            </span>
          </button>
        ) : null}
        {list.map((k) => (
          <button
            key={k.id}
            type="button"
            className="nv-tape"
            aria-pressed={value === k.id}
            onClick={() => {
              tick(1.2)
              onChange(k.id)
            }}
          >
            <span className="nv-tape-label">
              <span className="nv-tape-name">{k.name}</span>
            </span>
          </button>
        ))}
      </div>
      {!list.length ? (
        <Key onClick={() => setRoom("sound")}>{t("console.goSound")}</Key>
      ) : null}
    </div>
  )
}

export function ScenePicker({
  value,
  onChange,
  allowNone,
  label,
}: {
  value: string | null
  onChange: (id: string | null) => void
  allowNone?: string
  label: string
}) {
  const { novel } = useWork()
  return (
    <label className="grid min-w-0 gap-1">
      <span className="nv-engraved">{label}</span>
      <select
        className="nv-field"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        {allowNone ? <option value="">{allowNone}</option> : null}
        {novel.scenes.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  )
}

function subjects(
  novel: Novel,
  t: ReturnType<typeof useT<typeof messages.en>>
) {
  return [
    ...novel.variables.map((v) => ({ value: v.id, label: v.name })),
    ...novel.items.map((i) => ({
      value: `item:${i.id}`,
      label: t("console.hasItem", { name: i.name }),
    })),
    ...novel.scenes.map((s) => ({
      value: `seen:${s.id}`,
      label: t("console.sawScene", { name: s.name }),
    })),
  ]
}

const coerce = (
  novel: Novel,
  on: string,
  raw: string
): boolean | number | string => {
  if (on.includes(":")) return raw === "true"
  const v = novel.variables.find((x) => x.id === on)
  if (v?.kind === "number") return Number(raw) || 0
  if (v?.kind === "flag") return raw === "true"
  return raw
}

function ValueField({
  on,
  value,
  onChange,
}: {
  on: string
  value: boolean | number | string
  onChange: (v: boolean | number | string) => void
}) {
  const t = useT(messages)
  const { novel } = useWork()
  const kind = on.includes(":")
    ? "flag"
    : (novel.variables.find((x) => x.id === on)?.kind ?? "flag")
  if (kind === "flag")
    return (
      <select
        aria-label={t("console.value")}
        className="nv-field"
        value={String(value)}
        onChange={(e) => onChange(coerce(novel, on, e.target.value))}
      >
        <option value="true">{t("console.yes")}</option>
        <option value="false">{t("console.no")}</option>
      </select>
    )
  return (
    <input
      aria-label={t("console.value")}
      className="nv-field"
      type={kind === "number" ? "number" : "text"}
      value={String(value)}
      onChange={(e) => onChange(coerce(novel, on, e.target.value))}
    />
  )
}

export function ConditionEditor({
  value,
  onChange,
}: {
  value: Condition | null
  onChange: (c: Condition | null) => void
}) {
  const t = useT(messages)
  const { novel } = useWork()
  const when = value ?? { all: true, clauses: [] }
  const options = subjects(novel, t)
  const set = (i: number, patch: Partial<Clause>) =>
    onChange({
      ...when,
      clauses: when.clauses.map((c, k) => (k === i ? { ...c, ...patch } : c)),
    })
  return (
    <div className="grid gap-1.5">
      {when.clauses.map((c, i) => (
        <div
          key={i}
          className="grid grid-cols-[1fr_58px_1fr_auto] items-center gap-1"
        >
          <select
            aria-label={t("console.subject")}
            className="nv-field !px-1 text-xs"
            value={c.on}
            onChange={(e) => set(i, { on: e.target.value })}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            aria-label={t("console.compare")}
            className="nv-field !px-1 text-xs"
            value={c.op}
            onChange={(e) => set(i, { op: e.target.value as CompareOp })}
          >
            {["==", "!=", ">", ">=", "<", "<="].map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <ValueField
            on={c.on}
            value={c.value}
            onChange={(v) => set(i, { value: v })}
          />
          <button
            type="button"
            aria-label={t("stage.remove")}
            className="cursor-pointer px-1 text-[#b5a994]"
            onClick={() => {
              const clauses = when.clauses.filter((_, k) => k !== i)
              onChange(clauses.length ? { ...when, clauses } : null)
            }}
          >
            ×
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Key
          disabled={!options.length}
          onClick={() =>
            onChange({ ...when, clauses: [...when.clauses, newClause(novel)] })
          }
        >
          {t("console.addCondition")}
        </Key>
        {when.clauses.length > 1 ? (
          <Key
            pressed={!when.all}
            onClick={() => onChange({ ...when, all: !when.all })}
          >
            {when.all ? t("console.allOf") : t("console.anyOf")}
          </Key>
        ) : null}
      </div>
    </div>
  )
}

function EffectsEditor({
  value,
  onChange,
}: {
  value: Effect[]
  onChange: (e: Effect[]) => void
}) {
  const t = useT(messages)
  const { novel } = useWork()
  return (
    <div className="grid gap-1.5">
      {value.map((e, i) => (
        <div
          key={i}
          className="grid grid-cols-[1fr_52px_1fr_auto] items-center gap-1"
        >
          <select
            aria-label={t("console.subject")}
            className="nv-field !px-1 text-xs"
            value={e.on}
            onChange={(ev) =>
              onChange(
                value.map((x, k) =>
                  k === i ? { ...x, on: ev.target.value } : x
                )
              )
            }
          >
            {novel.variables.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <select
            aria-label={t("console.operation")}
            className="nv-field !px-1 text-xs"
            value={e.op}
            onChange={(ev) =>
              onChange(
                value.map((x, k) =>
                  k === i ? { ...x, op: ev.target.value as SetOp } : x
                )
              )
            }
          >
            {["=", "+", "-", "toggle"].map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <ValueField
            on={e.on}
            value={e.value}
            onChange={(v) =>
              onChange(value.map((x, k) => (k === i ? { ...x, value: v } : x)))
            }
          />
          <button
            type="button"
            aria-label={t("stage.remove")}
            className="cursor-pointer px-1 text-[#b5a994]"
            onClick={() => onChange(value.filter((_, k) => k !== i))}
          >
            ×
          </button>
        </div>
      ))}
      <Key
        disabled={!novel.variables.length}
        onClick={() => {
          const v = novel.variables[0]!
          onChange([
            ...value,
            {
              on: v.id,
              op: v.kind === "number" ? "+" : "=",
              value: v.kind === "number" ? 1 : v.kind === "flag" ? true : "",
            },
          ])
        }}
      >
        {t("console.addEffect")}
      </Key>
    </div>
  )
}

function OptionCard({
  option,
  index,
  onChange,
  onRemove,
}: {
  option: ChoiceOption
  index: number
  onChange: (o: Partial<ChoiceOption>) => void
  onRemove: () => void
}) {
  const t = useT(messages)
  return (
    <div className="nv-tray grid gap-2 rounded-md p-2.5">
      <div className="flex items-center gap-2">
        <span className="nv-readout">{index + 1}</span>
        <input
          aria-label={t("console.optionText")}
          className="nv-field"
          placeholder={t("console.optionText")}
          value={option.text}
          onChange={(e) => onChange({ text: e.target.value })}
        />
        <button
          type="button"
          aria-label={t("stage.remove")}
          className="cursor-pointer px-1 text-[#b5a994]"
          onClick={onRemove}
        >
          ×
        </button>
      </div>
      <ScenePicker
        label={t("console.leadsTo")}
        value={option.goto}
        allowNone={t("console.carryOn")}
        onChange={(goto) => onChange({ goto })}
      />
      <span className="nv-engraved">{t("console.availableIf")}</span>
      <ConditionEditor
        value={option.when}
        onChange={(when) => onChange({ when })}
      />
      {option.when?.clauses.length ? (
        <div className="flex justify-center">
          <Toggle
            label={t("console.showLocked")}
            value={option.showLocked}
            onChange={(showLocked) => onChange({ showLocked })}
          />
        </div>
      ) : null}
      <span className="nv-engraved">{t("console.effects")}</span>
      <EffectsEditor
        value={option.effects}
        onChange={(effects) => onChange({ effects })}
      />
    </div>
  )
}

export function StepConsole({
  step,
  onChange,
}: {
  step: Step
  onChange: (patch: Partial<Step>, merge?: string) => void
}) {
  const t = useT(messages)
  const { novel, setRoom } = useWork()
  const set = onChange as (
    patch: Record<string, unknown>,
    merge?: string
  ) => void
  switch (step.t) {
    case "say": {
      const voices = novel.tracks.filter((k) => k.kind === "voice")
      return (
        <div className="grid gap-3">
          <Poses
            who={step.who}
            value={step.pose}
            onChange={(pose) => set({ pose })}
          />
          <label className="grid gap-1">
            <span className="nv-engraved">{t("console.voice")}</span>
            <select
              className="nv-field"
              value={step.voice ?? ""}
              onChange={(e) => set({ voice: e.target.value || null })}
            >
              <option value="">{t("none")}</option>
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <div className="nv-tray grid gap-1 rounded-md p-2.5 text-xs text-[#b5a994]">
            <span className="nv-engraved">{t("console.tags")}</span>
            <code>
              {
                "{b}{/b} {i}{/i} {shake}{/shake} {wave}{/wave} {big}{/big} {color=#f55}{/color} {w=0.5} [variable]"
              }
            </code>
          </div>
        </div>
      )
    }
    case "bg":
    case "cg":
      return (
        <div className="grid gap-3">
          <Slides
            novel={novel}
            kind={step.t}
            value={step.ref}
            onChange={(ref) => set({ ref })}
          />
          <TransitionRing
            value={step.trans}
            onChange={(trans) => set({ trans })}
          />
          <Row>
            <Timing value={step.dur} onChange={(dur) => set({ dur }, "dur")} />
          </Row>
        </div>
      )
    case "show":
      return (
        <div className="grid gap-3">
          <CharacterSelect
            value={step.who}
            onChange={(who) => set({ who, pose: null })}
          />
          <Poses
            who={step.who}
            value={step.pose}
            onChange={(pose) => set({ pose })}
          />
          <Row>
            <Knob
              label={t("console.place")}
              value={step.x}
              min={0}
              max={1}
              step={0.01}
              format={percent}
              onChange={(x) => set({ x }, "x")}
            />
            <Knob
              label={t("console.scale")}
              value={step.scale}
              min={0.5}
              max={2}
              step={0.01}
              format={(v) => `×${v.toFixed(2)}`}
              onChange={(scale) => set({ scale }, "scale")}
            />
            <Knob
              label={t("console.lift")}
              value={step.y}
              min={-0.5}
              max={0.5}
              step={0.01}
              format={percent}
              onChange={(y) => set({ y }, "y")}
            />
          </Row>
          <TransitionRing
            value={step.trans}
            onChange={(trans) => set({ trans })}
          />
          <Row>
            <Timing value={step.dur} onChange={(dur) => set({ dur }, "dur")} />
            <Toggle
              label={t("console.flip")}
              value={step.flip}
              onChange={(flip) => set({ flip })}
            />
          </Row>
        </div>
      )
    case "hide":
      return (
        <div className="grid gap-3">
          <CharacterSelect
            allowAll
            value={step.who}
            onChange={(who) => set({ who: who || null })}
          />
          <TransitionRing
            value={step.trans}
            onChange={(trans) => set({ trans })}
          />
          <Row>
            <Timing value={step.dur} onChange={(dur) => set({ dur }, "dur")} />
          </Row>
        </div>
      )
    case "move":
      return (
        <div className="grid gap-3">
          <CharacterSelect value={step.who} onChange={(who) => set({ who })} />
          <Row>
            <Knob
              label={t("console.place")}
              value={step.x}
              min={0}
              max={1}
              step={0.01}
              format={percent}
              onChange={(x) => set({ x }, "x")}
            />
            <Knob
              label={t("console.scale")}
              value={step.scale}
              min={0.5}
              max={2}
              step={0.01}
              format={(v) => `×${v.toFixed(2)}`}
              onChange={(scale) => set({ scale }, "scale")}
            />
            <Timing value={step.dur} onChange={(dur) => set({ dur }, "dur")} />
          </Row>
          <FocusRing
            label={t("console.ease")}
            value={step.ease}
            options={EASES.map((v) => ({ value: v, label: t(`eases.${v}`) }))}
            onChange={(ease) => set({ ease })}
          />
        </div>
      )
    case "music":
    case "ambience":
      return (
        <div className="grid gap-3">
          <Tapes
            kind={step.t}
            value={step.track}
            onChange={(track) => set({ track })}
          />
          <Row>
            <Fader
              label={t("console.level")}
              value={step.vol}
              min={0}
              max={1}
              step={0.01}
              height={120}
              format={percent}
              onChange={(vol) => set({ vol }, "vol")}
            />
            <Knob
              label={t("console.fade")}
              value={step.fade}
              min={0}
              max={8}
              step={0.1}
              format={seconds}
              onChange={(fade) => set({ fade }, "fade")}
            />
          </Row>
        </div>
      )
    case "sfx":
      return (
        <div className="grid gap-3">
          <Tapes
            kind="sfx"
            value={step.track || null}
            onChange={(track) => set({ track: track ?? "" })}
          />
          <Row>
            <Fader
              label={t("console.level")}
              value={step.vol}
              min={0}
              max={1}
              step={0.01}
              height={120}
              format={percent}
              onChange={(vol) => set({ vol }, "vol")}
            />
          </Row>
        </div>
      )
    case "weather":
      return (
        <div className="grid gap-3">
          <Pedals<Weather>
            label={t("steps.weather")}
            value={step.kind}
            options={WEATHERS}
            labels={(v) => t(`weather.${v}`)}
            onChange={(kind) => set({ kind })}
          />
          <Row>
            <Knob
              label={t("console.amount")}
              size={84}
              value={step.amount}
              min={0}
              max={1}
              step={0.01}
              format={percent}
              onChange={(amount) => set({ amount }, "amount")}
            />
          </Row>
        </div>
      )
    case "grade":
      return (
        <div className="grid gap-3">
          <Pedals<Grade>
            label={t("steps.grade")}
            value={step.look}
            options={GRADES}
            labels={(v) => t(`grades.${v}`)}
            onChange={(look) => set({ look })}
          />
          <Row>
            <Knob
              label={t("console.amount")}
              value={step.amount}
              min={0}
              max={1}
              step={0.01}
              format={percent}
              onChange={(amount) => set({ amount }, "amount")}
            />
            <Timing value={step.dur} onChange={(dur) => set({ dur }, "dur")} />
          </Row>
        </div>
      )
    case "camera":
      return (
        <div className="grid gap-3">
          <div className="grid gap-1">
            <span className="nv-engraved">{t("console.lens")}</span>
            <FocusRing
              label={t("console.lens")}
              value={step.zoom}
              options={[1, 1.1, 1.25, 1.5, 1.75, 2, 2.5].map((v) => ({
                value: v,
                label: `${Math.round(v * 35)}mm`,
              }))}
              onChange={(zoom) => set({ zoom })}
            />
          </div>
          <Row>
            <Knob
              label={t("console.pan")}
              value={step.x}
              min={-1}
              max={1}
              step={0.02}
              format={(v) => v.toFixed(2)}
              onChange={(x) => set({ x }, "x")}
            />
            <Knob
              label={t("console.tilt")}
              value={step.y}
              min={-1}
              max={1}
              step={0.02}
              format={(v) => v.toFixed(2)}
              onChange={(y) => set({ y }, "y")}
            />
            <Timing value={step.dur} onChange={(dur) => set({ dur }, "dur")} />
          </Row>
          <FocusRing
            label={t("console.ease")}
            value={step.ease}
            options={EASES.map((v) => ({ value: v, label: t(`eases.${v}`) }))}
            onChange={(ease) => set({ ease })}
          />
        </div>
      )
    case "shake":
      return (
        <Row>
          <Knob
            label={t("console.power")}
            size={84}
            value={step.power}
            min={0.1}
            max={1}
            step={0.01}
            format={percent}
            onChange={(power) => set({ power }, "power")}
          />
          <Timing value={step.dur} onChange={(dur) => set({ dur }, "dur")} />
        </Row>
      )
    case "flash":
    case "fade":
      return (
        <div className="grid gap-3">
          <label className="grid gap-1">
            <span className="nv-engraved">{t("console.color")}</span>
            <input
              type="color"
              className="h-9 w-full cursor-pointer rounded bg-transparent"
              value={step.color}
              onChange={(e) => set({ color: e.target.value }, "color")}
            />
          </label>
          <Row>
            <Timing value={step.dur} onChange={(dur) => set({ dur }, "dur")} />
            {step.t === "fade" ? (
              <Toggle
                label={t("console.fadeOut")}
                value={step.out}
                onChange={(out) => set({ out })}
              />
            ) : null}
          </Row>
        </div>
      )
    case "wait":
      return (
        <Row>
          <Timing value={step.dur} onChange={(dur) => set({ dur }, "dur")} />
        </Row>
      )
    case "choice":
      return (
        <div className="grid gap-3">
          <label className="grid gap-1">
            <span className="nv-engraved">{t("console.question")}</span>
            <input
              className="nv-field"
              value={step.prompt}
              onChange={(e) => set({ prompt: e.target.value }, "prompt")}
            />
          </label>
          {step.options.map((o, i) => (
            <OptionCard
              key={o.id}
              option={o}
              index={i}
              onChange={(patch) =>
                set(
                  {
                    options: step.options.map((x) =>
                      x.id === o.id ? { ...x, ...patch } : x
                    ),
                  },
                  `opt-${o.id}`
                )
              }
              onRemove={() =>
                set({ options: step.options.filter((x) => x.id !== o.id) })
              }
            />
          ))}
          <Key onClick={() => set({ options: [...step.options, newOption()] })}>
            {t("console.addOption")}
          </Key>
          <Row>
            <Knob
              label={t("console.timer")}
              value={step.timer}
              min={0}
              max={30}
              step={1}
              format={(v) => (v ? `${v}s` : t("console.off"))}
              onChange={(timer) => set({ timer }, "timer")}
            />
            {step.timer ? (
              <Knob
                label={t("console.fallback")}
                value={step.fallback}
                min={0}
                max={Math.max(1, step.options.length - 1)}
                step={1}
                format={(v) => String(v + 1)}
                onChange={(fallback) => set({ fallback }, "fallback")}
              />
            ) : null}
          </Row>
        </div>
      )
    case "map":
      return (
        <div className="grid gap-3">
          <select
            aria-label={t("steps.map")}
            className="nv-field"
            value={step.map}
            onChange={(e) => set({ map: e.target.value })}
          >
            <option value="">{t("none")}</option>
            {novel.maps.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <Key onClick={() => setRoom("maps")}>{t("console.goMaps")}</Key>
        </div>
      )
    case "set": {
      if (!novel.variables.length)
        return (
          <Key onClick={() => setRoom("switchboard")}>
            {t("console.goSwitchboard")}
          </Key>
        )
      return (
        <div className="grid grid-cols-[1fr_60px_1fr] gap-1">
          <select
            aria-label={t("console.subject")}
            className="nv-field"
            value={step.on}
            onChange={(e) => set({ on: e.target.value })}
          >
            {novel.variables.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <select
            aria-label={t("console.operation")}
            className="nv-field !px-1"
            value={step.op}
            onChange={(e) => set({ op: e.target.value })}
          >
            {["=", "+", "-", "toggle"].map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <ValueField
            on={step.on}
            value={step.value}
            onChange={(value) => set({ value }, "value")}
          />
        </div>
      )
    }
    case "if":
      return (
        <div className="grid gap-3">
          <ConditionEditor
            value={step.when}
            onChange={(when) =>
              set({ when: when ?? { all: true, clauses: [] } })
            }
          />
          <ScenePicker
            label={t("console.thenGo")}
            value={step.then}
            allowNone={t("console.carryOn")}
            onChange={(then) => set({ then })}
          />
          <ScenePicker
            label={t("console.elseGo")}
            value={step.otherwise}
            allowNone={t("console.carryOn")}
            onChange={(otherwise) => set({ otherwise })}
          />
        </div>
      )
    case "jump":
    case "call":
      return (
        <ScenePicker
          label={t("console.scene")}
          value={step.scene}
          onChange={(id) => set({ scene: id ?? "" })}
        />
      )
    case "ask":
      return (
        <div className="grid gap-3">
          <label className="grid gap-1">
            <span className="nv-engraved">{t("console.question")}</span>
            <input
              className="nv-field"
              value={step.prompt}
              onChange={(e) => set({ prompt: e.target.value }, "prompt")}
            />
          </label>
          <select
            aria-label={t("console.subject")}
            className="nv-field"
            value={step.on}
            onChange={(e) => set({ on: e.target.value })}
          >
            <option value="">{t("none")}</option>
            {novel.variables
              .filter((v) => v.kind === "text")
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
          </select>
          <Row>
            <Knob
              label={t("console.maxLength")}
              value={step.max}
              min={4}
              max={60}
              step={1}
              format={String}
              onChange={(max) => set({ max }, "max")}
            />
          </Row>
        </div>
      )
    case "item":
      return (
        <div className="grid gap-3">
          <select
            aria-label={t("steps.item")}
            className="nv-field"
            value={step.item}
            onChange={(e) => set({ item: e.target.value })}
          >
            <option value="">{t("none")}</option>
            {novel.items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <Row>
            <Toggle
              label={step.give ? t("console.give") : t("console.take")}
              value={step.give}
              onChange={(give) => set({ give })}
            />
          </Row>
          {!novel.items.length ? (
            <Key onClick={() => setRoom("switchboard")}>
              {t("console.goSwitchboard")}
            </Key>
          ) : null}
        </div>
      )
    case "end":
      return (
        <select
          aria-label={t("steps.end")}
          className="nv-field"
          value={step.ending ?? ""}
          onChange={(e) => set({ ending: e.target.value || null })}
        >
          <option value="">{t("none")}</option>
          {novel.endings.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      )
    case "note":
      return (
        <textarea
          aria-label={t("steps.note")}
          className="nv-field min-h-28"
          value={step.text}
          onChange={(e) => set({ text: e.target.value }, "note")}
        />
      )
    case "return":
      return <p className="text-sm text-[#b5a994]">{t("console.returnHelp")}</p>
  }
}
