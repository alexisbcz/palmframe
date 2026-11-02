import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowTurnBackwardIcon,
  ArrowTurnForwardIcon,
  Copy01Icon,
  Delete02Icon,
  Move01Icon,
  ReloadIcon,
  ResizeFieldIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Dialog, DialogTitle } from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Switch } from "@workspace/ui/components/switch"
import { Tooltip, TooltipTrigger } from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

import { useT } from "@/i18n/core"

import { pickFile } from "../actions"
import { ColorInput, Row, SliderInput } from "../controls"
import { GUIDE_SIDE } from "../guide"
import {
  uid,
  type Character,
  type ComicProject,
  type PanelLayer,
} from "../model"
import type { ComicEditor } from "../use-editor"

import { ModelTooLarge, storeModel } from "./assets"
import { STAGE_MOODS } from "./builders"
import { SetEngine, poseThumbnails, type Frame, type GizmoMode } from "./engine"
import {
  BODY_POSES,
  EXPRESSION_KEYS,
  EXPRESSION_PRESETS,
  HAND_POSE_IDS,
  MOODS,
  POSE_CATEGORIES,
  bodyPose,
  handPose,
  isFinger,
  mirrorPose,
} from "./poses"
import {
  FIGURES,
  MAX_ITEMS,
  MAX_SAVED_SETS,
  PROP_IDS,
  STAGE_IDS,
  castIn,
  cloneScene,
  createActor,
  createImage,
  createLamp,
  createModel,
  createProp,
  createScene,
  itemId,
  uniqueName,
  type ActorItem,
  type HairStyle,
  type Build,
  type LampItem,
  type SavedSet,
  type SetItem,
  type SetLook,
  type SetScene,
  type StageId,
  type Vec3,
} from "./scene"
import { messages } from "./set.messages"

const LOOKS: SetLook[] = ["clay", "toon", "ink", "line"]
const HISTORY = 60
const OUTPUT_SIDE = 2048

type Tab = "stage" | "people" | "props" | "lights" | "sets"
type ActorTab = "body" | "hands" | "face" | "outfit"

// A first look at the set: one figure, standing, ready to pose.
function starterScene(name: string) {
  const scene = createScene()
  scene.items.push({
    ...createActor(FIGURES[0]!, name),
    pose: bodyPose(BODY_POSES[0]!),
  })
  return scene
}

export interface SetCapture {
  scene: SetScene
  src?: string
  guide?: string
  cast: string[]
}

export default function SetDialog({
  panel,
  project,
  editor,
  onClose,
  onUse,
}: {
  panel: PanelLayer
  project: ComicProject
  editor: ComicEditor
  onClose: () => void
  onUse: (capture: SetCapture) => void
}) {
  const t = useT(messages)
  const [history, setHistory] = React.useState(() => {
    const scene = panel.set ?? starterScene(t("figure", { n: 1 }))
    return { scene, past: [] as SetScene[], future: [] as SetScene[] }
  })
  const { scene } = history
  const [selected, setSelected] = React.useState<string | null>(null)
  const [tab, setTab] = React.useState<Tab>(panel.set ? "people" : "stage")
  const [mode, setMode] = React.useState<GizmoMode>("translate")
  const [notice, setNotice] = React.useState<string | null>(null)
  const [broken, setBroken] = React.useState(false)
  const [frame, setFrame] = React.useState<Frame | null>(null)
  const [closing, setClosing] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)
  const engineRef = React.useRef<SetEngine | null>(null)
  const hostRef = React.useRef<HTMLDivElement | null>(null)

  const change = React.useCallback(
    (fn: (s: SetScene) => SetScene, group?: string) => {
      setDirty(true)
      setHistory((h) => {
        const next = fn(h.scene)
        if (next === h.scene) return h
        const merge = group && lastGroup.current === group
        lastGroup.current = group ?? null
        return {
          scene: next,
          past: merge ? h.past : [...h.past, h.scene].slice(-HISTORY),
          future: [],
        }
      })
    },
    []
  )
  const lastGroup = React.useRef<string | null>(null)

  const patchItem = React.useCallback(
    (id: string, patch: Partial<SetItem>, group?: string) =>
      change(
        (s) => ({
          ...s,
          items: s.items.map((i) =>
            i.id === id ? ({ ...i, ...patch } as SetItem) : i
          ),
        }),
        group
      ),
    [change]
  )

  const undo = React.useCallback(
    () =>
      setHistory((h) => {
        const scene = h.past.at(-1)
        if (!scene) return h
        return {
          scene,
          past: h.past.slice(0, -1),
          future: [h.scene, ...h.future],
        }
      }),
    []
  )
  const redo = React.useCallback(
    () =>
      setHistory((h) => {
        const [scene, ...future] = h.future
        if (!scene) return h
        return { scene, past: [...h.past, h.scene], future }
      }),
    []
  )

  // Start the engine once. Everything it reports back flows through history.
  React.useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let engine: SetEngine
    try {
      engine = new SetEngine(host, {
        select: setSelected,
        transform: (id, patch) => patchItem(id, patch),
        pose: (id, pose) => patchItem(id, { pose } as Partial<SetItem>),
        camera: (camera) => {
          setDirty(true)
          setHistory((h) => ({ ...h, scene: { ...h.scene, camera } }))
        },
        missing: (name) => setNotice(t("missing", { name })),
      })
    } catch {
      setBroken(true)
      return
    }
    engineRef.current = engine
    const measure = () => {
      engine.resize()
      setFrame(fitFrame(host, panel.width / panel.height))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(host)
    return () => {
      observer.disconnect()
      engine.dispose()
      engineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    void engineRef.current?.sync(scene)
  }, [scene])

  const selectItem = React.useCallback((id: string | null) => {
    engineRef.current?.select(id, "translate")
    setSelected(id)
    setMode("translate")
  }, [])

  const addItem = (item: SetItem) => {
    if (scene.items.length >= MAX_ITEMS) return
    change((s) => ({ ...s, items: [...s.items, item] }))
    // The engine builds the item on the next sync, so select once it can.
    window.setTimeout(() => selectItem(item.id), 60)
  }

  const removeItem = React.useCallback(
    (id: string) => {
      change((s) => ({ ...s, items: s.items.filter((i) => i.id !== id) }))
      selectItem(null)
    },
    [change, selectItem]
  )

  const duplicateItem = (item: SetItem) => {
    const position: Vec3 = [
      item.position[0] + 0.5,
      item.position[1],
      item.position[2],
    ]
    addItem({
      ...structuredClone(item),
      id: itemId(),
      name: uniqueName(item.name, scene.items),
      position,
    })
  }

  const pick = (mode: GizmoMode) => {
    setMode(mode)
    engineRef.current?.setMode(mode)
  }

  const setStage = (stage: StageId) => {
    const mood = STAGE_MOODS[stage]
    change((s) => ({
      ...s,
      stage,
      stageColor: null,
      background: mood.background,
      fog: mood.fog,
      light: {
        ...s.light,
        ambient: mood.ambient,
        sun: mood.sun,
        sunColor: mood.sunColor,
        pitch: mood.pitch,
        yaw: mood.yaw,
      },
    }))
  }

  const captureImage = () => {
    const engine = engineRef.current
    if (!engine || !frame) return
    const s = OUTPUT_SIDE / Math.max(frame.width, frame.height)
    return engine.capture(
      frame,
      Math.round(frame.width * s),
      Math.round(frame.height * s),
      "image/jpeg"
    )
  }

  const captureGuide = () => {
    const engine = engineRef.current
    if (!engine || !frame) return
    const s = GUIDE_SIDE / Math.max(frame.width, frame.height)
    return engine.capture(
      frame,
      Math.round(frame.width * s),
      Math.round(frame.height * s),
      "image/png",
      "line"
    )
  }

  const use = (as: "image" | "guide") => {
    const src = as === "image" ? captureImage() : undefined
    const guide = as === "guide" ? captureGuide() : undefined
    if (!src && !guide) return
    onUse({ scene, src, guide, cast: castIn(scene) })
  }

  const saved = project.sets ?? []
  const saveSet = (name: string) => {
    if (saved.length >= MAX_SAVED_SETS) return
    const entry: SavedSet = { id: uid(), name, scene: cloneScene(scene) }
    editor.commitProject((p) => ({ ...p, sets: [...(p.sets ?? []), entry] }))
  }
  const loadSet = (source: SetScene) => {
    change(() => cloneScene(source))
    selectItem(null)
  }

  const uploadModel = async () => {
    const file = await pickFile(".vrm,.glb,.gltf")
    if (!file) return
    try {
      const model = await storeModel(file)
      if (/\.vrm$/i.test(file.name)) {
        addItem({
          ...createActor(FIGURES[0]!, uniqueName(model.name, scene.items)),
          model,
          pose: bodyPose(BODY_POSES[0]!),
          position: spawnSpot(scene),
        })
      } else {
        addItem(createModel(model))
      }
    } catch (error) {
      setNotice(t(error instanceof ModelTooLarge ? "tooLarge" : "badFile"))
    }
  }

  const uploadImage = async () => {
    const file = await pickFile("image/*")
    if (!file) return
    const src = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
    const img = new Image()
    img.src = src
    await img.decode()
    addItem(
      createImage(
        src,
        img.naturalHeight / img.naturalWidth,
        uniqueName(file.name.replace(/\.[^.]+$/, ""), scene.items)
      )
    )
  }

  const item = scene.items.find((i) => i.id === selected) ?? null

  const close = () => (dirty ? setClosing(true) : onClose())

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Tab" || e.key === "Escape") return
    // The editor underneath has its own shortcuts on the window.
    e.stopPropagation()
    const target = e.target as HTMLElement
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
    const command = e.metaKey || e.ctrlKey
    if (command && e.key.toLowerCase() === "z") {
      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
    } else if ((e.key === "Delete" || e.key === "Backspace") && selected) {
      e.preventDefault()
      removeItem(selected)
    } else if (!command && e.key.toLowerCase() === "t") pick("translate")
    else if (!command && e.key.toLowerCase() === "r") pick("rotate")
    else if (!command && e.key.toLowerCase() === "y") pick("scale")
    else if (!command && e.key.toLowerCase() === "f" && selected)
      engineRef.current?.frameOn(selected)
  }

  return (
    <Dialog
      isOpen
      isDismissable={false}
      isKeyboardDismissDisabled
      showCloseButton={false}
      onOpenChange={(open) => !open && close()}
      className="h-svh max-h-svh w-screen max-w-none gap-0 overflow-hidden rounded-none p-0 ring-0 sm:max-w-none"
    >
      <div
        className="grid h-svh grid-rows-[auto_minmax(0,1fr)]"
        onKeyDown={onKeyDown}
      >
        <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
          <DialogTitle className="me-2">{t("title")}</DialogTitle>
          <IconAction
            label={t("undo")}
            icon={ArrowTurnBackwardIcon}
            onPress={undo}
            isDisabled={!history.past.length}
          />
          <IconAction
            label={t("redo")}
            icon={ArrowTurnForwardIcon}
            onPress={redo}
            isDisabled={!history.future.length}
          />
          <div
            role="group"
            aria-label={t("look")}
            className="ms-2 flex gap-0.5"
          >
            {LOOKS.map((look) => (
              <Button
                key={look}
                size="sm"
                variant={scene.look === look ? "secondary" : "ghost"}
                aria-pressed={scene.look === look}
                onPress={() => change((s) => ({ ...s, look }))}
              >
                {t(`looks.${look}`)}
              </Button>
            ))}
          </div>
          <span className="flex-1" />
          <Button variant="ghost" size="sm" onPress={close}>
            {t("close")}
          </Button>
          <Button variant="outline" size="sm" onPress={() => use("guide")}>
            {t("useGuide")}
          </Button>
          <Button size="sm" onPress={() => use("image")}>
            {t("useImage")}
          </Button>
        </header>

        <div className="grid min-h-0 grid-cols-[minmax(0,1fr)] md:grid-cols-[15rem_minmax(0,1fr)_17rem]">
          <aside className="flex min-h-0 flex-col border-e max-md:order-2 max-md:h-44 max-md:border-t">
            <div className="flex flex-wrap gap-0.5 border-b p-1.5">
              {(["stage", "people", "props", "lights", "sets"] as const).map(
                (id) => (
                  <Button
                    key={id}
                    size="xs"
                    variant={tab === id ? "secondary" : "ghost"}
                    aria-pressed={tab === id}
                    onPress={() => setTab(id)}
                  >
                    {t(id)}
                  </Button>
                )
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {tab === "stage" && (
                <StageTab scene={scene} onStage={setStage} change={change} />
              )}
              {tab === "people" && (
                <PeopleTab
                  scene={scene}
                  cast={project.cast ?? []}
                  onAdd={addItem}
                  onUpload={uploadModel}
                />
              )}
              {tab === "props" && (
                <PropsTab
                  scene={scene}
                  onAdd={addItem}
                  onUploadModel={uploadModel}
                  onUploadImage={uploadImage}
                />
              )}
              {tab === "lights" && (
                <LightsTab scene={scene} change={change} onAdd={addItem} />
              )}
              {tab === "sets" && (
                <SetsTab
                  project={project}
                  panelId={panel.id}
                  onSave={saveSet}
                  onLoad={loadSet}
                />
              )}
            </div>
          </aside>

          <div className="relative min-h-0 overflow-hidden bg-black max-md:order-1">
            <div ref={hostRef} className="absolute inset-0" />
            {frame && (
              <div
                aria-hidden
                className="pointer-events-none absolute rounded-[1px] shadow-[0_0_0_100vmax_rgb(0_0_0/0.5)] ring-1 ring-white/70"
                style={{
                  left: frame.x,
                  top: frame.y,
                  width: frame.width,
                  height: frame.height,
                }}
              />
            )}
            {broken && (
              <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white">
                {t("webgl")}
              </p>
            )}
            {notice && (
              <p
                role="status"
                className="absolute inset-x-3 top-3 w-fit rounded-md bg-black/75 px-3 py-1.5 text-xs text-white"
              >
                {notice}
              </p>
            )}
            <p className="pointer-events-none absolute start-3 bottom-2 max-w-[70%] text-xs text-white/70 max-md:hidden">
              {t("dragHint")}
            </p>
          </div>

          <aside className="flex min-h-0 flex-col border-s max-md:hidden">
            <ItemList scene={scene} selected={selected} onSelect={selectItem} />
            <div className="min-h-0 flex-1 overflow-y-auto border-t p-3">
              {item ? (
                <ItemPanel
                  item={item}
                  scene={scene}
                  cast={project.cast ?? []}
                  mode={mode}
                  onMode={pick}
                  patch={(p, group) => patchItem(item.id, p, group)}
                  onRemove={() => removeItem(item.id)}
                  onDuplicate={() => duplicateItem(item)}
                  onFrame={() => engineRef.current?.frameOn(item.id)}
                  onFace={() => engineRef.current?.frameFace(item.id)}
                />
              ) : (
                <ScenePanel scene={scene} change={change} />
              )}
            </div>
          </aside>
        </div>
      </div>

      {closing && (
        <Dialog
          isOpen
          onOpenChange={(open) => !open && setClosing(false)}
          showCloseButton={false}
        >
          <div className="flex flex-col gap-3">
            <DialogTitle>{t("discard")}</DialogTitle>
            <p className="text-muted-foreground">{t("discardHint")}</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onPress={() => setClosing(false)}>
                {t("keep")}
              </Button>
              <Button variant="destructive" onPress={onClose}>
                {t("close")}
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </Dialog>
  )
}

// New people stand either side of those already there, not inside them.
function spawnSpot(scene: SetScene): Vec3 {
  const n = scene.items.filter((i) => i.kind === "actor").length
  return [(n % 2 ? 1 : -1) * Math.ceil(n / 2) * 0.9, 0, 0]
}

function fitFrame(host: HTMLElement, aspect: number): Frame {
  const pad = 20
  const maxW = Math.max(1, host.clientWidth - pad * 2)
  const maxH = Math.max(1, host.clientHeight - pad * 2)
  const width = Math.min(maxW, maxH * aspect)
  const height = width / aspect
  return {
    x: (host.clientWidth - width) / 2,
    y: (host.clientHeight - height) / 2,
    width,
    height,
  }
}

function IconAction({
  label,
  icon,
  onPress,
  isDisabled,
  pressed,
}: {
  label: string
  icon: typeof Copy01Icon
  onPress: () => void
  isDisabled?: boolean
  pressed?: boolean
}) {
  return (
    <TooltipTrigger>
      <Button
        size="icon-sm"
        variant={pressed ? "secondary" : "ghost"}
        aria-label={label}
        aria-pressed={pressed}
        onPress={onPress}
        isDisabled={isDisabled}
      >
        <HugeiconsIcon icon={icon} strokeWidth={2} />
      </Button>
      <Tooltip>{label}</Tooltip>
    </TooltipTrigger>
  )
}

function Tile({
  label,
  onPress,
  active,
  image,
}: {
  label: string
  onPress: () => void
  active?: boolean
  image?: string
}) {
  return (
    <Button
      variant={active ? "secondary" : "outline"}
      onPress={onPress}
      aria-pressed={active}
      aria-label={label}
      className={cn(
        "h-auto min-h-8 min-w-0 justify-start px-2 py-1.5 text-start text-xs whitespace-normal",
        image && "flex-col items-center gap-1 text-center"
      )}
    >
      {image && <img src={image} alt="" className="size-14 object-contain" />}
      <span className="min-w-0">{label}</span>
    </Button>
  )
}

function StageTab({
  scene,
  onStage,
  change,
}: {
  scene: SetScene
  onStage: (stage: StageId) => void
  change: (fn: (s: SetScene) => SetScene, group?: string) => void
}) {
  const t = useT(messages)
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-1.5">
        {STAGE_IDS.map((id) => (
          <Tile
            key={id}
            label={t(`stages.${id}`)}
            active={scene.stage === id}
            onPress={() => onStage(id)}
          />
        ))}
      </div>
      <Row label={t("stageTint")}>
        <ColorInput
          aria-label={t("stageTint")}
          value={scene.stageColor ?? "#cccccc"}
          onChange={(stageColor) =>
            change((s) => ({ ...s, stageColor }), "stage-color")
          }
        />
      </Row>
      <Row label={t("background")}>
        <ColorInput
          aria-label={t("background")}
          value={scene.background}
          onChange={(background) =>
            change((s) => ({ ...s, background }), "background")
          }
        />
      </Row>
      <SliderInput
        label={t("fog")}
        min={0}
        max={80}
        value={Math.round(scene.fog * 1000)}
        onChange={(v) => change((s) => ({ ...s, fog: v / 1000 }), "fog")}
      />
    </div>
  )
}

function PeopleTab({
  scene,
  cast,
  onAdd,
  onUpload,
}: {
  scene: SetScene
  cast: Character[]
  onAdd: (item: SetItem) => void
  onUpload: () => void
}) {
  const t = useT(messages)
  const addFigure = (index: number, name?: string, castId?: string) => {
    const figures = scene.items.filter((i) => i.kind === "actor").length
    const actor = createActor(
      FIGURES[index % FIGURES.length]!,
      uniqueName(name ?? t("figure", { n: figures + 1 }), scene.items)
    )
    onAdd({
      ...actor,
      castId,
      pose: bodyPose(BODY_POSES[0]!),
      position: spawnSpot(scene),
    })
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-1.5">
        {FIGURES.map((figure, i) => (
          <Button
            key={i}
            variant="outline"
            className="h-12 gap-1.5 px-2"
            aria-label={t("figure", { n: i + 1 })}
            onPress={() => addFigure(i)}
          >
            <span
              className="size-4 rounded-full ring-1 ring-foreground/20"
              style={{ background: figure.skin }}
            />
            <span
              className="h-5 w-3 rounded-sm"
              style={{ background: figure.top }}
            />
            <span
              className="h-5 w-3 rounded-sm"
              style={{ background: figure.bottom }}
            />
          </Button>
        ))}
        <Button variant="outline" className="h-12" onPress={onUpload}>
          {t("upload")}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("uploadModel")}</p>
      <section className="flex flex-col gap-1.5">
        <h3 className="text-xs font-medium text-muted-foreground">
          {t("cast")}
        </h3>
        {cast.length === 0 && (
          <p className="text-xs text-muted-foreground">{t("noCast")}</p>
        )}
        {cast.map((character, i) => (
          <Tile
            key={character.id}
            label={character.name}
            onPress={() => addFigure(i, character.name, character.id)}
          />
        ))}
      </section>
    </div>
  )
}

function PropsTab({
  scene,
  onAdd,
  onUploadModel,
  onUploadImage,
}: {
  scene: SetScene
  onAdd: (item: SetItem) => void
  onUploadModel: () => void
  onUploadImage: () => void
}) {
  const t = useT(messages)
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-1.5">
        <Tile label={t("uploadModel")} onPress={onUploadModel} />
        <Tile label={t("uploadImage")} onPress={onUploadImage} />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {PROP_IDS.map((id) => (
          <Tile
            key={id}
            label={t(`propNames.${id}`)}
            onPress={() =>
              onAdd(
                createProp(id, uniqueName(t(`propNames.${id}`), scene.items))
              )
            }
          />
        ))}
      </div>
    </div>
  )
}

function LightsTab({
  scene,
  change,
  onAdd,
}: {
  scene: SetScene
  change: (fn: (s: SetScene) => SetScene, group?: string) => void
  onAdd: (item: SetItem) => void
}) {
  const t = useT(messages)
  const light = scene.light
  const set = (patch: Partial<SetScene["light"]>, group: string) =>
    change((s) => ({ ...s, light: { ...s.light, ...patch } }), group)
  return (
    <div className="flex flex-col gap-2.5">
      <Button
        variant="outline"
        size="sm"
        onPress={() => onAdd(createLamp(uniqueName(t("lamp"), scene.items)))}
      >
        {t("lamp")}
      </Button>
      <SliderInput
        label={t("ambient")}
        min={0}
        max={300}
        value={Math.round(light.ambient * 100)}
        onChange={(v) => set({ ambient: v / 100 }, "ambient")}
      />
      <Row label={t("color")}>
        <ColorInput
          aria-label={t("ambient")}
          value={light.ambientColor}
          onChange={(ambientColor) => set({ ambientColor }, "ambient-color")}
        />
      </Row>
      <SliderInput
        label={t("sun")}
        min={0}
        max={500}
        value={Math.round(light.sun * 100)}
        onChange={(v) => set({ sun: v / 100 }, "sun")}
      />
      <Row label={t("color")}>
        <ColorInput
          aria-label={t("sun")}
          value={light.sunColor}
          onChange={(sunColor) => set({ sunColor }, "sun-color")}
        />
      </Row>
      <SliderInput
        label={t("pitch")}
        min={2}
        max={89}
        value={light.pitch}
        onChange={(pitch) => set({ pitch }, "pitch")}
      />
      <SliderInput
        label={t("yaw")}
        min={-180}
        max={180}
        value={light.yaw}
        onChange={(yaw) => set({ yaw }, "yaw")}
      />
      <Row label={t("shadows")}>
        <Switch
          aria-label={t("shadows")}
          isSelected={light.shadows}
          onChange={(shadows) => set({ shadows }, "shadows")}
        />
      </Row>
    </div>
  )
}

function SetsTab({
  project,
  panelId,
  onSave,
  onLoad,
}: {
  project: ComicProject
  panelId: string
  onSave: (name: string) => void
  onLoad: (scene: SetScene) => void
}) {
  const t = useT(messages)
  const [name, setName] = React.useState("")
  const others = project.pages.flatMap((page) =>
    page.layers.flatMap((layer) =>
      layer.type === "panel" && layer.set && layer.id !== panelId ? [layer] : []
    )
  )
  const saved = project.sets ?? []
  const full = saved.length >= MAX_SAVED_SETS
  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim() || full) return
          onSave(name.trim())
          setName("")
        }}
      >
        <Input
          aria-label={t("setName")}
          placeholder={t("setName")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" size="sm" isDisabled={!name.trim() || full}>
          {t("save")}
        </Button>
      </form>
      {saved.length + others.length === 0 && (
        <p className="text-xs text-muted-foreground">{t("noSets")}</p>
      )}
      <div className="flex flex-col gap-1.5">
        {saved.map((s) => (
          <Tile key={s.id} label={s.name} onPress={() => onLoad(s.scene)} />
        ))}
        {others.map((layer, i) => (
          <Tile
            key={layer.id}
            label={t("fromPanel", { n: i + 1 })}
            onPress={() => onLoad(layer.set!)}
          />
        ))}
      </div>
    </div>
  )
}

function ItemList({
  scene,
  selected,
  onSelect,
}: {
  scene: SetScene
  selected: string | null
  onSelect: (id: string | null) => void
}) {
  const t = useT(messages)
  return (
    <div className="max-h-52 shrink-0 overflow-y-auto p-2">
      <Button
        size="xs"
        variant={selected ? "ghost" : "secondary"}
        className="w-full justify-start"
        onPress={() => onSelect(null)}
      >
        {t("scene")}
      </Button>
      <ul aria-label={t("items")} className="mt-0.5 flex flex-col gap-0.5">
        {scene.items.map((item) => (
          <li key={item.id}>
            <Button
              size="xs"
              variant={item.id === selected ? "secondary" : "ghost"}
              className="w-full justify-start ps-4"
              onPress={() => onSelect(item.id)}
            >
              <span className="truncate">{item.name}</span>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ScenePanel({
  scene,
  change,
}: {
  scene: SetScene
  change: (fn: (s: SetScene) => SetScene, group?: string) => void
}) {
  const t = useT(messages)
  const camera = scene.camera
  return (
    <div className="flex flex-col gap-2.5">
      <h3 className="text-xs font-medium text-muted-foreground">
        {t("camera")}
      </h3>
      <SliderInput
        label={t("lens")}
        min={10}
        max={90}
        suffix="°"
        value={Math.round(camera.fov)}
        onChange={(fov) =>
          change((s) => ({ ...s, camera: { ...s.camera, fov } }), "fov")
        }
      />
      <SliderInput
        label={t("roll")}
        min={-30}
        max={30}
        suffix="°"
        value={camera.roll}
        onChange={(roll) =>
          change((s) => ({ ...s, camera: { ...s.camera, roll } }), "roll")
        }
      />
      <h3 className="mt-1 text-xs font-medium text-muted-foreground">
        {t("look")}
      </h3>
      <SliderInput
        label={t("ink")}
        min={1}
        max={6}
        step={0.5}
        value={scene.ink}
        onChange={(ink) => change((s) => ({ ...s, ink }), "ink")}
      />
    </div>
  )
}

function ItemPanel({
  item,
  scene,
  cast,
  mode,
  onMode,
  patch,
  onRemove,
  onDuplicate,
  onFrame,
  onFace,
}: {
  item: SetItem
  scene: SetScene
  cast: Character[]
  mode: GizmoMode
  onMode: (mode: GizmoMode) => void
  patch: (p: Partial<SetItem>, group?: string) => void
  onRemove: () => void
  onDuplicate: () => void
  onFrame: () => void
  onFace: () => void
}) {
  const t = useT(messages)
  return (
    <div className="flex flex-col gap-3">
      <Input
        aria-label={t("setName")}
        value={item.name}
        onChange={(e) => patch({ name: e.target.value }, `name-${item.id}`)}
      />
      <div className="flex items-center gap-0.5">
        <IconAction
          label={t("move")}
          icon={Move01Icon}
          pressed={mode === "translate"}
          onPress={() => onMode("translate")}
        />
        <IconAction
          label={t("rotate")}
          icon={ReloadIcon}
          pressed={mode === "rotate"}
          onPress={() => onMode("rotate")}
        />
        <IconAction
          label={t("scale")}
          icon={ResizeFieldIcon}
          pressed={mode === "scale"}
          onPress={() => onMode("scale")}
        />
        <span className="flex-1" />
        <IconAction label={t("center")} icon={ViewIcon} onPress={onFrame} />
        <IconAction
          label={t("duplicate")}
          icon={Copy01Icon}
          onPress={onDuplicate}
        />
        <IconAction
          label={t("remove")}
          icon={Delete02Icon}
          onPress={onRemove}
        />
      </div>
      {item.kind === "actor" && (
        <ActorPanel actor={item} cast={cast} patch={patch} onFace={onFace} />
      )}
      {item.kind === "prop" && (
        <Row label={t("tint")}>
          <ColorInput
            aria-label={t("tint")}
            value={item.color}
            onChange={(color) => patch({ color }, `color-${item.id}`)}
          />
        </Row>
      )}
      {item.kind === "image" && (
        <Row label={t("billboard")}>
          <Switch
            aria-label={t("billboard")}
            isSelected={item.billboard}
            onChange={(billboard) => patch({ billboard })}
          />
        </Row>
      )}
      {item.kind === "lamp" && <LampPanel lamp={item} patch={patch} />}
      <Vectors item={item} scene={scene} patch={patch} />
    </div>
  )
}

function LampPanel({
  lamp,
  patch,
}: {
  lamp: LampItem
  patch: (p: Partial<SetItem>, group?: string) => void
}) {
  const t = useT(messages)
  return (
    <>
      <Row label={t("color")}>
        <ColorInput
          aria-label={t("color")}
          value={lamp.color}
          onChange={(color) => patch({ color }, `color-${lamp.id}`)}
        />
      </Row>
      <SliderInput
        label={t("power")}
        min={0}
        max={60}
        value={lamp.intensity}
        onChange={(intensity) => patch({ intensity }, `power-${lamp.id}`)}
      />
      <SliderInput
        label={t("distance")}
        min={1}
        max={30}
        value={lamp.distance}
        onChange={(distance) => patch({ distance }, `reach-${lamp.id}`)}
      />
    </>
  )
}

function Vectors({
  item,
  patch,
}: {
  item: SetItem
  scene: SetScene
  patch: (p: Partial<SetItem>, group?: string) => void
}) {
  const t = useT(messages)
  const rows = [
    ["position", item.position, 0.05],
    ["rotation", item.rotation, 1],
    ["scale", item.scale, 0.05],
  ] as const
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map(([key, value, step]) => (
        <div key={key} className="grid grid-cols-[4.5rem_1fr_1fr_1fr] gap-1">
          <span className="self-center truncate text-xs text-muted-foreground">
            {t(key === "scale" ? "size" : key)}
          </span>
          {value.map((n, i) => (
            <Input
              key={i}
              type="number"
              step={step}
              aria-label={`${t(key === "scale" ? "size" : key)} ${"XYZ"[i]}`}
              className="h-7 px-1 text-xs"
              value={n}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (!Number.isFinite(v)) return
                const next = [...value] as Vec3
                next[i] = v
                patch({ [key]: next } as Partial<SetItem>, `${key}-${item.id}`)
              }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function ActorPanel({
  actor,
  cast,
  patch,
  onFace,
}: {
  actor: ActorItem
  cast: Character[]
  patch: (p: Partial<SetItem>, group?: string) => void
  onFace: () => void
}) {
  const t = useT(messages)
  const [tab, setTab] = React.useState<ActorTab>("body")
  const set = patch as (p: Partial<ActorItem>, group?: string) => void
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex gap-0.5">
        {(
          [
            ["body", t("body")],
            ["hands", t("hands")],
            ["face", t("expression")],
            ["outfit", t("outfit")],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            size="xs"
            variant={tab === id ? "secondary" : "ghost"}
            aria-pressed={tab === id}
            onPress={() => {
              setTab(id)
              if (id === "face") onFace()
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      {tab === "body" && <BodyTab actor={actor} set={set} />}
      {tab === "hands" && <HandsTab actor={actor} set={set} />}
      {tab === "face" && <FaceTab actor={actor} set={set} />}
      {tab === "outfit" && <OutfitTab actor={actor} cast={cast} set={set} />}
    </div>
  )
}

let thumbnails: Record<string, string> | null = null

function BodyTab({
  actor,
  set,
}: {
  actor: ActorItem
  set: (p: Partial<ActorItem>, group?: string) => void
}) {
  const t = useT(messages)
  const [images] = React.useState(() => {
    try {
      thumbnails ??= poseThumbnails()
    } catch {
      thumbnails = {}
    }
    return thumbnails
  })
  return (
    <>
      <div className="flex gap-1">
        <Button
          size="xs"
          variant="outline"
          onPress={() => set({ pose: mirrorPose(actor.pose) })}
        >
          {t("mirror")}
        </Button>
        <Button
          size="xs"
          variant="outline"
          onPress={() =>
            set({
              pose: Object.fromEntries(
                Object.entries(actor.pose).filter(([b]) => isFinger(b))
              ),
              hipsDrop: 0,
            })
          }
        >
          {t("resetPose")}
        </Button>
      </div>
      {POSE_CATEGORIES.map((category) => (
        <section key={category} className="flex flex-col gap-1.5">
          <h4 className="text-xs font-medium text-muted-foreground">
            {t(`categories.${category}`)}
          </h4>
          <div className="grid grid-cols-3 gap-1">
            {BODY_POSES.filter((p) => p.category === category).map((p) => (
              <Tile
                key={p.id}
                label={t(`poses.${p.id}` as `poses.stand`)}
                image={images[p.id]}
                onPress={() =>
                  set({ pose: bodyPose(p, actor.pose), hipsDrop: p.drop })
                }
              />
            ))}
          </div>
        </section>
      ))}
    </>
  )
}

function HandsTab({
  actor,
  set,
}: {
  actor: ActorItem
  set: (p: Partial<ActorItem>, group?: string) => void
}) {
  const t = useT(messages)
  return (
    <>
      {(["left", "right"] as const).map((side) => (
        <section key={side} className="flex flex-col gap-1.5">
          <h4 className="text-xs font-medium text-muted-foreground">
            {t(side)}
          </h4>
          <div className="grid grid-cols-2 gap-1">
            {HAND_POSE_IDS.map((id) => (
              <Tile
                key={id}
                label={t(`handPoses.${id}`)}
                onPress={() => set({ pose: handPose(id, side, actor.pose) })}
              />
            ))}
          </div>
        </section>
      ))}
    </>
  )
}

function FaceTab({
  actor,
  set,
}: {
  actor: ActorItem
  set: (p: Partial<ActorItem>, group?: string) => void
}) {
  const t = useT(messages)
  const [sliders, setSliders] = React.useState(false)
  return (
    <>
      <div className="flex gap-1">
        <Button
          size="xs"
          variant={sliders ? "ghost" : "secondary"}
          onPress={() => setSliders(false)}
        >
          {t("presets")}
        </Button>
        <Button
          size="xs"
          variant={sliders ? "secondary" : "ghost"}
          onPress={() => setSliders(true)}
        >
          {t("sliders")}
        </Button>
      </div>
      {!sliders &&
        MOODS.map((mood) => (
          <section key={mood} className="flex flex-col gap-1.5">
            <h4 className="text-xs font-medium text-muted-foreground">
              {t(`moods.${mood}`)}
            </h4>
            <div className="grid grid-cols-2 gap-1">
              {EXPRESSION_PRESETS.filter((p) => p.mood === mood).map((p) => (
                <Tile
                  key={p.id}
                  label={t(`expressions.${p.id}` as `expressions.calm`)}
                  onPress={() => set({ expression: { ...p.weights } })}
                />
              ))}
            </div>
          </section>
        ))}
      {sliders &&
        EXPRESSION_KEYS.map((key) => (
          <SliderInput
            key={key}
            label={t(`expressionKeys.${key}`)}
            min={0}
            max={100}
            value={Math.round((actor.expression[key] ?? 0) * 100)}
            onChange={(v) =>
              set(
                { expression: { ...actor.expression, [key]: v / 100 } },
                `face-${key}`
              )
            }
          />
        ))}
      <h4 className="text-xs font-medium text-muted-foreground">{t("gaze")}</h4>
      <SliderInput
        label={t("gazeYaw")}
        min={-30}
        max={30}
        value={actor.gaze[0]}
        onChange={(yaw) => set({ gaze: [yaw, actor.gaze[1]] }, "gaze-yaw")}
      />
      <SliderInput
        label={t("gazePitch")}
        min={-25}
        max={25}
        value={actor.gaze[1]}
        onChange={(pitch) =>
          set({ gaze: [actor.gaze[0], pitch] }, "gaze-pitch")
        }
      />
    </>
  )
}

const HAIR: HairStyle[] = ["none", "short", "bob", "long", "spiky"]
const BUILDS: Build[] = ["slim", "average", "broad"]

function OutfitTab({
  actor,
  cast,
  set,
}: {
  actor: ActorItem
  cast: Character[]
  set: (p: Partial<ActorItem>, group?: string) => void
}) {
  const t = useT(messages)
  const look = actor.figure
  const figure = (patch: Partial<ActorItem["figure"]>, group?: string) =>
    set({ figure: { ...look, ...patch } }, group)
  return (
    <>
      <Row label={t("cast")}>
        <NativeSelect
          size="sm"
          className="w-full"
          aria-label={t("cast")}
          value={actor.castId ?? ""}
          onChange={(e) => set({ castId: e.target.value || undefined })}
        >
          <NativeSelectOption value="">—</NativeSelectOption>
          {cast.map((c) => (
            <NativeSelectOption key={c.id} value={c.id}>
              {c.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Row>
      {actor.model ? null : (
        <>
          {(["skin", "hair", "top", "bottom", "shoes"] as const).map((key) => (
            <Row key={key} label={t(key)}>
              <ColorInput
                aria-label={t(key)}
                value={look[key]}
                onChange={(value) => figure({ [key]: value }, `fig-${key}`)}
              />
            </Row>
          ))}
          <Row label={t("hair")}>
            <NativeSelect
              size="sm"
              className="w-full"
              aria-label={t("hair")}
              value={look.hairStyle}
              onChange={(e) =>
                figure({ hairStyle: e.target.value as HairStyle })
              }
            >
              {HAIR.map((id) => (
                <NativeSelectOption key={id} value={id}>
                  {t(`hairStyles.${id}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Row>
          <Row label={t("build")}>
            <NativeSelect
              size="sm"
              className="w-full"
              aria-label={t("build")}
              value={look.build}
              onChange={(e) => figure({ build: e.target.value as Build })}
            >
              {BUILDS.map((id) => (
                <NativeSelectOption key={id} value={id}>
                  {t(`builds.${id}`)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Row>
          <SliderInput
            label={t("height")}
            min={120}
            max={210}
            suffix=" cm"
            value={Math.round(look.height * 100)}
            onChange={(v) => figure({ height: v / 100 }, "fig-height")}
          />
        </>
      )}
    </>
  )
}
