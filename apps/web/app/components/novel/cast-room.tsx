import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Delete02Icon, PlusSignIcon } from "@hugeicons/core-free-icons"

import { useT } from "@/i18n/core"
import { ApiError, drawRequest, prepareImage } from "@/lib/novel/client"
import {
  BLIPS,
  CHARACTER_COLORS,
  newCharacter,
  nid,
  type Backdrop,
  type Blip,
  type Character,
  type Sprite,
} from "@/lib/novel/model"
import { assetUrl } from "@/lib/novel/paper"

import { Darkroom, buildPrompt, type Shot } from "./darkroom"
import { Dial, Key, Plate, Swatches } from "./hardware"
import { messages } from "./novel.messages"
import { useWork } from "./work"

export function CastRoom() {
  const t = useT(messages)
  const { novel, update, art, storage, notify, setCredits } = useWork()
  const [shot, setShot] = React.useState<Shot | null>(null)
  const [active, setActive] = React.useState<string | null>(
    novel.characters[0]?.id ?? null
  )
  const [filling, setFilling] = React.useState(false)
  const c = novel.characters.find((x) => x.id === active) ?? novel.characters[0]

  const change = (patch: Partial<Character>, merge?: string) =>
    c &&
    update((n) => {
      const x = n.characters.find((v) => v.id === c.id)
      if (x) Object.assign(x, patch)
    }, merge)
  const setSprite = (id: string, url: string) =>
    c &&
    update((n) => {
      const s = n.characters
        .find((v) => v.id === c.id)
        ?.sprites.find((p) => p.id === id)
      if (s) s.url = url
    })
  const addPose = () => {
    if (!c) return
    const s: Sprite = {
      id: nid("sp"),
      name: t("cast.newPose", { count: c.sprites.length + 1 }),
      url: "",
    }
    update((n) => n.characters.find((v) => v.id === c.id)?.sprites.push(s))
  }
  const open = (s: Sprite) => {
    if (!c) return
    const reference = c.sprites.find(
      (p) => p.id !== s.id && p.url && !p.url.startsWith("paper:")
    )?.url
    setShot({
      kind: "actor",
      name: `${c.name} · ${s.name}`,
      brief: c.look || c.name,
      pose: s.name,
      refs: reference ? [reference] : [],
      onKeep: (url, brief) => {
        setSprite(s.id, url)
        if (brief !== c.look) change({ look: brief })
      },
    })
  }

  // Draws every pose without art, each one from the first that has some.
  const fill = async () => {
    if (!c) return
    setFilling(true)
    try {
      let reference = c.sprites.find(
        (p) => p.url && !p.url.startsWith("paper:")
      )?.url
      for (const s of c.sprites) {
        if (s.url && !s.url.startsWith("paper:")) continue
        const { image, credits } = await drawRequest({
          prompt: buildPrompt(
            novel,
            {
              kind: "actor",
              name: c.name,
              brief: c.look || c.name,
              pose: s.name,
              onKeep: () => {},
            },
            {
              stock: "house",
              frame: "full",
              time: "day",
              mood: "calm",
              lens: 50,
            }
          ),
          width: 832,
          height: 1216,
          seed: Math.floor(Math.random() * 99_999),
          refs: reference ? [reference] : [],
        })
        setCredits(credits)
        const url = await storage.image(
          await prepareImage(image, { cutOut: true })
        )
        reference ??= url
        setSprite(s.id, url)
      }
    } catch (e) {
      notify(e instanceof ApiError ? e.message : t("errors.failed"))
    } finally {
      setFilling(false)
    }
  }

  return (
    <div className="nv-scroll grid h-full gap-2 overflow-y-auto p-2 md:grid-cols-[230px_minmax(0,1fr)] md:overflow-hidden">
      <Plate
        title={t("cast.title")}
        bodyClassName="nv-scroll overflow-y-auto p-2 grid gap-1.5 content-start"
        actions={
          <Key
            size="icon"
            aria-label={t("cast.add")}
            onClick={() => {
              const created = newCharacter(
                t("cast.newName", { count: novel.characters.length + 1 }),
                novel.characters.length
              )
              created.sprites = [{ id: nid("sp"), name: "neutral", url: "" }]
              update((n) => n.characters.push(created))
              setActive(created.id)
            }}
          >
            <HugeiconsIcon
              icon={PlusSignIcon}
              strokeWidth={2}
              className="size-4"
            />
          </Key>
        }
      >
        {novel.characters.map((x) => (
          <Key
            key={x.id}
            className="justify-start !normal-case"
            aria-current={c?.id === x.id ? "page" : undefined}
            onClick={() => setActive(x.id)}
          >
            <i
              className="nv-led"
              data-on
              style={{ "--c": x.color } as React.CSSProperties}
            />
            <span className="truncate">{x.name}</span>
          </Key>
        ))}
        {!novel.characters.length ? (
          <p className="p-2 text-sm text-[#b5a994]">{t("cast.empty")}</p>
        ) : null}
      </Plate>
      {c ? (
        <div className="nv-scroll grid min-h-0 gap-2 overflow-y-auto xl:grid-cols-[minmax(0,1fr)_320px]">
          <Plate
            title={t("cast.contactSheet")}
            bodyClassName="p-4"
            actions={
              <>
                <Key
                  disabled={filling || !art?.route}
                  onClick={() => void fill()}
                >
                  {filling ? t("cast.drawing") : t("cast.drawAll")}
                </Key>
                <Key onClick={addPose}>{t("cast.addPose")}</Key>
              </>
            }
          >
            <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-5">
              {c.sprites.map((s, i) => (
                <div
                  key={s.id}
                  className="nv-print"
                  style={
                    {
                      "--tilt": `${((i * 31) % 5) - 2}deg`,
                    } as React.CSSProperties
                  }
                >
                  <button
                    type="button"
                    className="nv-checker block aspect-[3/4] w-full cursor-pointer overflow-hidden"
                    aria-label={t("cast.shootPose", { name: s.name })}
                    onClick={() => open(s)}
                  >
                    {s.url ? (
                      <img
                        src={assetUrl(s.url)}
                        alt={s.name}
                        className="size-full object-contain object-top"
                      />
                    ) : (
                      <span className="nv-engraved grid size-full place-items-center bg-black/40 text-[#ece4d4]!">
                        {t("cast.shoot")}
                      </span>
                    )}
                  </button>
                  <input
                    aria-label={t("cast.poseName")}
                    className="absolute inset-x-1.5 bottom-1 bg-transparent text-center font-(family-name:--type) text-sm outline-none"
                    value={s.name}
                    onChange={(e) => {
                      const name = e.target.value
                      update((n) => {
                        const p = n.characters
                          .find((v) => v.id === c.id)
                          ?.sprites.find((v) => v.id === s.id)
                        if (p) p.name = name
                      }, `pose-${s.id}`)
                    }}
                  />
                  <button
                    type="button"
                    aria-label={t("stage.remove")}
                    className="absolute end-0.5 top-0.5 grid size-6 cursor-pointer place-items-center rounded-full bg-black/70 text-white"
                    onClick={() =>
                      update((n) => {
                        const v = n.characters.find((x) => x.id === c.id)
                        if (v)
                          v.sprites = v.sprites.filter((p) => p.id !== s.id)
                      })
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </Plate>
          <Plate
            title={t("cast.file")}
            bodyClassName="nv-scroll overflow-y-auto p-3 grid gap-3 content-start"
          >
            <label className="grid gap-1">
              <span className="nv-engraved">{t("cast.name")}</span>
              <input
                className="nv-field"
                value={c.name}
                onChange={(e) => change({ name: e.target.value }, "name")}
              />
            </label>
            <label className="grid gap-1">
              <span className="nv-engraved">{t("cast.look")}</span>
              <textarea
                className="nv-field min-h-24"
                placeholder={t("cast.lookPlaceholder")}
                value={c.look}
                onChange={(e) => change({ look: e.target.value }, "look")}
              />
            </label>
            <label className="grid gap-1">
              <span className="nv-engraved">{t("cast.bio")}</span>
              <textarea
                className="nv-field min-h-20"
                value={c.bio}
                onChange={(e) => change({ bio: e.target.value }, "bio")}
              />
            </label>
            <div className="grid gap-1">
              <span className="nv-engraved">{t("cast.nameColor")}</span>
              <Swatches
                label={t("cast.nameColor")}
                value={c.color}
                options={CHARACTER_COLORS}
                onChange={(color) => change({ color })}
              />
            </div>
            <div className="flex justify-center">
              <Dial<Blip>
                label={t("cast.voiceBlip")}
                size={140}
                value={c.blip}
                options={BLIPS.map((b) => ({
                  value: b,
                  label: t(`cast.blips.${b}`),
                }))}
                onChange={(blip) => change({ blip })}
              />
            </div>
            <Key
              tone="danger"
              onClick={() => {
                update((n) => {
                  n.characters = n.characters.filter((x) => x.id !== c.id)
                })
                setActive(null)
              }}
            >
              <HugeiconsIcon
                icon={Delete02Icon}
                strokeWidth={2}
                className="size-4"
              />
              {t("cast.remove")}
            </Key>
          </Plate>
        </div>
      ) : null}
      {shot ? <Darkroom shot={shot} onClose={() => setShot(null)} /> : null}
    </div>
  )
}

export function SetsRoom() {
  const t = useT(messages)
  const { novel, update } = useWork()
  const [shot, setShot] = React.useState<Shot | null>(null)
  const [kind, setKind] = React.useState<"bg" | "cg">("bg")
  const list = novel.backdrops.filter((b) => b.kind === kind)
  const set = (id: string, patch: Partial<Backdrop>, merge?: string) =>
    update((n) => {
      const b = n.backdrops.find((x) => x.id === id)
      if (b) Object.assign(b, patch)
    }, merge)
  const shoot = (b: Backdrop) =>
    setShot({
      kind: kind === "bg" ? "set" : "cg",
      name: b.name,
      brief: b.prompt || b.name,
      onKeep: (url, prompt) => set(b.id, { url, prompt }),
    })
  return (
    <div className="h-full p-2">
      <Plate
        className="h-full"
        title={t("sets.title")}
        bodyClassName="nv-scroll overflow-y-auto p-4"
        actions={
          <>
            <Key
              aria-current={kind === "bg" ? "page" : undefined}
              onClick={() => setKind("bg")}
            >
              {t("sets.backdrops")}
            </Key>
            <Key
              aria-current={kind === "cg" ? "page" : undefined}
              onClick={() => setKind("cg")}
            >
              {t("sets.illustrations")}
            </Key>
            <Key
              tone="fire"
              onClick={() => {
                const b: Backdrop = {
                  id: nid("bd"),
                  name: t("sets.newName", { count: list.length + 1 }),
                  url: "",
                  kind,
                  prompt: "",
                }
                update((n) => n.backdrops.push(b))
                shoot(b)
              }}
            >
              <HugeiconsIcon
                icon={PlusSignIcon}
                strokeWidth={2}
                className="size-4"
              />
              {t("sets.add")}
            </Key>
          </>
        }
      >
        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
          {list.map((b) => (
            <div key={b.id} className="nv-slide">
              <button
                type="button"
                className="block aspect-video w-full cursor-pointer overflow-hidden bg-[#141210]"
                aria-label={t("sets.shoot", { name: b.name })}
                onClick={() => shoot(b)}
              >
                {b.url ? (
                  <img
                    src={assetUrl(b.url)}
                    alt={b.name}
                    className="size-full object-cover"
                  />
                ) : (
                  <span className="nv-engraved grid size-full place-items-center">
                    {t("cast.shoot")}
                  </span>
                )}
              </button>
              <div className="mt-2 flex items-center gap-1">
                <input
                  aria-label={t("sets.name")}
                  className="min-w-0 flex-1 bg-transparent font-(family-name:--type) text-sm font-bold outline-none"
                  value={b.name}
                  onChange={(e) =>
                    set(b.id, { name: e.target.value }, `name-${b.id}`)
                  }
                />
                <button
                  type="button"
                  aria-label={t("stage.remove")}
                  className="cursor-pointer px-1"
                  onClick={() =>
                    update(
                      (n) =>
                        void (n.backdrops = n.backdrops.filter(
                          (x) => x.id !== b.id
                        ))
                    )
                  }
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
        {!list.length ? (
          <p className="py-10 text-center text-sm text-[#b5a994]">
            {t(kind === "bg" ? "sets.emptyBg" : "sets.emptyCg")}
          </p>
        ) : null}
      </Plate>
      {shot ? <Darkroom shot={shot} onClose={() => setShot(null)} /> : null}
    </div>
  )
}
