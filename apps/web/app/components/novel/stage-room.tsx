import * as React from "react"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Copy01Icon,
  Delete02Icon,
  PlayIcon,
} from "@hugeicons/core-free-icons"

import { useT } from "@/i18n/core"
import { stageAt } from "@/lib/novel/engine"
import {
  newStep,
  nid,
  type Novel,
  type Scene,
  type Step,
  type StepType,
} from "@/lib/novel/model"
import { parseScene, printScene, type ScriptError } from "@/lib/novel/script"

import { Key, Plate, Readout, tick } from "./hardware"
import { messages } from "./novel.messages"
import { Stage, ratioOf } from "./stage"
import { StepConsole } from "./step-console"
import { useWork } from "./work"

const TOKENS: {
  group: "words" | "stage" | "sound" | "effects" | "logic"
  types: StepType[]
}[] = [
  { group: "words", types: ["say", "choice", "ask", "note"] },
  { group: "stage", types: ["bg", "show", "move", "hide", "cg"] },
  { group: "sound", types: ["music", "ambience", "sfx"] },
  {
    group: "effects",
    types: ["weather", "grade", "camera", "shake", "flash", "fade", "wait"],
  },
  {
    group: "logic",
    types: ["set", "if", "jump", "call", "return", "map", "item", "end"],
  },
]

const TAPE: Partial<Record<StepType, string>> = {
  bg: "#a5c3d9",
  cg: "#a5c3d9",
  show: "#a9c8a4",
  hide: "#a9c8a4",
  move: "#a9c8a4",
  music: "#c9b4d8",
  ambience: "#c9b4d8",
  sfx: "#c9b4d8",
  choice: "#f0a868",
  if: "#f0a868",
  jump: "#e8806f",
  call: "#e8806f",
  end: "#e8806f",
  map: "#f0a868",
}

export function stepSummary(novel: Novel, s: Step, tNone: string) {
  const char = (id: string | null) =>
    novel.characters.find((c) => c.id === id)?.name ?? tNone
  const sceneName = (id: string | null) =>
    novel.scenes.find((c) => c.id === id)?.name ?? tNone
  const back = (id: string | null) =>
    novel.backdrops.find((b) => b.id === id)?.name ?? tNone
  const track = (id: string | null) =>
    novel.tracks.find((k) => k.id === id)?.name ?? tNone
  const varName = (on: string) =>
    novel.variables.find((v) => v.id === on)?.name ?? tNone
  switch (s.t) {
    case "bg":
    case "cg":
      return back(s.ref)
    case "show":
      return `${char(s.who)} ${novel.characters.find((c) => c.id === s.who)?.sprites.find((p) => p.id === s.pose)?.name ?? ""}`
    case "hide":
    case "move":
      return char(s.who)
    case "music":
    case "ambience":
    case "sfx":
      return track(s.track)
    case "weather":
      return s.kind
    case "grade":
      return s.look
    case "camera":
      return `×${s.zoom}`
    case "wait":
    case "shake":
    case "flash":
    case "fade":
      return `${s.dur}s`
    case "choice":
      return s.prompt || String(s.options.length)
    case "map":
      return novel.maps.find((m) => m.id === s.map)?.name ?? tNone
    case "set":
      return `${varName(s.on)} ${s.op} ${s.value}`
    case "if":
      return `${sceneName(s.then)} / ${sceneName(s.otherwise)}`
    case "jump":
    case "call":
      return sceneName(s.scene)
    case "ask":
      return s.prompt
    case "item":
      return novel.items.find((i) => i.id === s.item)?.name ?? tNone
    case "end":
      return novel.endings.find((e) => e.id === s.ending)?.name ?? ""
    default:
      return ""
  }
}

export function StageRoom() {
  const t = useT(messages)
  const {
    novel,
    update,
    scene: sceneId,
    setScene,
    step: stepId,
    setStep,
    play,
  } = useWork()
  const scene = novel.scenes.find((s) => s.id === sceneId) ?? novel.scenes[0]
  const [text, setText] = React.useState(false)
  const index = scene ? scene.steps.findIndex((s) => s.id === stepId) : -1
  const shownIndex = index >= 0 ? index : (scene?.steps.length ?? 0) - 1
  const step = scene?.steps[index]

  const stage = React.useMemo(
    () => (scene ? stageAt(novel, scene.id, shownIndex) : null),
    [novel, scene, shownIndex]
  )

  const edit = (change: (s: Scene) => void, merge?: string) =>
    scene &&
    update((n) => {
      const s = n.scenes.find((x) => x.id === scene.id)
      if (s) change(s)
    }, merge)

  const addStep = (type: StepType) => {
    if (!scene) return
    const created = newStep(type, novel)
    // New lines are spoken by whoever spoke last.
    if (created.t === "say") {
      const last = scene.steps
        .slice(0, index + 1)
        .reverse()
        .find((s) => s.t === "say")
      if (last?.t === "say") created.who = last.who
    }
    edit((s) =>
      s.steps.splice(index >= 0 ? index + 1 : s.steps.length, 0, created)
    )
    setStep(created.id)
    tick(1)
    if (created.t === "say")
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLTextAreaElement>(
            `[data-step="${created.id}"] textarea`
          )
          ?.focus()
      )
  }

  const speaking = step?.t === "say" ? step.who : null
  const selectedActor =
    step?.t === "show" || step?.t === "move" ? step.who : null

  return (
    <div className="nv-scroll grid h-full grid-cols-1 gap-2 overflow-y-auto p-2 lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)_minmax(290px,340px)] lg:overflow-hidden">
      {/* The prompt book */}
      <section className="flex min-h-[420px] flex-col gap-2 lg:min-h-0">
        <div className="flex gap-2">
          <select
            aria-label={t("stage.scene")}
            className="nv-field flex-1"
            value={scene?.id ?? ""}
            onChange={(e) => {
              setScene(e.target.value)
              setStep(null)
            }}
          >
            {novel.scenes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <Key pressed={text} onClick={() => setText((v) => !v)}>
            {t("stage.scriptMode")}
          </Key>
        </div>
        {scene ? (
          text ? (
            <ScriptEditor key={scene.id} scene={scene} />
          ) : (
            <PromptBook scene={scene} edit={edit} />
          )
        ) : null}
      </section>

      {/* The monitor and the tray */}
      <section className="flex min-w-0 flex-col gap-2 lg:min-h-0">
        <div className="nv-monitor mx-auto w-full max-w-[min(100%,calc((100dvh-330px)*1.78))] flex-none">
          <div className="nv-screen" style={{ aspectRatio: ratioOf(novel) }}>
            {stage ? (
              <Stage
                novel={novel}
                state={stage}
                speaker={speaking}
                spotlight={novel.theme.spotlight}
                selectedActor={selectedActor}
                onActorDrag={(who, x, done) => {
                  if (!scene) return
                  // The last step that placed this actor is the one that moves.
                  const placed = [...scene.steps.slice(0, shownIndex + 1)]
                    .reverse()
                    .find(
                      (s) => (s.t === "show" || s.t === "move") && s.who === who
                    )
                  if (!placed) return
                  edit((sc) => {
                    const p = sc.steps.find((v) => v.id === placed.id)
                    if (p && (p.t === "show" || p.t === "move")) p.x = x
                  }, `drag-${placed.id}`)
                  if (done) setStep(placed.id)
                }}
              />
            ) : null}
            {step?.t === "say" ? (
              <div className="pointer-events-none absolute inset-x-[6%] bottom-[4%] rounded-sm bg-black/70 px-[2cqw] py-[1.2cqw] font-serif text-[clamp(11px,1.5vw,18px)] leading-snug text-[#f3eee3]">
                {step.who ? (
                  <b
                    className="block"
                    style={{
                      color: novel.characters.find((c) => c.id === step.who)
                        ?.color,
                    }}
                  >
                    {novel.characters.find((c) => c.id === step.who)?.name}
                  </b>
                ) : null}
                {step.text || "…"}
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-3 px-1 pt-2.5">
            <span className="nv-engraved">{t("stage.transport")}</span>
            <input
              aria-label={t("stage.scrub")}
              type="range"
              className="min-w-0 flex-1 accent-[#ffb648]"
              min={0}
              max={Math.max(0, (scene?.steps.length ?? 1) - 1)}
              value={Math.max(0, shownIndex)}
              onChange={(e) =>
                setStep(scene?.steps[Number(e.target.value)]?.id ?? null)
              }
            />
            <Readout>
              {Math.max(0, shownIndex + 1)}/{scene?.steps.length ?? 0}
            </Readout>
            <Key
              size="icon"
              aria-label={t("stage.playScene")}
              onClick={() => play(scene?.id)}
            >
              <HugeiconsIcon
                icon={PlayIcon}
                strokeWidth={2}
                className="size-4 rtl:rotate-180"
              />
            </Key>
          </div>
        </div>
        <div className="nv-tray nv-scroll flex min-h-0 flex-1 flex-wrap content-start gap-x-4 gap-y-2 overflow-y-auto rounded-lg p-3">
          {TOKENS.map((g) => (
            <div key={g.group} className="flex max-w-full flex-col gap-1">
              <span className="nv-engraved">
                {t(`stage.groups.${g.group}`)}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {g.types.map((type) => (
                  <button
                    key={type}
                    type="button"
                    className="nv-token"
                    data-token={type}
                    aria-label={t(`steps.${type}`)}
                    onClick={() => addStep(type)}
                  >
                    <span style={{ color: TAPE[type] ?? undefined }}>
                      {t(`steps.${type}`)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* The console */}
      <Plate
        title={step ? t(`steps.${step.t}`) : t("stage.console")}
        className="min-h-[300px] lg:min-h-0"
        bodyClassName="nv-scroll overflow-y-auto p-3"
      >
        {step && scene ? (
          <StepConsole
            step={step}
            onChange={(patch, merge) =>
              edit(
                (s) => {
                  const target = s.steps.find((x) => x.id === step.id)
                  if (target) Object.assign(target, patch)
                },
                merge ? `${merge}-${step.id}` : undefined
              )
            }
          />
        ) : (
          <p className="text-sm text-[#b5a994]">{t("stage.pickStep")}</p>
        )}
      </Plate>
    </div>
  )
}

function PromptBook({
  scene,
  edit,
}: {
  scene: Scene
  edit: (change: (s: Scene) => void, merge?: string) => void
}) {
  const t = useT(messages)
  const { novel, step, setStep } = useWork()
  const list = React.useRef<HTMLOListElement>(null)
  const move = (from: number, by: number) =>
    edit((s) => {
      const to = from + by
      if (to < 0 || to >= s.steps.length) return
      const [item] = s.steps.splice(from, 1)
      s.steps.splice(to, 0, item!)
    })
  const insertLine = (after: number, who: string | null) => {
    const created = { ...newStep("say", novel), who } as Step
    edit((s) => s.steps.splice(after + 1, 0, created))
    setStep(created.id)
    requestAnimationFrame(() =>
      list.current
        ?.querySelector<HTMLTextAreaElement>(
          `[data-step="${created.id}"] textarea`
        )
        ?.focus()
    )
  }
  return (
    <div className="nv-paper nv-scroll min-h-0 flex-1 overflow-y-auto rounded-[3px] py-3 shadow-[0_10px_24px_-10px_#000]">
      <h3 className="px-4 pb-2 text-center font-bold uppercase">
        {scene.name}
      </h3>
      <ol ref={list} className="grid grid-cols-[minmax(0,1fr)]">
        {scene.steps.map((s, i) => {
          const active = s.id === step
          const char =
            s.t === "say" ? novel.characters.find((c) => c.id === s.who) : null
          return (
            <li
              key={s.id}
              data-step={s.id}
              className={cn(
                "group relative border-s-4 px-3 py-1 transition-colors",
                active
                  ? "border-[#d9861c] bg-[#f7d79a]/40"
                  : "border-transparent hover:bg-[#d9c8a4]/30"
              )}
              onClick={() => setStep(s.id)}
            >
              {s.t === "say" ? (
                <div className="grid grid-cols-[minmax(0,1fr)]">
                  <select
                    aria-label={t("stage.speaker")}
                    value={s.who ?? ""}
                    onChange={(e) => {
                      const who = e.target.value || null
                      edit((sc) => {
                        const x = sc.steps.find((v) => v.id === s.id)
                        if (x?.t === "say") x.who = who
                      })
                    }}
                    className="w-fit max-w-full cursor-pointer bg-transparent text-[13px] font-bold uppercase outline-none"
                    style={{ color: char ? "#6b3d10" : "#7c6d58" }}
                  >
                    <option value="">{t("stage.narrator")}</option>
                    {novel.characters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <textarea
                    aria-label={t("stage.line")}
                    rows={Math.max(1, Math.ceil(s.text.length / 38))}
                    className="w-full resize-none bg-transparent text-[15px] leading-[22px] outline-none placeholder:text-[#a8987e]"
                    placeholder={t("stage.linePlaceholder")}
                    value={s.text}
                    onFocus={() => setStep(s.id)}
                    onChange={(e) => {
                      const text = e.target.value
                      edit((sc) => {
                        const x = sc.steps.find((v) => v.id === s.id)
                        if (x?.t === "say") x.text = text
                      }, `line-${s.id}`)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault()
                        insertLine(i, s.who)
                      }
                    }}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  className="flex w-full min-w-0 items-center gap-2 py-0.5 text-start"
                  onClick={() => setStep(s.id)}
                >
                  <span
                    className="nv-cue flex-none"
                    style={
                      {
                        "--tape": TAPE[s.t] ?? "#e7c66b",
                        "--tilt": `${((i * 13) % 3) - 1}deg`,
                      } as React.CSSProperties
                    }
                  >
                    {t(`steps.${s.t}`)}
                  </span>
                  <span className="truncate text-[13px] text-[#5a4c38]">
                    {s.t === "note" ? s.text : stepSummary(novel, s, t("none"))}
                  </span>
                </button>
              )}
              {active ? (
                <div className="absolute end-1 top-1 flex gap-0.5 rounded bg-[#efe6d2]/90">
                  <MiniButton
                    label={t("stage.moveUp")}
                    icon={ArrowUp01Icon}
                    onClick={() => move(i, -1)}
                  />
                  <MiniButton
                    label={t("stage.moveDown")}
                    icon={ArrowDown01Icon}
                    onClick={() => move(i, 1)}
                  />
                  <MiniButton
                    label={t("stage.duplicate")}
                    icon={Copy01Icon}
                    onClick={() =>
                      edit((sc) =>
                        sc.steps.splice(i + 1, 0, {
                          ...structuredClone(s),
                          id: nid("st"),
                        })
                      )
                    }
                  />
                  <MiniButton
                    label={t("stage.remove")}
                    icon={Delete02Icon}
                    onClick={() => {
                      edit((sc) => sc.steps.splice(i, 1))
                      setStep(
                        scene.steps[i + 1]?.id ?? scene.steps[i - 1]?.id ?? null
                      )
                    }}
                  />
                </div>
              ) : null}
            </li>
          )
        })}
      </ol>
      {!scene.steps.length ? (
        <p className="px-4 py-6 text-center text-sm text-[#7c6d58]">
          {t("stage.emptyScene")}
        </p>
      ) : null}
    </div>
  )
}

function MiniButton({
  label,
  icon,
  onClick,
}: {
  label: string
  icon: Parameters<typeof HugeiconsIcon>[0]["icon"]
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="grid size-6 cursor-pointer place-items-center rounded-sm text-[#5a4c38] hover:bg-[#d9c8a4]"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      <HugeiconsIcon icon={icon} strokeWidth={2} className="size-3.5" />
    </button>
  )
}

function ScriptEditor({ scene }: { scene: Scene }) {
  const t = useT(messages)
  const { novel, update } = useWork()
  const [source, setSource] = React.useState(() => printScene(novel, scene))
  const [errors, setErrors] = React.useState<ScriptError[]>([])
  const apply = () => {
    const draft = structuredClone(novel)
    const { steps, errors: found } = parseScene(draft, source)
    setErrors(found)
    if (found.length) return
    update((n) => {
      const s = n.scenes.find((x) => x.id === scene.id)
      if (s) s.steps = steps
    })
    tick(1.2)
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <textarea
        aria-label={t("stage.scriptMode")}
        spellCheck={false}
        className="nv-paper nv-scroll min-h-0 flex-1 resize-none rounded-[3px] p-3 text-[13px] leading-[20px] outline-none"
        wrap="off"
        value={source}
        onChange={(e) => setSource(e.target.value)}
      />
      {errors.length ? (
        <ul className="nv-tray nv-scroll max-h-24 overflow-y-auto rounded p-2 text-xs text-[#ffb5ad]">
          {errors.map((e, i) => (
            <li key={i}>
              {t("stage.scriptError", {
                line: e.line,
                message: t(
                  `scriptErrors.${e.message as "notUnderstood"}`,
                  e.args
                ),
              })}
            </li>
          ))}
        </ul>
      ) : null}
      <Key tone="fire" onClick={apply}>
        {t("stage.applyScript")}
      </Key>
    </div>
  )
}
