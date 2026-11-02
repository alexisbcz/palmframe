import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Delete02Icon } from "@hugeicons/core-free-icons"

import { useT } from "@/i18n/core"
import { addApp, hasApp, type App } from "@/lib/sites/edit"
import {
  newId,
  slugify,
  type Collection,
  type EventItem,
  type Post,
  type Product,
  type Service,
  type Site,
} from "@/lib/sites/model"

import { messages } from "../frontage.messages"
import { ImageField, Num, Text, Toggle } from "./fields"
import type { Editor } from "./state"

// One record list with a form below: every app panel is this shape.
function Records<T extends { id: string }>({
  items,
  title,
  blank,
  onChange,
  fields,
  addLabel,
}: {
  items: T[]
  title: (item: T) => string
  blank: () => T
  onChange: (items: T[], key?: string) => void
  fields: (
    item: T,
    set: (p: Partial<T>, key?: string) => void
  ) => React.ReactNode
  addLabel: string
}) {
  const t = useT(messages)
  const [open, setOpen] = React.useState<string | null>(null)
  return (
    <div className="fe-records">
      {items.map((item) => (
        <div
          key={item.id}
          className="fe-record"
          data-open={open === item.id || null}
        >
          <div className="fe-record-head">
            <button
              type="button"
              aria-expanded={open === item.id}
              onClick={() => setOpen(open === item.id ? null : item.id)}
            >
              {title(item) || t("untitled")}
            </button>
            <button
              type="button"
              aria-label={t("editor.delete")}
              onClick={() => onChange(items.filter((x) => x.id !== item.id))}
            >
              <HugeiconsIcon icon={Delete02Icon} size={14} />
            </button>
          </div>
          {open === item.id && (
            <div className="fe-record-body">
              {fields(item, (p, key) =>
                onChange(
                  items.map((x) => (x.id === item.id ? { ...x, ...p } : x)),
                  key && `${item.id}${key}`
                )
              )}
            </div>
          )}
        </div>
      ))}
      <button
        type="button"
        className="fr-ghost"
        onClick={() => {
          const made = blank()
          onChange([...items, made])
          setOpen(made.id)
        }}
      >
        {addLabel}
      </button>
    </div>
  )
}

const list =
  <K extends "products" | "posts" | "services" | "events" | "collections">(
    ed: Editor,
    key: K
  ) =>
  (items: Site[K], undoKey?: string) =>
    ed.edit((s) => ({ ...s, [key]: items }), undoKey && `${key}${undoKey}`)

function Store({ ed }: { ed: Editor }) {
  const t = useT(messages)
  const site = ed.site
  return (
    <>
      <Text
        label={t("apps.currency")}
        value={site.settings.currency}
        onChange={(currency) =>
          ed.edit(
            (s) => ({
              ...s,
              settings: {
                ...s.settings,
                currency: currency.toUpperCase().slice(0, 3),
              },
            }),
            "currency"
          )
        }
      />
      <Text
        area
        label={t("apps.orderNote")}
        value={site.settings.orderNote}
        placeholder={t("apps.orderNoteHint")}
        onChange={(orderNote) =>
          ed.edit(
            (s) => ({ ...s, settings: { ...s.settings, orderNote } }),
            "ordernote"
          )
        }
      />
      <Records<Product>
        items={site.products}
        title={(p) => p.name}
        addLabel={t("apps.addProduct")}
        onChange={list(ed, "products")}
        blank={() => ({
          id: newId(),
          slug: `product-${newId().slice(0, 5)}`,
          name: t("apps.newProduct"),
          price: 20,
          description: "",
          images: [],
        })}
        fields={(p, set) => (
          <>
            <Text
              label={t("apps.name")}
              value={p.name}
              onChange={(name) =>
                set({ name, slug: slugify(name) || p.slug }, "n")
              }
            />
            <Num
              label={t("inspector.price")}
              value={p.price}
              min={0}
              step={0.5}
              onChange={(price) => set({ price }, "p")}
            />
            <Text
              area
              label={t("apps.description")}
              value={p.description}
              onChange={(description) => set({ description }, "d")}
            />
            <ImageField
              label={t("inspector.image")}
              value={p.images[0] ?? ""}
              site={site}
              onChange={(src) => set({ images: [src, ...p.images.slice(1)] })}
            />
            <Text
              label={t("apps.paymentLink")}
              value={p.paymentLink ?? ""}
              placeholder="https://buy.stripe.com/…"
              onChange={(paymentLink) => set({ paymentLink }, "l")}
            />
            <Toggle
              label={t("apps.soldOut")}
              on={!!p.soldOut}
              onChange={(soldOut) => set({ soldOut })}
            />
          </>
        )}
      />
      <p className="fe-note">{t("apps.storeNote")}</p>
    </>
  )
}

function Blog({ ed }: { ed: Editor }) {
  const t = useT(messages)
  return (
    <Records<Post>
      items={ed.site.posts}
      title={(p) => p.title}
      addLabel={t("apps.addPost")}
      onChange={list(ed, "posts")}
      blank={() => ({
        id: newId(),
        slug: `post-${newId().slice(0, 5)}`,
        title: t("apps.newPost"),
        excerpt: "",
        body: "",
        cover: "",
        author: "",
        date: new Date().toISOString().slice(0, 10),
      })}
      fields={(p, set) => (
        <>
          <Text
            label={t("apps.postTitle")}
            value={p.title}
            onChange={(title) =>
              set({ title, slug: slugify(title) || p.slug }, "t")
            }
          />
          <Text
            area
            label={t("apps.excerpt")}
            value={p.excerpt}
            onChange={(excerpt) => set({ excerpt }, "e")}
          />
          <Text
            area
            label={t("apps.body")}
            value={p.body}
            onChange={(body) => set({ body }, "b")}
          />
          <Text
            label={t("apps.author")}
            value={p.author}
            onChange={(author) => set({ author }, "a")}
          />
          <Text
            label={t("apps.date")}
            value={p.date}
            onChange={(date) => set({ date }, "dt")}
          />
          <ImageField
            label={t("apps.cover")}
            value={p.cover}
            site={ed.site}
            onChange={(cover) => set({ cover })}
          />
          <Toggle
            label={t("apps.draft")}
            on={!!p.draft}
            onChange={(draft) => set({ draft })}
          />
        </>
      )}
    />
  )
}

const DAYS = [0, 1, 2, 3, 4, 5, 6]

function Bookings({ ed }: { ed: Editor }) {
  const t = useT(messages)
  const { hours } = ed.site
  const setHours = (p: Partial<typeof hours>, key?: string) =>
    ed.edit((s) => ({ ...s, hours: { ...s.hours, ...p } }), key)
  return (
    <>
      <div className="fe-field" role="group" aria-label={t("apps.days")}>
        <span>{t("apps.days")}</span>
        <div className="fe-segments">
          {DAYS.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={hours.days.includes(d)}
              onClick={() =>
                setHours({
                  days: hours.days.includes(d)
                    ? hours.days.filter((x) => x !== d)
                    : [...hours.days, d],
                })
              }
            >
              {new Date(2023, 0, 1 + d).toLocaleDateString(undefined, {
                weekday: "narrow",
              })}
            </button>
          ))}
        </div>
      </div>
      <div className="fe-two">
        <Text
          label={t("apps.opens")}
          value={hours.from}
          onChange={(from) => setHours({ from }, "hfrom")}
        />
        <Text
          label={t("apps.closes")}
          value={hours.to}
          onChange={(to) => setHours({ to }, "hto")}
        />
      </div>
      <Records<Service>
        items={ed.site.services}
        title={(s) => s.name}
        addLabel={t("apps.addService")}
        onChange={list(ed, "services")}
        blank={() => ({
          id: newId(),
          name: t("apps.newService"),
          description: "",
          minutes: 60,
          price: 50,
        })}
        fields={(s, set) => (
          <>
            <Text
              label={t("apps.name")}
              value={s.name}
              onChange={(name) => set({ name }, "n")}
            />
            <div className="fe-two">
              <Num
                label={t("apps.minutes")}
                value={s.minutes}
                min={10}
                step={5}
                onChange={(minutes) => set({ minutes }, "m")}
              />
              <Num
                label={t("inspector.price")}
                value={s.price}
                min={0}
                onChange={(price) => set({ price }, "p")}
              />
            </div>
          </>
        )}
      />
    </>
  )
}

function Events({ ed }: { ed: Editor }) {
  const t = useT(messages)
  return (
    <Records<EventItem>
      items={ed.site.events}
      title={(e) => e.title}
      addLabel={t("apps.addEvent")}
      onChange={list(ed, "events")}
      blank={() => ({
        id: newId(),
        title: t("apps.newEvent"),
        date: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10),
        location: "",
        description: "",
        image: "",
        capacity: 50,
      })}
      fields={(e, set) => (
        <>
          <Text
            label={t("apps.postTitle")}
            value={e.title}
            onChange={(title) => set({ title }, "t")}
          />
          <Text
            label={t("apps.date")}
            value={e.date}
            onChange={(date) => set({ date }, "d")}
          />
          <Text
            label={t("apps.location")}
            value={e.location}
            onChange={(location) => set({ location }, "l")}
          />
          <Text
            area
            label={t("apps.description")}
            value={e.description}
            onChange={(description) => set({ description }, "de")}
          />
          <Num
            label={t("apps.capacity")}
            value={e.capacity}
            min={0}
            onChange={(capacity) => set({ capacity }, "c")}
          />
          <ImageField
            label={t("inspector.image")}
            value={e.image}
            site={ed.site}
            onChange={(image) => set({ image })}
          />
        </>
      )}
    />
  )
}

function Content({ ed }: { ed: Editor }) {
  const t = useT(messages)
  return (
    <Records<Collection>
      items={ed.site.collections}
      title={(c) => `${c.name} (${c.items.length})`}
      addLabel={t("apps.addCollection")}
      onChange={list(ed, "collections")}
      blank={() => ({ id: newId(), name: t("apps.newCollection"), items: [] })}
      fields={(c, set) => (
        <>
          <Text
            label={t("apps.name")}
            value={c.name}
            onChange={(name) => set({ name }, "n")}
          />
          <Records
            items={c.items}
            title={(i) => i.title}
            addLabel={t("apps.addItem")}
            onChange={(items, key) => set({ items }, key)}
            blank={() => ({
              id: newId(),
              title: t("apps.newItem"),
              subtitle: "",
              body: "",
              image: "",
              url: "",
            })}
            fields={(i, setItem) => (
              <>
                <Text
                  label={t("apps.postTitle")}
                  value={i.title}
                  onChange={(title) => setItem({ title }, "t")}
                />
                <Text
                  label={t("apps.subtitle")}
                  value={i.subtitle}
                  onChange={(subtitle) => setItem({ subtitle }, "s")}
                />
                <Text
                  area
                  label={t("apps.body")}
                  value={i.body}
                  onChange={(body) => setItem({ body }, "b")}
                />
                <ImageField
                  label={t("inspector.image")}
                  value={i.image}
                  site={ed.site}
                  onChange={(image) => setItem({ image })}
                />
                <Text
                  label={t("link.url")}
                  value={i.url}
                  onChange={(url) => setItem({ url }, "u")}
                />
              </>
            )}
          />
        </>
      )}
    />
  )
}

const TABS = ["store", "bookings", "blog", "events", "content"] as const

export function AppsPanel({ ed }: { ed: Editor }) {
  const t = useT(messages)
  const [tab, setTab] = React.useState<(typeof TABS)[number]>("store")
  const installed = tab === "content" || hasApp(ed.site, tab as App)
  return (
    <div className="fe-panel-body">
      <div className="fe-segments" role="tablist">
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            {t(`apps.${id}`)}
          </button>
        ))}
      </div>
      {!installed && (
        <div className="fe-install">
          <p>{t(`apps.${tab as App}Hint`)}</p>
          <button
            type="button"
            className="fr-primary"
            onClick={() => ed.edit((s) => addApp(s, tab as App))}
          >
            {t("apps.add", { name: t(`apps.${tab as App}`) })}
          </button>
        </div>
      )}
      {tab === "store" && installed && <Store ed={ed} />}
      {tab === "bookings" && installed && <Bookings ed={ed} />}
      {tab === "blog" && installed && <Blog ed={ed} />}
      {tab === "events" && installed && <Events ed={ed} />}
      {tab === "content" && <Content ed={ed} />}
    </div>
  )
}
