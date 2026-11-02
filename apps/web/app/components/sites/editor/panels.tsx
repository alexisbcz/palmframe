import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Copy01Icon,
  Delete02Icon,
  EyeIcon,
  SquareLock02Icon,
  ViewOffIcon,
} from "@hugeicons/core-free-icons"

import { useT } from "@/i18n/core"
import { SECTION_LIBRARY } from "@/lib/sites/blocks"
import { allSections, clonePage, newPage, reorder } from "@/lib/sites/edit"
import { ADD_GROUPS, newElement } from "@/lib/sites/elements"
import { CORNERS, PALETTES, TYPEFACES } from "@/lib/sites/looks"
import {
  FONTS,
  fontStack,
  TOKENS,
  type El,
  type ElementType,
  type Section,
} from "@/lib/sites/model"

import { messages } from "../frontage.messages"
import { Choice, ImageField, Num, Text, Toggle } from "./fields"
import type { Editor } from "./state"

export function AddPanel({ ed }: { ed: Editor }) {
  const t = useT(messages)
  const add = (type: ElementType) => {
    const element = newElement(type, ed.site)
    const target =
      ed.section?.id ?? ed.page.sections[0]?.id ?? ed.site.header?.id
    if (!target) return
    // Drop it under what's already in the section, and make room.
    ed.edit((s) => {
      const fit = (x: Section): Section => {
        if (x.id !== target) return x
        const bottom = x.elements.reduce(
          (n, e) => Math.max(n, e.box.y + e.box.h),
          0
        )
        const y = bottom ? bottom + 32 : 60
        return {
          ...x,
          height: Math.max(x.height, y + element.box.h + 60),
          elements: [
            ...x.elements,
            { ...element, box: { ...element.box, y } } as El,
          ],
        }
      }
      return {
        ...s,
        header: s.header && fit(s.header),
        footer: s.footer && fit(s.footer),
        pages: s.pages.map((p) => ({ ...p, sections: p.sections.map(fit) })),
      }
    })
    ed.select([element.id])
  }
  return (
    <div className="fe-panel-body">
      {ADD_GROUPS.map((group) => (
        <section key={group.id}>
          <h3>{t(`add.${group.id as "basics"}`)}</h3>
          <div className="fe-add-grid">
            {group.types.map((type) => (
              <button key={type} type="button" onClick={() => add(type)}>
                {t(`elements.${type}`)}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

export function SectionsPanel({
  ed,
  after,
  onDone,
}: {
  ed: Editor
  after: number | null
  onDone: () => void
}) {
  const t = useT(messages)
  const groups = [...new Set(SECTION_LIBRARY.map((s) => s.group))]
  const insert = (make: () => Section) => {
    const section = make()
    ed.patchPage((p) => {
      const at = after === null ? p.sections.length : after + 1
      const sections = [...p.sections]
      sections.splice(at, 0, section)
      return { ...p, sections }
    })
    ed.select([], section.id)
    onDone()
  }
  return (
    <div className="fe-panel-body">
      {groups.map((group) => (
        <section key={group}>
          <h3>{t(`sectionGroups.${group as "Hero"}`)}</h3>
          <div className="fe-add-grid">
            {SECTION_LIBRARY.filter((s) => s.group === group).map((s) => (
              <button key={s.id} type="button" onClick={() => insert(s.make)}>
                {t(`sections.${s.id as "heroSplit"}`)}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

export function PagesPanel({ ed }: { ed: Editor }) {
  const t = useT(messages)
  const [name, setName] = React.useState("")
  const { site, page } = ed
  const pages = (fn: (p: typeof site.pages) => typeof site.pages) =>
    ed.edit((s) => ({ ...s, pages: fn(s.pages) }))
  return (
    <div className="fe-panel-body">
      <ul className="fe-list">
        {site.pages.map((p, i) => (
          <li key={p.id} data-on={p.id === page.id || null}>
            <button
              type="button"
              className="fe-list-main"
              onClick={() => {
                ed.setPageId(p.id)
                ed.select([])
              }}
            >
              {p.name}
              <small>/{p.slug}</small>
            </button>
            <button
              type="button"
              aria-label={p.hideFromMenu ? t("pages.show") : t("pages.hide")}
              onClick={() =>
                pages((all) =>
                  all.map((x) =>
                    x.id === p.id ? { ...x, hideFromMenu: !x.hideFromMenu } : x
                  )
                )
              }
            >
              <HugeiconsIcon
                icon={p.hideFromMenu ? ViewOffIcon : EyeIcon}
                size={14}
              />
            </button>
            <button
              type="button"
              aria-label={t("editor.moveUp")}
              disabled={i <= 1}
              onClick={() => pages((all) => reorder(all, i, i - 1))}
            >
              <HugeiconsIcon icon={ArrowUp01Icon} size={14} />
            </button>
            <button
              type="button"
              aria-label={t("editor.moveDown")}
              disabled={i === 0 || i === site.pages.length - 1}
              onClick={() => pages((all) => reorder(all, i, i + 1))}
            >
              <HugeiconsIcon icon={ArrowDown01Icon} size={14} />
            </button>
            <button
              type="button"
              aria-label={t("editor.duplicate")}
              disabled={i === 0}
              onClick={() =>
                pages((all) => [...all, clonePage(p, `${p.name} 2`)])
              }
            >
              <HugeiconsIcon icon={Copy01Icon} size={14} />
            </button>
            <button
              type="button"
              aria-label={t("editor.delete")}
              disabled={i === 0}
              onClick={() => {
                if (p.id === page.id) ed.setPageId(site.pages[0]!.id)
                pages((all) => all.filter((x) => x.id !== p.id))
              }}
            >
              <HugeiconsIcon icon={Delete02Icon} size={14} />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="fe-inline"
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim()) return
          const made = newPage(site, name.trim())
          pages((all) => [...all, made])
          ed.setPageId(made.id)
          ed.select([])
          setName("")
        }}
      >
        <input
          value={name}
          placeholder={t("pages.new")}
          aria-label={t("pages.new")}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="fr-ghost">{t("pages.add")}</button>
      </form>
    </div>
  )
}

export function LayersPanel({ ed }: { ed: Editor }) {
  const t = useT(messages)
  const sections = allSections(ed.site, ed.page)
  const label = (e: El) =>
    e.name ??
    (e.type === "text"
      ? e.props.text.slice(0, 32)
      : e.type === "button"
        ? e.props.label
        : t(`elements.${e.type}`))
  const stack = (section: Section, index: number, by: number) =>
    ed.patchSection(section.id, (s) => ({
      ...s,
      elements: reorder(s.elements, index, index + by),
    }))
  return (
    <div className="fe-panel-body">
      {sections.map((s) => (
        <section key={s.id}>
          <button
            type="button"
            className="fe-layer-title"
            data-on={ed.selection.section === s.id || null}
            onClick={() => ed.select([], s.id)}
          >
            {s.name}
          </button>
          <ul className="fe-list">
            {[...s.elements]
              .map((e, i) => ({ e, i }))
              .reverse()
              .map(({ e, i }) => (
                <li
                  key={e.id}
                  data-on={ed.selection.elements.includes(e.id) || null}
                >
                  <button
                    type="button"
                    className="fe-list-main"
                    onClick={() => ed.select([e.id])}
                  >
                    {label(e)}
                  </button>
                  {e.locked && (
                    <HugeiconsIcon icon={SquareLock02Icon} size={13} />
                  )}
                  <button
                    type="button"
                    aria-label={e.hidden ? t("pages.show") : t("pages.hide")}
                    onClick={() =>
                      ed.patchEl(
                        e.id,
                        (x) => ({ ...x, hidden: !x.hidden }) as El
                      )
                    }
                  >
                    <HugeiconsIcon
                      icon={e.hidden ? ViewOffIcon : EyeIcon}
                      size={14}
                    />
                  </button>
                  <button
                    type="button"
                    aria-label={t("layers.forward")}
                    disabled={i === s.elements.length - 1}
                    onClick={() => stack(s, i, 1)}
                  >
                    <HugeiconsIcon icon={ArrowUp01Icon} size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label={t("layers.backward")}
                    disabled={i === 0}
                    onClick={() => stack(s, i, -1)}
                  >
                    <HugeiconsIcon icon={ArrowDown01Icon} size={14} />
                  </button>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

export function DesignPanel({ ed }: { ed: Editor }) {
  const t = useT(messages)
  const { theme } = ed.site
  const set = (patch: Partial<typeof theme>, key?: string) =>
    ed.edit((s) => ({ ...s, theme: { ...s.theme, ...patch } }), key)
  const fonts = Object.keys(FONTS).map((f) => ({ id: f, name: f }))
  return (
    <div className="fe-panel-body">
      <section>
        <h3>{t("design.palettes")}</h3>
        <div className="fe-palettes">
          {PALETTES.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-label={p.name}
              aria-pressed={theme.palette.bg === p.palette.bg}
              style={{ background: p.palette.bg, color: p.palette.text }}
              onClick={() => set({ palette: p.palette })}
            >
              Aa
              <i style={{ background: p.palette.accent }} />
            </button>
          ))}
        </div>
      </section>
      <section>
        <h3>{t("design.colors")}</h3>
        <div className="fe-tokens">
          {TOKENS.map((token) => (
            <label key={token}>
              <input
                type="color"
                value={theme.palette[token]}
                onChange={(e) =>
                  set(
                    { palette: { ...theme.palette, [token]: e.target.value } },
                    `color${token}`
                  )
                }
              />
              {t(`tokens.${token}`)}
            </label>
          ))}
        </div>
      </section>
      <section>
        <h3>{t("design.type")}</h3>
        <div className="fe-add-grid">
          {TYPEFACES.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={theme.heading === f.heading}
              style={{ fontFamily: fontStack(f.heading) }}
              onClick={() => set({ heading: f.heading, body: f.body })}
            >
              {f.name}
            </button>
          ))}
        </div>
        <Choice
          label={t("design.headingFont")}
          value={theme.heading}
          options={fonts}
          onChange={(heading) => set({ heading })}
        />
        <Choice
          label={t("design.bodyFont")}
          value={theme.body}
          options={fonts}
          onChange={(body) => set({ body })}
        />
      </section>
      <section>
        <h3>{t("design.corners")}</h3>
        <div className="fe-segments">
          {CORNERS.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={theme.radius === c.radius}
              onClick={() => set({ radius: c.radius })}
            >
              {c.name}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

export function SettingsPanel({ ed }: { ed: Editor }) {
  const t = useT(messages)
  const { site } = ed
  const set = (patch: Partial<typeof site.settings>, key?: string) =>
    ed.edit((s) => ({ ...s, settings: { ...s.settings, ...patch } }), key)
  return (
    <div className="fe-panel-body">
      <Text
        label={t("settings.name")}
        value={site.name}
        onChange={(name) => ed.edit((s) => ({ ...s, name }), "name")}
      />
      <Text
        area
        label={t("settings.description")}
        value={site.settings.description}
        onChange={(description) => set({ description }, "sdesc")}
      />
      <ImageField
        label={t("settings.favicon")}
        value={site.settings.favicon}
        site={site}
        onChange={(favicon) => set({ favicon })}
      />
      <ImageField
        label={t("inspector.shareImage")}
        value={site.settings.shareImage}
        site={site}
        onChange={(shareImage) => set({ shareImage })}
      />
      <Toggle
        label={t("settings.indexable")}
        on={site.settings.indexable}
        onChange={(indexable) => set({ indexable })}
      />
      <p className="fe-note">{t("settings.indexableHint")}</p>
      <Num
        label={t("settings.horizon")}
        value={site.hours.horizon}
        min={1}
        max={180}
        onChange={(horizon) =>
          ed.edit((s) => ({ ...s, hours: { ...s.hours, horizon } }), "horizon")
        }
      />
    </div>
  )
}
