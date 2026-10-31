import * as React from "react"
import { Link, useNavigate } from "react-router"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft01Icon,
  DiceIcon,
  MagicWand01Icon,
  SparklesIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"

import { Button, buttonVariants } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Spinner } from "@workspace/ui/components/spinner"
import { Switch } from "@workspace/ui/components/switch"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"

import { CreditsPill } from "@/components/account/credits-pill"
import { AccountMenu, useOpenRouter } from "@/components/account/account-menu"
import { Logo } from "@/components/auth/auth-ui"
import { STYLE_CARDS } from "@/components/comic-canvas/look"
import {
  DEFAULT_LOOK,
  type Look,
  type StyleId,
} from "@/components/comic-canvas/model"
import { randomSeed, render } from "@/components/comic-canvas/use-generator"
import { useT } from "@/i18n/core"
import { uploadDataUrl } from "@/lib/cloud"
import { COSTS } from "@/lib/credits"
import { INSUFFICIENT_CREDITS, useCredits } from "@/lib/credits-store"
import { useSupabase } from "@/lib/supabase.browser"

import { SfxArt } from "./card"
import { messages } from "./catalog.messages"
import { catalogRequest, polishIdea } from "./client"
import { GROUP_ICONS, KIND_ICONS } from "./icons"
import {
  GENRES,
  GROUPS,
  RATIO,
  dominantColor,
  type Asset,
  type AssetGroup,
  type AssetKind,
  type AssetPayload,
  type Genre,
} from "./model"
import { animaAssetPrompt, renderSizeOf, sheetPrompt } from "./prompts"

const VARIATIONS = ["1", "2", "4"] as const

// Where "surprise me" starts from. Rough on purpose: polishing does the rest.
const SPARKS: Partial<Record<AssetKind, string[]>> = {
  character: [
    "retired stuntwoman who now runs a ferry",
    "tired royal cartographer with ink-stained hands",
    "hacker grandmother in a neon raincoat",
    "lighthouse keeper with a brass prosthetic arm",
  ],
  creature: [
    "moss-covered stone giant who sleeps under a bridge",
    "glass jellyfish that drifts through city streets",
    "many-eyed crow made of smoke",
  ],
  outfit: ["desert courier wraps and goggles", "1970s disco detective suit"],
  location: [
    "flooded subway station turned into a night market",
    "floating monastery tied to the ground by chains",
    "laundromat at the end of the universe",
  ],
  background: ["crumpled newspaper texture", "aurora over black mountains"],
  prop: ["music box that plays tomorrow's news", "cracked astrolabe"],
  style: ["1960s spy poster, three inks", "chalk on a blackboard"],
  shot: ["seen through a keyhole", "reflected in a puddle"],
  lighting: ["police lights through rain", "one match in a dark cellar"],
  pose: ["back against a door, listening"],
  effect: ["ink dripping up the page"],
  sfx: ["SKREEE", "tmp tmp tmp", "FWOOM"],
  story: ["two rival bakers discover they're the same person"],
}

const NO_RENDER: AssetKind[] = ["sfx"]
const SHEETED: AssetKind[] = ["character", "creature"]

interface Take {
  src: string | null
  model?: string
  failed?: boolean
}

// Which swatch an image reads as, for the catalog's colour filter.
async function colorOf(src: string) {
  const img = new Image()
  img.src = src
  await img.decode()
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = 32
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, 32, 32)
  return dominantColor(ctx.getImageData(0, 0, 32, 32).data, 4)
}

function payloadFor(
  kind: AssetKind,
  tags: string[],
  idea: string,
  look: Look,
  name: string,
  sheet: string | null,
  sheetModel: string | undefined,
  who: "girl" | "boy" | "other"
): AssetPayload {
  switch (kind) {
    case "character":
    case "creature":
      return {
        type: "character",
        character: kind === "creature" ? "other" : who,
        tags,
        ...(sheet && { sheet, sheetModel }),
      }
    case "location":
    case "prop":
      return { type: "world", world: kind, tags }
    case "outfit":
      return { type: "outfit", tags }
    case "background":
      return { type: "backdrop", tags }
    case "style":
      return {
        type: "look",
        look: { style: look.style, palette: null, saturation: look.saturation },
        recipe: {
          name,
          tags: tags.join(", "),
          prose: idea,
          negative: "",
        },
      }
    case "sfx":
      return {
        type: "sfx",
        text: idea,
        font: "bangers",
        color: "#facc15",
        strokeColor: "#111111",
      }
    case "story":
      return { type: "story", brief: idea }
    default:
      return { type: "direction", tags, prompt: idea }
  }
}

function initialIdea(remix: Asset | null) {
  if (!remix) return ""
  const p = remix.payload
  if (p.type === "story") return p.brief
  if (p.type === "sfx") return p.text
  if (p.type === "look") return p.recipe?.prose ?? ""
  return "tags" in p ? p.tags.join(", ") : ""
}

export function CreateAsset({
  userId,
  kind: initialKind,
  remix,
}: {
  userId: string
  kind: AssetKind
  remix: Asset | null
}) {
  const t = useT(messages)
  const supabase = useSupabase()
  const navigate = useNavigate()
  const balance = useCredits()
  const openrouter = useOpenRouter()

  const [kind, setKind] = React.useState(initialKind)
  const [idea, setIdea] = React.useState(() => initialIdea(remix))
  const [style, setStyle] = React.useState<StyleId>(DEFAULT_LOOK.style)
  const [count, setCount] = React.useState<(typeof VARIATIONS)[number]>("2")
  const [takes, setTakes] = React.useState<Take[]>([])
  const [picked, setPicked] = React.useState<number | null>(null)
  const [sheet, setSheet] = React.useState<string | null>(null)
  const [sheetModel, setSheetModel] = React.useState<string>()
  const [name, setName] = React.useState(remix ? `${remix.name} II` : "")
  const [description, setDescription] = React.useState("")
  const [tagText, setTagText] = React.useState("")
  const [genres, setGenres] = React.useState<Genre[]>(remix?.genres ?? [])
  const [who, setWho] = React.useState<"girl" | "boy" | "other">("girl")
  const [isPublic, setIsPublic] = React.useState(true)
  const [busy, setBusy] = React.useState<
    "polish" | "draw" | "sheet" | "save" | null
  >(null)
  const [error, setError] = React.useState<string | null>(null)
  const controller = React.useRef<AbortController>(undefined)
  React.useEffect(() => () => controller.current?.abort(), [])

  const look: Look = { ...DEFAULT_LOOK, style }
  const renders = !NO_RENDER.includes(kind)
  const words = tagText.trim() || idea.trim()
  const tags = tagText
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
  const image = picked !== null ? (takes[picked]?.src ?? null) : null
  const cost = Number(count) * COSTS.panel
  const short = !openrouter && balance !== null && balance < cost
  const shown = (e: unknown) => {
    const message = e instanceof Error ? e.message : String(e)
    setError(message === INSUFFICIENT_CREDITS ? t("create.short") : message)
  }

  const choose = (next: AssetKind) => {
    setKind(next)
    setTakes([])
    setPicked(null)
    setSheet(null)
  }

  const surprise = () => {
    const list = SPARKS[kind] ?? []
    const others = list.filter((s) => s !== idea)
    setIdea(others[Math.floor(Math.random() * others.length)] ?? "")
  }

  const polish = async () => {
    setBusy("polish")
    setError(null)
    try {
      const out = await polishIdea(kind, idea.trim())
      setName(out.name)
      setDescription(out.description)
      setTagText(out.tags.join(", "))
      setGenres(out.genres as Genre[])
    } catch (e) {
      shown(e)
    } finally {
      setBusy(null)
    }
  }

  const draw = async () => {
    const current = new AbortController()
    controller.current = current
    const n = Number(count)
    setBusy("draw")
    setError(null)
    setPicked(null)
    setSheet(null)
    setTakes(Array.from({ length: n }, () => ({ src: null })))
    // One at a time: a shared render queue gives nothing to parallel takes.
    for (let i = 0; i < n; i++) {
      try {
        const { src, model } = await render(
          {
            ...animaAssetPrompt(kind, words, look),
            ...renderSizeOf(RATIO[kind]),
            seed: randomSeed(),
            steps: 8,
          },
          current.signal
        )
        setTakes((all) => all.map((x, j) => (j === i ? { src, model } : x)))
        setPicked((p) => p ?? i)
      } catch (e) {
        setTakes((all) =>
          all.map((x, j) => (j === i ? { src: null, failed: true } : x))
        )
        if (!current.signal.aborted) shown(e)
        // Out of credits stays out of credits for the next take too.
        if ((e as Error).message === INSUFFICIENT_CREDITS) break
      }
    }
    setBusy(null)
  }

  const lockSheet = async () => {
    if (!image) return
    setBusy("sheet")
    setError(null)
    try {
      const { src, model } = await render({
        prompt: sheetPrompt(
          kind === "creature" ? "creature" : "person",
          words,
          look
        ),
        negative: "",
        width: 1536,
        height: 1024,
        seed: randomSeed(),
        steps: 4,
        engine: "klein",
        refs: [image],
      })
      setSheet(src)
      setSheetModel(model)
    } catch (e) {
      shown(e)
    } finally {
      setBusy(null)
    }
  }

  const save = async () => {
    setBusy("save")
    setError(null)
    try {
      const stored = async (src: string | null) =>
        src?.startsWith("data:") ? uploadDataUrl(supabase, userId, src) : src
      const [imageUrl, sheetUrl] = await Promise.all([
        stored(image),
        stored(sheet),
      ])
      const { id } = await catalogRequest({
        intent: "create",
        draft: {
          kind,
          name,
          description,
          genres,
          color: image ? await colorOf(image) : null,
          image: imageUrl,
          model: picked !== null ? takes[picked]?.model : null,
          payload: payloadFor(
            kind,
            tags.length ? tags : [idea.trim()],
            idea.trim(),
            look,
            name.trim(),
            sheetUrl,
            sheetModel,
            who
          ),
          isPublic,
        },
      })
      navigate(`/catalog/${id}`)
    } catch (e) {
      shown(e)
      setBusy(null)
    }
  }

  const canSave =
    !!name.trim() && !!idea.trim() && (renders ? !!image : true) && !busy

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="flex h-14 items-center justify-between gap-2 border-b px-3 sm:px-4">
        <div className="flex items-center gap-3">
          <Logo />
          <Link
            to="/catalog"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
            {t("create.back")}
          </Link>
        </div>
        <AccountMenu />
      </header>

      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-6 p-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-8 lg:p-6">
        <section className="flex flex-col gap-5 lg:sticky lg:top-6 lg:self-start">
          <div>
            <h1 className="studio-title text-3xl">
              {t("create.title")}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("create.subtitle")}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            {(Object.keys(GROUPS) as AssetGroup[])
              .filter((g) => g !== "comics")
              .map((group) => (
                <div key={group} className="flex items-start gap-2">
                  <span
                    title={t(`groups.${group}`)}
                    className="flex h-8 w-6 shrink-0 items-center justify-center text-muted-foreground"
                  >
                    <HugeiconsIcon
                      icon={GROUP_ICONS[group]}
                      strokeWidth={2}
                      className="size-4"
                    />
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {GROUPS[group].map((k) => (
                      <button
                        key={k}
                        type="button"
                        aria-pressed={kind === k}
                        className={cn(
                          "flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60",
                          kind === k &&
                            "border-foreground bg-foreground text-background hover:bg-foreground/90"
                        )}
                        onClick={() => choose(k)}
                      >
                        <HugeiconsIcon
                          icon={KIND_ICONS[k]}
                          strokeWidth={2}
                          className="size-3.5"
                        />
                        {t(`kinds.${k}`)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="idea" className="text-sm font-medium">
                {t(kind === "sfx" ? "create.lettering" : "create.idea")}
              </label>
              <Button variant="ghost" size="sm" onPress={surprise}>
                <HugeiconsIcon
                  icon={DiceIcon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {t("create.surprise")}
              </Button>
            </div>
            <Textarea
              id="idea"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder={t("create.ideaPlaceholder")}
              maxLength={kind === "sfx" ? 24 : 600}
              className="min-h-24"
            />
            {kind !== "sfx" && (
              <Button
                variant="outline"
                className="justify-start"
                isDisabled={!idea.trim() || !!busy}
                onPress={() => void polish()}
              >
                {busy === "polish" ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <HugeiconsIcon
                    icon={MagicWand01Icon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                )}
                {t("create.polish")}
                {openrouter ? (
                  <span className="ms-auto text-xs text-muted-foreground">
                    {t("create.onOpenRouter")}
                  </span>
                ) : (
                  <CreditsPill className="ms-auto">
                    {t("create.credits", { count: COSTS.asset_idea })}
                  </CreditsPill>
                )}
              </Button>
            )}
          </div>

          {renders && (
            <>
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">{t("create.style")}</span>
                <div className="grid grid-cols-6 gap-1.5">
                  {STYLE_CARDS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={style === s}
                      aria-label={s}
                      title={s}
                      className={cn(
                        "aspect-square cursor-pointer overflow-hidden rounded-lg ring-1 ring-foreground/10 transition-shadow outline-none hover:ring-foreground/40 focus-visible:ring-3 focus-visible:ring-ring/60",
                        style === s &&
                          "ring-2 ring-amber-500 hover:ring-amber-500"
                      )}
                      onClick={() => setStyle(s)}
                    >
                      <img
                        src={`/anima-styles/${s}.webp`}
                        alt=""
                        className="size-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">
                  {t("create.variations")}
                </span>
                <ToggleGroup
                  selectionMode="single"
                  disallowEmptySelection
                  selectedKeys={[count]}
                  onSelectionChange={(keys) => {
                    const [next] = [...keys]
                    if (next) setCount(next as typeof count)
                  }}
                  variant="outline"
                  spacing={0}
                >
                  {VARIATIONS.map((v) => (
                    <ToggleGroupItem key={v} id={v} className="min-w-9">
                      {v}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>

              <Button
                size="lg"
                isDisabled={!words || !!busy || short}
                onPress={() => void draw()}
              >
                {busy === "draw" ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <HugeiconsIcon
                    icon={SparklesIcon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                )}
                {t("create.draw")}
                {openrouter ? (
                  <span className="opacity-70">{t("create.onOpenRouter")}</span>
                ) : (
                  <CreditsPill>
                    {t("create.credits", { count: cost })}
                  </CreditsPill>
                )}
              </Button>
              {short && (
                <p className="text-xs text-destructive">{t("create.short")}</p>
              )}
            </>
          )}
        </section>

        <section className="flex min-w-0 flex-col gap-5">
          {kind === "sfx" ? (
            <div className="[container-type:inline-size] aspect-[4/3] max-h-80 overflow-hidden rounded-xl ring-1 ring-foreground/10">
              <SfxArt
                payload={{
                  type: "sfx",
                  text: idea || "KRAK!",
                  font: "bangers",
                  color: "#facc15",
                  strokeColor: "#111111",
                }}
              />
            </div>
          ) : takes.length ? (
            <ul
              className={cn(
                "grid gap-3",
                takes.length > 1 && "grid-cols-2",
                takes.length > 2 && RATIO[kind] < 1 && "sm:grid-cols-4"
              )}
            >
              {takes.map((take, i) => (
                <li key={i}>
                  {take.src ? (
                    <button
                      type="button"
                      aria-pressed={picked === i}
                      aria-label={t("create.pick", { n: i + 1 })}
                      className={cn(
                        "relative block w-full cursor-pointer overflow-hidden rounded-xl ring-1 ring-foreground/10 transition-shadow outline-none hover:ring-foreground/40 focus-visible:ring-3 focus-visible:ring-ring/60",
                        picked === i &&
                          "ring-2 ring-amber-500 hover:ring-amber-500"
                      )}
                      style={{ aspectRatio: RATIO[kind] }}
                      onClick={() => {
                        setPicked(i)
                        setSheet(null)
                      }}
                    >
                      <img
                        src={take.src}
                        alt=""
                        className="size-full object-cover"
                      />
                      {picked === i && (
                        <span className="absolute end-2 top-2 flex size-6 items-center justify-center rounded-full bg-amber-500 text-amber-950">
                          <HugeiconsIcon
                            icon={Tick02Icon}
                            strokeWidth={3}
                            className="size-3.5"
                          />
                        </span>
                      )}
                    </button>
                  ) : take.failed ? (
                    <div
                      className="flex items-center justify-center rounded-xl border border-dashed text-xs text-muted-foreground"
                      style={{ aspectRatio: RATIO[kind] }}
                    >
                      {t("create.takeFailed")}
                    </div>
                  ) : (
                    <Skeleton
                      className="rounded-xl"
                      style={{ aspectRatio: RATIO[kind] }}
                    />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center">
              <HugeiconsIcon
                icon={KIND_ICONS[kind]}
                strokeWidth={1.5}
                className="size-8 text-muted-foreground"
              />
              <p className="max-w-xs text-sm text-balance text-muted-foreground">
                {t("create.emptyStage")}
              </p>
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {t("create.failed", { error })}
            </p>
          )}

          {SHEETED.includes(kind) && image && (
            <div className="flex flex-col gap-2 rounded-xl border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t("create.sheet")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("create.sheetHint")}
                  </p>
                </div>
                <Button
                  variant="outline"
                  isDisabled={!!busy}
                  onPress={() => void lockSheet()}
                >
                  {busy === "sheet" && <Spinner data-icon="inline-start" />}
                  {t(sheet ? "create.redrawSheet" : "create.drawSheet", {
                    credits: COSTS.panel_ref,
                  })}
                </Button>
              </div>
              {sheet && (
                <img
                  src={sheet}
                  alt=""
                  className="w-full rounded-lg bg-white ring-1 ring-foreground/10"
                />
              )}
            </div>
          )}

          {(image || !renders) && (
            <div className="flex flex-col gap-3 rounded-xl border p-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("create.name")}
                </span>
                <Input
                  value={name}
                  maxLength={80}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  {t("create.description")}
                </span>
                <Input
                  value={description}
                  maxLength={400}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              {kind !== "sfx" && kind !== "story" && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("create.tags")}
                  </span>
                  <Input
                    value={tagText}
                    placeholder={t("create.tagsHint")}
                    onChange={(e) => setTagText(e.target.value)}
                  />
                </label>
              )}
              {kind === "character" && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("create.who")}
                  </span>
                  <ToggleGroup
                    selectionMode="single"
                    disallowEmptySelection
                    selectedKeys={[who]}
                    onSelectionChange={(keys) => {
                      const [next] = [...keys]
                      if (next) setWho(next as typeof who)
                    }}
                    variant="outline"
                    spacing={0}
                  >
                    {(["girl", "boy", "other"] as const).map((w) => (
                      <ToggleGroupItem key={w} id={w}>
                        {t(`create.whos.${w === "other" ? "them" : w}`)}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
              )}
              <div className="flex flex-wrap gap-1">
                {GENRES.map((g) => {
                  const on = genres.includes(g)
                  return (
                    <button
                      key={g}
                      type="button"
                      aria-pressed={on}
                      disabled={!on && genres.length >= 4}
                      className={cn(
                        "h-7 cursor-pointer rounded-full border px-2.5 text-xs transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-default disabled:opacity-40",
                        on &&
                          "border-foreground bg-foreground text-background hover:bg-foreground/90"
                      )}
                      onClick={() =>
                        setGenres(
                          on ? genres.filter((x) => x !== g) : [...genres, g]
                        )
                      }
                    >
                      {t(`genres.${g}`)}
                    </button>
                  )
                })}
              </div>
              <label className="flex cursor-pointer items-start justify-between gap-3 border-t pt-3">
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm">{t("create.public")}</span>
                  <span className="text-xs text-muted-foreground">
                    {t("create.publicHint")}
                  </span>
                </span>
                <Switch
                  aria-label={t("create.public")}
                  isSelected={isPublic}
                  onChange={setIsPublic}
                />
              </label>
              <Button isDisabled={!canSave} onPress={() => void save()}>
                {busy === "save" && <Spinner data-icon="inline-start" />}
                {t(isPublic ? "create.publish" : "create.savePrivate")}
              </Button>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
