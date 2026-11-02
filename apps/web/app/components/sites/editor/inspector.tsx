import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Copy01Icon,
  Delete02Icon,
  LockIcon,
  SquareUnlock02Icon,
  SparklesIcon,
  TextAlignCenterIcon,
  TextAlignLeftIcon,
  TextAlignRightIcon,
} from "@hugeicons/core-free-icons"

import { useT } from "@/i18n/core"
import { COSTS } from "@/lib/credits"
import {
  FONTS,
  newId,
  type Anim,
  type El,
  type ElOf,
  type Fill,
  type FormField,
  type Style,
} from "@/lib/sites/model"

import { messages } from "../frontage.messages"
import {
  Choice,
  ColorField,
  ImageField,
  LinkField,
  Num,
  Segments,
  Text,
  Toggle,
} from "./fields"
import type { Editor } from "./state"

function Group({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="fe-group">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function Rewrite({
  text,
  onDone,
}: {
  text: string
  onDone: (t: string) => void
}) {
  const t = useT(messages)
  const [instruction, setInstruction] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const run = async (ask: string) => {
    setBusy(true)
    setError(null)
    const res = await fetch("/api/sites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent: "text", text, instruction: ask }),
    })
    const json = (await res.json().catch(() => ({}))) as {
      text?: string
      error?: string
    }
    setBusy(false)
    if (json.text) onDone(json.text)
    else setError(json.error ?? t("failed"))
  }
  return (
    <div className="fe-rewrite">
      <div>
        <input
          value={instruction}
          placeholder={t("inspector.rewrite")}
          aria-label={t("inspector.rewrite")}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && instruction.trim()) void run(instruction)
          }}
        />
        <button
          type="button"
          aria-label={t("inspector.rewriteGo", { cost: COSTS.site_text })}
          disabled={busy || !instruction.trim()}
          onClick={() => void run(instruction)}
        >
          <HugeiconsIcon icon={SparklesIcon} size={15} />
        </button>
      </div>
      {error && <p className="fr-error">{error}</p>}
    </div>
  )
}

function TextStyle({
  e,
  set,
}: {
  e: El
  set: (s: Partial<Style>, key: string) => void
}) {
  const t = useT(messages)
  const s = e.style
  return (
    <>
      <Segments
        label={t("inspector.font")}
        value={s.font ?? "body"}
        options={[
          { id: "heading", name: t("inspector.heading") },
          { id: "body", name: t("inspector.body") },
        ]}
        onChange={(font) => set({ font }, "font")}
      />
      <div className="fe-two">
        <Num
          label={t("inspector.size")}
          value={s.size ?? 16}
          min={8}
          max={240}
          onChange={(size) => set({ size }, "size")}
        />
        <Num
          label={t("inspector.phoneSize")}
          value={s.phoneSize ?? 0}
          min={0}
          max={120}
          onChange={(phoneSize) =>
            set({ phoneSize: phoneSize || undefined }, "psize")
          }
        />
        <Num
          label={t("inspector.weight")}
          value={s.weight ?? 400}
          min={300}
          max={900}
          step={100}
          onChange={(weight) => set({ weight }, "weight")}
        />
        <Num
          label={t("inspector.leading")}
          value={s.leading ?? 1.35}
          min={0.8}
          max={2.4}
          step={0.05}
          onChange={(leading) => set({ leading }, "leading")}
        />
        <Num
          label={t("inspector.tracking")}
          value={s.tracking ?? 0}
          min={-0.1}
          max={0.5}
          step={0.01}
          onChange={(tracking) => set({ tracking }, "tracking")}
        />
      </div>
      <Segments
        label={t("inspector.align")}
        value={s.align ?? "left"}
        options={[
          {
            id: "left",
            name: <HugeiconsIcon icon={TextAlignLeftIcon} size={15} />,
          },
          {
            id: "center",
            name: <HugeiconsIcon icon={TextAlignCenterIcon} size={15} />,
          },
          {
            id: "right",
            name: <HugeiconsIcon icon={TextAlignRightIcon} size={15} />,
          },
        ]}
        onChange={(align) => set({ align }, "align")}
      />
      <div className="fe-row">
        <Toggle
          label={t("inspector.italic")}
          on={!!s.italic}
          onChange={(italic) => set({ italic }, "italic")}
        />
        <Toggle
          label={t("inspector.upper")}
          on={!!s.upper}
          onChange={(upper) => set({ upper }, "upper")}
        />
      </div>
    </>
  )
}

function FormEditor({
  e,
  props,
}: {
  e: ElOf<"form">
  props: (p: Partial<ElOf<"form">["props"]>, key?: string) => void
}) {
  const t = useT(messages)
  const fields = e.props.fields
  const change = (i: number, f: Partial<FormField>) =>
    props(
      { fields: fields.map((x, j) => (j === i ? { ...x, ...f } : x)) },
      `f${i}`
    )
  return (
    <>
      {fields.map((f, i) => (
        <div key={f.id} className="fe-card">
          <input
            value={f.label}
            aria-label={t("inspector.fieldLabel")}
            onChange={(ev) => change(i, { label: ev.target.value })}
          />
          <div className="fe-row">
            <select
              aria-label={t("inspector.fieldType")}
              value={f.type}
              onChange={(ev) =>
                change(i, { type: ev.target.value as FormField["type"] })
              }
            >
              {(
                [
                  "text",
                  "email",
                  "phone",
                  "textarea",
                  "select",
                  "checkbox",
                  "date",
                ] as const
              ).map((k) => (
                <option key={k} value={k}>
                  {t(`fields.${k}`)}
                </option>
              ))}
            </select>
            <Toggle
              label={t("inspector.required")}
              on={!!f.required}
              onChange={(required) => change(i, { required })}
            />
            <button
              type="button"
              aria-label={t("editor.delete")}
              onClick={() =>
                props({ fields: fields.filter((_, j) => j !== i) })
              }
            >
              <HugeiconsIcon icon={Delete02Icon} size={14} />
            </button>
          </div>
          {f.type === "select" && (
            <input
              value={(f.options ?? []).join(", ")}
              placeholder={t("inspector.options")}
              aria-label={t("inspector.options")}
              onChange={(ev) =>
                change(i, {
                  options: ev.target.value.split(",").map((o) => o.trim()),
                })
              }
            />
          )}
        </div>
      ))}
      <button
        type="button"
        className="fr-ghost"
        onClick={() =>
          props({
            fields: [
              ...fields,
              { id: newId(), label: t("inspector.newField"), type: "text" },
            ],
          })
        }
      >
        {t("inspector.addField")}
      </button>
      <Text
        label={t("inspector.submit")}
        value={e.props.submit}
        onChange={(submit) => props({ submit }, "submit")}
      />
      <Text
        label={t("inspector.success")}
        value={e.props.success}
        onChange={(success) => props({ success }, "success")}
      />
    </>
  )
}

function Content({ ed, e }: { ed: Editor; e: El }) {
  const t = useT(messages)
  const site = ed.site
  const props = (p: object, key?: string) =>
    ed.patchEl(
      e.id,
      (x) => ({ ...x, props: { ...x.props, ...p } }) as El,
      key && `${e.id}${key}`
    )
  switch (e.type) {
    case "text":
      return (
        <>
          <Text
            area
            label={t("inspector.text")}
            value={e.props.text}
            onChange={(text) => props({ text }, "t")}
          />
          <Rewrite text={e.props.text} onDone={(text) => props({ text })} />
          <Choice
            label={t("inspector.level")}
            value={e.props.tag ?? "p"}
            options={[
              { id: "h1", name: "H1" },
              { id: "h2", name: "H2" },
              { id: "h3", name: "H3" },
              { id: "p", name: t("inspector.paragraph") },
            ]}
            onChange={(tag) => props({ tag })}
          />
          <LinkField
            label={t("inspector.link")}
            value={e.props.link}
            site={site}
            onChange={(link) => props({ link })}
          />
        </>
      )
    case "button":
      return (
        <>
          <Text
            label={t("inspector.label")}
            value={e.props.label}
            onChange={(label) => props({ label }, "l")}
          />
          <Segments
            label={t("inspector.variant")}
            value={e.props.variant ?? "solid"}
            options={[
              { id: "solid", name: t("inspector.solid") },
              { id: "outline", name: t("inspector.outline") },
            ]}
            onChange={(variant) => props({ variant })}
          />
          <LinkField
            label={t("inspector.link")}
            value={e.props.link}
            site={site}
            onChange={(link) => props({ link })}
          />
        </>
      )
    case "image":
      return (
        <>
          <ImageField
            label={t("inspector.image")}
            value={e.props.src}
            site={site}
            onChange={(src) => props({ src })}
          />
          <Text
            label={t("inspector.alt")}
            value={e.props.alt}
            onChange={(alt) => props({ alt }, "a")}
          />
          <LinkField
            label={t("inspector.link")}
            value={e.props.link}
            site={site}
            onChange={(link) => props({ link })}
          />
        </>
      )
    case "shape":
      return (
        <>
          <Segments
            label={t("inspector.shape")}
            value={e.props.shape}
            options={[
              { id: "box", name: t("inspector.box") },
              { id: "circle", name: t("inspector.circle") },
            ]}
            onChange={(shape) => props({ shape })}
          />
          <LinkField
            label={t("inspector.link")}
            value={e.props.link}
            site={site}
            onChange={(link) => props({ link })}
          />
        </>
      )
    case "gallery":
      return (
        <>
          <Segments
            label={t("inspector.layout")}
            value={e.props.layout}
            options={[
              { id: "grid", name: t("inspector.grid") },
              { id: "masonry", name: t("inspector.masonry") },
              { id: "slider", name: t("inspector.slider") },
            ]}
            onChange={(layout) => props({ layout })}
          />
          <div className="fe-two">
            <Num
              label={t("inspector.columns")}
              value={e.props.columns}
              min={1}
              max={6}
              onChange={(columns) => props({ columns }, "c")}
            />
            <Num
              label={t("inspector.gap")}
              value={e.props.gap}
              min={0}
              max={64}
              onChange={(gap) => props({ gap }, "g")}
            />
          </div>
          {e.props.images.map((img, i) => (
            <div key={i} className="fe-gallery-row">
              <ImageField
                label={`${t("inspector.image")} ${i + 1}`}
                value={img.src}
                site={site}
                onChange={(src) =>
                  props({
                    images: e.props.images.map((x, j) =>
                      j === i ? { ...x, src } : x
                    ),
                  })
                }
              />
              <button
                type="button"
                aria-label={t("editor.delete")}
                onClick={() =>
                  props({
                    images: e.props.images.filter((_, j) => j !== i),
                  })
                }
              >
                <HugeiconsIcon icon={Delete02Icon} size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="fr-ghost"
            onClick={() =>
              props({
                images: [
                  ...e.props.images,
                  { src: "/sites/stock/studio.jpg", alt: "" },
                ],
              })
            }
          >
            {t("inspector.addImage")}
          </button>
        </>
      )
    case "video":
      return (
        <Text
          label={t("inspector.videoUrl")}
          value={e.props.url}
          placeholder="https://youtube.com/watch?v=…"
          onChange={(url) => props({ url }, "u")}
        />
      )
    case "map":
      return (
        <Text
          label={t("inspector.address")}
          value={e.props.query}
          onChange={(query) => props({ query }, "q")}
        />
      )
    case "embed":
      return (
        <>
          <Text
            area
            label={t("inspector.html")}
            value={e.props.html}
            onChange={(html) => props({ html }, "h")}
          />
          <p className="fe-note">{t("inspector.embedNote")}</p>
        </>
      )
    case "social":
      return (
        <>
          {e.props.links.map((l, i) => (
            <div key={i} className="fe-card">
              <div className="fe-row">
                <select
                  aria-label={t("inspector.network")}
                  value={l.kind}
                  onChange={(ev) =>
                    props({
                      links: e.props.links.map((x, j) =>
                        j === i ? { ...x, kind: ev.target.value } : x
                      ),
                    })
                  }
                >
                  {[
                    "instagram",
                    "x",
                    "facebook",
                    "tiktok",
                    "youtube",
                    "linkedin",
                  ].map((k) => (
                    <option key={k}>{k}</option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label={t("editor.delete")}
                  onClick={() =>
                    props({
                      links: e.props.links.filter((_, j) => j !== i),
                    })
                  }
                >
                  <HugeiconsIcon icon={Delete02Icon} size={14} />
                </button>
              </div>
              <input
                value={l.url}
                aria-label={t("link.url")}
                onChange={(ev) =>
                  props(
                    {
                      links: e.props.links.map((x, j) =>
                        j === i ? { ...x, url: ev.target.value } : x
                      ),
                    },
                    `s${i}`
                  )
                }
              />
            </div>
          ))}
          <button
            type="button"
            className="fr-ghost"
            onClick={() =>
              props({
                links: [
                  ...e.props.links,
                  { kind: "instagram", url: "https://" },
                ],
              })
            }
          >
            {t("inspector.addLink")}
          </button>
        </>
      )
    case "form":
      return <FormEditor e={e} props={props} />
    case "countdown":
      return (
        <>
          <Text
            label={t("inspector.date")}
            value={e.props.to.slice(0, 16)}
            onChange={(to) => props({ to }, "t")}
          />
          <Text
            label={t("inspector.doneText")}
            value={e.props.done}
            onChange={(done) => props({ done }, "d")}
          />
        </>
      )
    case "accordion":
      return (
        <>
          {e.props.items.map((item, i) => (
            <div key={i} className="fe-card">
              <input
                value={item.q}
                aria-label={t("inspector.question")}
                onChange={(ev) =>
                  props(
                    {
                      items: e.props.items.map((x, j) =>
                        j === i ? { ...x, q: ev.target.value } : x
                      ),
                    },
                    `q${i}`
                  )
                }
              />
              <textarea
                value={item.a}
                rows={3}
                aria-label={t("inspector.answer")}
                onChange={(ev) =>
                  props(
                    {
                      items: e.props.items.map((x, j) =>
                        j === i ? { ...x, a: ev.target.value } : x
                      ),
                    },
                    `a${i}`
                  )
                }
              />
              <button
                type="button"
                aria-label={t("editor.delete")}
                onClick={() =>
                  props({ items: e.props.items.filter((_, j) => j !== i) })
                }
              >
                <HugeiconsIcon icon={Delete02Icon} size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="fr-ghost"
            onClick={() =>
              props({
                items: [
                  ...e.props.items,
                  { q: t("inspector.question"), a: t("inspector.answer") },
                ],
              })
            }
          >
            {t("inspector.addQuestion")}
          </button>
        </>
      )
    case "pricing":
      return (
        <>
          {e.props.tiers.map((tier, i) => {
            const set = (p: Partial<typeof tier>, key?: string) =>
              props(
                {
                  tiers: e.props.tiers.map((x, j) =>
                    j === i ? { ...x, ...p } : x
                  ),
                },
                key && `${key}${i}`
              )
            return (
              <div key={i} className="fe-card">
                <input
                  value={tier.name}
                  aria-label={t("inspector.tier")}
                  onChange={(ev) => set({ name: ev.target.value }, "n")}
                />
                <input
                  value={tier.price}
                  aria-label={t("inspector.price")}
                  onChange={(ev) => set({ price: ev.target.value }, "p")}
                />
                <textarea
                  rows={3}
                  value={tier.features.join("\n")}
                  aria-label={t("inspector.features")}
                  onChange={(ev) =>
                    set({ features: ev.target.value.split("\n") }, "f")
                  }
                />
                <Toggle
                  label={t("inspector.featured")}
                  on={!!tier.featured}
                  onChange={(featured) => set({ featured })}
                />
                <LinkField
                  label={t("inspector.link")}
                  value={tier.link}
                  site={site}
                  onChange={(link) => set({ link })}
                />
              </div>
            )
          })}
        </>
      )
    case "products":
    case "posts":
    case "list":
      return (
        <>
          {e.type === "list" && (
            <Choice
              label={t("inspector.collection")}
              value={e.props.collection}
              options={site.collections.map((c) => ({
                id: c.id,
                name: c.name,
              }))}
              onChange={(collection) => props({ collection })}
            />
          )}
          <div className="fe-two">
            <Num
              label={t("inspector.columns")}
              value={e.props.columns}
              min={1}
              max={4}
              onChange={(columns) => props({ columns }, "c")}
            />
            <Num
              label={t("inspector.limit")}
              value={e.props.limit}
              min={1}
              max={24}
              onChange={(limit) => props({ limit }, "l")}
            />
          </div>
        </>
      )
    case "events":
      return (
        <Num
          label={t("inspector.limit")}
          value={e.props.limit}
          min={1}
          max={24}
          onChange={(limit) => props({ limit }, "l")}
        />
      )
    case "booking":
      return (
        <Text
          label={t("inspector.headingText")}
          value={e.props.heading}
          onChange={(heading) => props({ heading }, "h")}
        />
      )
    default:
      return null
  }
}

const hasText = (e: El) =>
  ["text", "button", "menu", "social", "countdown"].includes(e.type)
const hasSurface = (e: El) =>
  ["image", "shape", "button", "line"].includes(e.type)

function ElementInspector({ ed, e }: { ed: Editor; e: El }) {
  const t = useT(messages)
  const set = (s: Partial<Style>, key: string) =>
    ed.patchEl(
      e.id,
      (x) => ({ ...x, style: { ...x.style, ...s } }) as El,
      `${e.id}${key}`
    )
  const frame = ed.section ? ed.frame(e, ed.section) : e.box
  const setFrame = (patch: Partial<typeof frame>) =>
    ed.setFrames(new Map([[e.id, { ...frame, ...patch }]]), `${e.id}frame`)
  return (
    <>
      <header className="fe-head">
        <b>{e.name ?? t(`elements.${e.type}`)}</b>
        <button
          type="button"
          aria-label={e.locked ? t("editor.unlock") : t("editor.lock")}
          onClick={() =>
            ed.patchEl(e.id, (x) => ({ ...x, locked: !x.locked }) as El)
          }
        >
          <HugeiconsIcon
            icon={e.locked ? LockIcon : SquareUnlock02Icon}
            size={15}
          />
        </button>
        <button
          type="button"
          aria-label={t("editor.duplicate")}
          onClick={ed.duplicate}
        >
          <HugeiconsIcon icon={Copy01Icon} size={15} />
        </button>
        <button
          type="button"
          aria-label={t("editor.delete")}
          onClick={ed.remove}
        >
          <HugeiconsIcon icon={Delete02Icon} size={15} />
        </button>
      </header>
      <Group title={t("inspector.content")}>
        <Content ed={ed} e={e} />
      </Group>
      {hasText(e) && (
        <Group title={t("inspector.type")}>
          <TextStyle e={e} set={set} />
          <ColorField
            label={t("inspector.color")}
            value={e.style.color}
            site={ed.site}
            onChange={(color) => set({ color }, "color")}
          />
        </Group>
      )}
      {hasSurface(e) && (
        <Group title={t("inspector.surface")}>
          {e.type !== "image" && (
            <ColorField
              label={t("inspector.fill")}
              value={e.style.fill}
              site={ed.site}
              onChange={(fill) => set({ fill }, "fill")}
            />
          )}
          <div className="fe-two">
            <Num
              label={t("inspector.radius")}
              value={e.style.radius ?? 0}
              min={0}
              max={200}
              onChange={(radius) => set({ radius }, "radius")}
            />
            <Num
              label={t("inspector.borderWidth")}
              value={e.style.border ?? 0}
              min={0}
              max={16}
              onChange={(border) => set({ border }, "border")}
            />
          </div>
          <Toggle
            label={t("inspector.shadow")}
            on={!!e.style.shadow}
            onChange={(shadow) => set({ shadow }, "shadow")}
          />
          {e.type === "image" && (
            <Segments
              label={t("inspector.fit")}
              value={e.style.fit ?? "cover"}
              options={[
                { id: "cover", name: t("inspector.cover") },
                { id: "contain", name: t("inspector.contain") },
              ]}
              onChange={(fit) => set({ fit }, "fit")}
            />
          )}
        </Group>
      )}
      <Group title={t("inspector.position")}>
        <div className="fe-two">
          {(["x", "y", "w", "h"] as const).map((k) => (
            <Num
              key={k}
              label={k.toUpperCase()}
              value={frame[k]}
              onChange={(v) => setFrame({ [k]: v })}
            />
          ))}
        </div>
        <Num
          label={t("inspector.opacity")}
          value={Math.round((e.style.opacity ?? 1) * 100)}
          min={0}
          max={100}
          onChange={(v) => set({ opacity: v / 100 }, "opacity")}
        />
        <Toggle
          label={t("inspector.hideOnPhone")}
          on={!!e.hideOnPhone}
          onChange={(hideOnPhone) =>
            ed.patchEl(e.id, (x) => ({ ...x, hideOnPhone }) as El)
          }
        />
        {ed.device === "mobile" && e.phone && (
          <button
            type="button"
            className="fr-ghost"
            onClick={() =>
              ed.patchEl(e.id, (x) => ({ ...x, phone: null }) as El)
            }
          >
            {t("inspector.resetPhone")}
          </button>
        )}
      </Group>
      <Group title={t("inspector.motion")}>
        <Choice<Anim | "none">
          label={t("inspector.entrance")}
          value={e.anim ?? "none"}
          options={[
            { id: "none", name: t("anim.none") },
            { id: "fade", name: t("anim.fade") },
            { id: "rise", name: t("anim.rise") },
            { id: "zoom", name: t("anim.zoom") },
            { id: "left", name: t("anim.left") },
            { id: "right", name: t("anim.right") },
          ]}
          onChange={(anim) =>
            ed.patchEl(
              e.id,
              (x) => ({ ...x, anim: anim === "none" ? null : anim }) as El
            )
          }
        />
      </Group>
    </>
  )
}

function SectionInspector({ ed }: { ed: Editor }) {
  const t = useT(messages)
  const s = ed.section!
  const set = (fill: Fill, key?: string) =>
    ed.patchSection(s.id, (x) => ({ ...x, fill }), key && `${s.id}${key}`)
  return (
    <>
      <header className="fe-head">
        <b>{s.name}</b>
      </header>
      <Group title={t("inspector.section")}>
        <Text
          label={t("inspector.name")}
          value={s.name}
          onChange={(name) =>
            ed.patchSection(s.id, (x) => ({ ...x, name }), `${s.id}n`)
          }
        />
        <Num
          label={t("inspector.height")}
          value={s.height}
          min={40}
          max={4000}
          onChange={(height) =>
            ed.patchSection(s.id, (x) => ({ ...x, height }), `${s.id}h`)
          }
        />
        {s.id === ed.site.header?.id && (
          <Toggle
            label={t("inspector.sticky")}
            on={!!s.sticky}
            onChange={(sticky) =>
              ed.patchSection(s.id, (x) => ({ ...x, sticky }))
            }
          />
        )}
      </Group>
      <Group title={t("inspector.background")}>
        <Segments
          label={t("inspector.fillKind")}
          value={s.fill.kind}
          options={[
            { id: "color", name: t("inspector.solidFill") },
            { id: "gradient", name: t("inspector.gradient") },
            { id: "image", name: t("inspector.image") },
          ]}
          onChange={(kind) =>
            set(
              kind === "color"
                ? { kind, color: "$bg" }
                : kind === "gradient"
                  ? { kind, from: "$accent", to: "$bg", angle: 160 }
                  : {
                      kind,
                      src: "/sites/stock/landscape.jpg",
                      overlay: 0.3,
                    }
            )
          }
        />
        {s.fill.kind === "color" && (
          <ColorField
            label={t("inspector.color")}
            value={s.fill.color}
            site={ed.site}
            onChange={(color) =>
              set({ kind: "color", color: color ?? "$bg" }, "c")
            }
          />
        )}
        {s.fill.kind === "gradient" && (
          <>
            <ColorField
              label={t("inspector.from")}
              value={s.fill.from}
              site={ed.site}
              onChange={(from) =>
                s.fill.kind === "gradient" &&
                set({ ...s.fill, from: from ?? "$bg" }, "gf")
              }
            />
            <ColorField
              label={t("inspector.to")}
              value={s.fill.to}
              site={ed.site}
              onChange={(to) =>
                s.fill.kind === "gradient" &&
                set({ ...s.fill, to: to ?? "$bg" }, "gt")
              }
            />
            <Num
              label={t("inspector.angle")}
              value={s.fill.angle}
              min={0}
              max={360}
              onChange={(angle) =>
                s.fill.kind === "gradient" && set({ ...s.fill, angle }, "ga")
              }
            />
          </>
        )}
        {s.fill.kind === "image" && (
          <>
            <ImageField
              label={t("inspector.image")}
              value={s.fill.src}
              site={ed.site}
              onChange={(src) =>
                s.fill.kind === "image" && set({ ...s.fill, src })
              }
            />
            <Num
              label={t("inspector.dim")}
              value={Math.round(s.fill.overlay * 100)}
              min={0}
              max={95}
              onChange={(v) =>
                s.fill.kind === "image" &&
                set({ ...s.fill, overlay: v / 100 }, "d")
              }
            />
            <Toggle
              label={t("inspector.parallax")}
              on={!!s.fill.fixed}
              onChange={(fixed) =>
                s.fill.kind === "image" && set({ ...s.fill, fixed })
              }
            />
          </>
        )}
      </Group>
    </>
  )
}

function PageInspector({ ed }: { ed: Editor }) {
  const t = useT(messages)
  const p = ed.page
  const seo = (patch: Partial<typeof p.seo>, key: string) =>
    ed.patchPage((x) => ({ ...x, seo: { ...x.seo, ...patch } }), `seo${key}`)
  return (
    <>
      <header className="fe-head">
        <b>{p.name}</b>
      </header>
      <Group title={t("inspector.searchResults")}>
        <Text
          label={t("inspector.seoTitle")}
          value={p.seo.title}
          placeholder={ed.site.name}
          onChange={(title) => seo({ title }, "t")}
        />
        <Text
          area
          label={t("inspector.seoDescription")}
          value={p.seo.description}
          onChange={(description) => seo({ description }, "d")}
        />
        <div className="fe-serp">
          <b>{p.seo.title || p.name}</b>
          <span>{p.seo.description || t("inspector.seoEmpty")}</span>
        </div>
        <ImageField
          label={t("inspector.shareImage")}
          value={p.seo.image}
          site={ed.site}
          onChange={(image) => seo({ image }, "i")}
        />
      </Group>
    </>
  )
}

export function Inspector({ ed }: { ed: Editor }) {
  const t = useT(messages)
  const e = ed.selected[0]
  return (
    <aside className="fe-inspector" aria-label={t("inspector.title")}>
      {ed.selected.length > 1 ? (
        <>
          <header className="fe-head">
            <b>{t("inspector.many", { count: ed.selected.length })}</b>
            <button
              type="button"
              aria-label={t("editor.delete")}
              onClick={ed.remove}
            >
              <HugeiconsIcon icon={Delete02Icon} size={15} />
            </button>
          </header>
        </>
      ) : e ? (
        <ElementInspector key={e.id} ed={ed} e={e} />
      ) : ed.selection.section && ed.section ? (
        <SectionInspector key={ed.section.id} ed={ed} />
      ) : (
        <PageInspector key={ed.page.id} ed={ed} />
      )}
    </aside>
  )
}

export { FONTS }
