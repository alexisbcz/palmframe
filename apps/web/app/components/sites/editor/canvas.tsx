import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Copy01Icon,
  Delete02Icon,
  Add01Icon,
} from "@hugeicons/core-free-icons"

import { useT } from "@/i18n/core"
import {
  cloneSection,
  findElement,
  mapSections,
  reorder,
} from "@/lib/sites/edit"
import {
  PHONE,
  STAGE,
  fontsHref,
  phoneLayout,
  type Box,
  type El,
  type Section,
} from "@/lib/sites/model"
import { resizeBox, snapMove, type Guide, type Handle } from "@/lib/sites/snap"

import { messages } from "../frontage.messages"
import { SiteView } from "../site"
import type { Editor } from "./state"

const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"]

type Gesture =
  | {
      kind: "move"
      ids: string[]
      start: Map<string, Box>
      sx: number
      sy: number
      moved: boolean
      stamp: string
    }
  | {
      kind: "resize"
      id: string
      handle: Handle
      start: Box
      sx: number
      sy: number
      stamp: string
    }
  | { kind: "height"; id: string; start: number; sy: number; stamp: string }
  | {
      kind: "marquee"
      section: string
      x: number
      y: number
      sx: number
      sy: number
    }

export function Canvas({
  ed,
  onAddSection,
}: {
  ed: Editor
  onAddSection: (after: number) => void
}) {
  const t = useT(messages)
  const { site, page, device, selection } = ed
  const stage = device === "desktop" ? STAGE : PHONE
  const outer = React.useRef<HTMLDivElement>(null)
  const inner = React.useRef<HTMLDivElement>(null)
  const [fit, setFit] = React.useState(1)
  const [zoom, setZoom] = React.useState(1)
  const [height, setHeight] = React.useState(0)
  const [guides, setGuides] = React.useState<Guide[]>([])
  const [hover, setHover] = React.useState<string | null>(null)
  const [marquee, setMarquee] = React.useState<Box | null>(null)
  const gesture = React.useRef<Gesture | null>(null)
  const scale = fit * zoom

  React.useEffect(() => {
    const node = outer.current
    if (!node) return
    const ro = new ResizeObserver(([entry]) =>
      setFit(Math.min(1, (entry!.contentRect.width - 48) / stage))
    )
    ro.observe(node)
    return () => ro.disconnect()
  }, [stage])

  React.useEffect(() => {
    const node = inner.current
    if (!node) return
    const ro = new ResizeObserver(([entry]) =>
      setHeight(entry!.contentRect.height)
    )
    ro.observe(node)
    return () => ro.disconnect()
  }, [])

  const sectionOf = (id: string) =>
    [...(site.header ? [site.header] : []), ...page.sections]
      .concat(site.footer ? [site.footer] : [])
      .find((s) => s.id === id)

  const beginEdit = (node: HTMLElement) => {
    const elNode = node.closest<HTMLElement>("[data-el]")
    const id = elNode?.dataset.el
    const target = elNode?.querySelector<HTMLElement>(".st-text, .st-button")
    if (!id || !target) return
    ed.select([id])
    target.contentEditable = "plaintext-only"
    target.focus()
    const range = document.createRange()
    range.selectNodeContents(target)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    const finish = () => {
      target.removeAttribute("contenteditable")
      target.removeEventListener("blur", finish)
      target.removeEventListener("keydown", keys)
      const text = target.innerText.replace(/\n$/, "")
      ed.patchEl(id, (e) =>
        e.type === "text"
          ? { ...e, props: { ...e.props, text } }
          : e.type === "button"
            ? { ...e, props: { ...e.props, label: text } }
            : e
      )
    }
    const keys = (ev: KeyboardEvent) => {
      ev.stopPropagation()
      if (ev.key === "Escape") target.blur()
    }
    target.addEventListener("blur", finish)
    target.addEventListener("keydown", keys)
  }

  const onPointerDown = (ev: React.PointerEvent) => {
    const target = ev.target as HTMLElement
    if (target.isContentEditable || ev.button !== 0) return
    const stamp = String(Date.now())
    const handle = target.closest<HTMLElement>("[data-handle]")
    if (handle) {
      const id = selection.elements[0]!
      const hit = findElement(site, id)
      if (!hit) return
      gesture.current = {
        kind: "resize",
        id,
        handle: handle.dataset.handle as Handle,
        start: ed.frame(hit.element, hit.section),
        sx: ev.clientX,
        sy: ev.clientY,
        stamp,
      }
      outer.current?.setPointerCapture(ev.pointerId)
      ev.preventDefault()
      return
    }
    const grow = target.closest<HTMLElement>("[data-grow]")
    if (grow) {
      const s = sectionOf(grow.dataset.grow!)!
      gesture.current = {
        kind: "height",
        id: s.id,
        start: device === "desktop" ? s.height : phoneLayout(s).height,
        sy: ev.clientY,
        stamp,
      }
      outer.current?.setPointerCapture(ev.pointerId)
      ev.preventDefault()
      return
    }
    if (target.closest("[data-tool]")) return
    const node = target.closest<HTMLElement>("[data-el]")
    if (node) {
      const id = node.dataset.el!
      const hit = findElement(site, id)
      if (!hit) return
      let ids = selection.elements
      if (ev.shiftKey)
        ids = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
      else if (!ids.includes(id)) ids = [id]
      ed.select(ids)
      if (hit.element.locked) return
      const start = new Map<string, Box>()
      for (const x of ids) {
        const found = findElement(site, x)
        if (found) start.set(x, ed.frame(found.element, found.section))
      }
      gesture.current = {
        kind: "move",
        ids,
        start,
        sx: ev.clientX,
        sy: ev.clientY,
        moved: false,
        stamp,
      }
      outer.current?.setPointerCapture(ev.pointerId)
      return
    }
    const sectionNode = target.closest<HTMLElement>("[data-section]")
    if (sectionNode) {
      const id = sectionNode.dataset.section!
      ed.select([], id)
      const rect = sectionNode
        .querySelector(".st-stage")!
        .getBoundingClientRect()
      gesture.current = {
        kind: "marquee",
        section: id,
        x: (ev.clientX - rect.left) / scale,
        y: (ev.clientY - rect.top) / scale,
        sx: ev.clientX,
        sy: ev.clientY,
      }
      outer.current?.setPointerCapture(ev.pointerId)
      return
    }
    ed.select([])
  }

  const onPointerMove = (ev: React.PointerEvent) => {
    const g = gesture.current
    if (!g) {
      const node = (ev.target as HTMLElement).closest<HTMLElement>("[data-el]")
      setHover(node?.dataset.el ?? null)
      return
    }
    if (g.kind === "move") {
      let dx = (ev.clientX - g.sx) / scale
      let dy = (ev.clientY - g.sy) / scale
      if (!g.moved && Math.hypot(dx, dy) < 3) return
      g.moved = true
      const first = g.start.get(g.ids[0]!)!
      const hit = findElement(site, g.ids[0]!)
      if (hit && !ev.altKey) {
        const others = hit.section.elements
          .filter((e) => !g.ids.includes(e.id))
          .map((e) => ed.frame(e, hit.section))
        const snap = snapMove(
          { ...first, x: first.x + dx, y: first.y + dy },
          others,
          stage
        )
        dx += snap.dx
        dy += snap.dy
        setGuides(snap.guides)
      } else setGuides([])
      const frames = new Map<string, Box>()
      for (const [id, b] of g.start)
        frames.set(id, {
          ...b,
          x: Math.round(b.x + dx),
          y: Math.round(b.y + dy),
        })
      ed.setFrames(frames, `move${g.stamp}`)
    }
    if (g.kind === "resize") {
      const box = resizeBox(
        g.start,
        g.handle,
        (ev.clientX - g.sx) / scale,
        (ev.clientY - g.sy) / scale,
        ev.shiftKey
      )
      ed.setFrames(new Map([[g.id, box]]), `size${g.stamp}`)
    }
    if (g.kind === "height") {
      const h = Math.max(40, Math.round(g.start + (ev.clientY - g.sy) / scale))
      ed.patchSection(
        g.id,
        (s) =>
          device === "desktop" ? { ...s, height: h } : { ...s, phoneHeight: h },
        `height${g.stamp}`
      )
    }
    if (g.kind === "marquee") {
      const dx = (ev.clientX - g.sx) / scale
      const dy = (ev.clientY - g.sy) / scale
      if (Math.hypot(dx, dy) < 4) return
      setMarquee({
        x: Math.min(g.x, g.x + dx),
        y: Math.min(g.y, g.y + dy),
        w: Math.abs(dx),
        h: Math.abs(dy),
      })
    }
  }

  const onPointerUp = (ev: React.PointerEvent) => {
    const g = gesture.current
    gesture.current = null
    setGuides([])
    if (g?.kind === "marquee" && marquee) {
      const s = sectionOf(g.section)
      if (s) {
        const inside = (b: Box) =>
          b.x < marquee.x + marquee.w &&
          b.x + b.w > marquee.x &&
          b.y < marquee.y + marquee.h &&
          b.y + b.h > marquee.y
        ed.select(
          s.elements
            .filter((e) => !e.locked && inside(ed.frame(e, s)))
            .map((e) => e.id)
        )
      }
      setMarquee(null)
    }
    // Dropping on another section moves the element into it.
    if (g?.kind === "move" && g.moved && g.ids.length === 1) {
      const under = document
        .elementsFromPoint(ev.clientX, ev.clientY)
        .map((n) => n.closest<HTMLElement>("[data-section]"))
        .find(Boolean)
      const hit = findElement(site, g.ids[0]!)
      const to = under?.dataset.section
      if (hit && to && to !== hit.section.id) {
        const fromRect = document
          .querySelector(`[data-section="${hit.section.id}"]`)!
          .getBoundingClientRect()
        const toRect = under!.getBoundingClientRect()
        const shift = (fromRect.top - toRect.top) / scale
        const key = device === "desktop" ? "box" : "phone"
        ed.edit((s) => {
          const live = findElement(s, hit.element.id)!.element
          const b = ed.frame(live, hit.section)
          const moved = {
            ...live,
            [key]: { ...b, y: Math.round(b.y + shift) },
          } as El
          return mapSections(s, (x) =>
            x.id === hit.section.id
              ? {
                  ...x,
                  elements: x.elements.filter((e) => e.id !== live.id),
                }
              : x.id === to
                ? { ...x, elements: [...x.elements, moved] }
                : x
          )
        })
      }
    }
  }

  const moveSection = (index: number, by: number) =>
    ed.patchPage((p) => ({
      ...p,
      sections: reorder(p.sections, index, index + by),
    }))

  const overlay = (s: Section) => {
    const index = page.sections.findIndex((x) => x.id === s.id)
    const inPage = index >= 0
    const active = selection.section === s.id
    const chosen = s.elements.filter((e) => selection.elements.includes(e.id))
    const hovered =
      hover && !selection.elements.includes(hover)
        ? s.elements.find((e) => e.id === hover)
        : null
    const box = (b: Box): React.CSSProperties => ({
      left: b.x,
      top: b.y,
      width: b.w,
      height: b.h,
    })
    return (
      <div
        className="fe-overlay"
        style={{ "--z": scale } as React.CSSProperties}
      >
        {hovered && (
          <div
            className="fe-outline fe-hover"
            style={box(ed.frame(hovered, s))}
          />
        )}
        {chosen.map((e) => (
          <div
            key={e.id}
            className="fe-outline"
            data-locked={e.locked || null}
            style={box(ed.frame(e, s))}
          >
            {chosen.length === 1 &&
              !e.locked &&
              HANDLES.map((h) => (
                <i key={h} data-handle={h} className="fe-handle" />
              ))}
          </div>
        ))}
        {guides.length > 0 &&
          chosen.length > 0 &&
          guides.map((g, i) => (
            <div
              key={i}
              className="fe-guide"
              data-axis={g.axis}
              style={g.axis === "x" ? { left: g.at } : { top: g.at }}
            />
          ))}
        {marquee && selection.section === s.id && (
          <div className="fe-marquee" style={box(marquee)} />
        )}
        {active && (
          <div className="fe-section-tag" data-tool>
            <b>{s.name}</b>
            {inPage && (
              <>
                <button
                  type="button"
                  aria-label={t("editor.moveUp")}
                  disabled={index === 0}
                  onClick={() => moveSection(index, -1)}
                >
                  <HugeiconsIcon icon={ArrowUp01Icon} size={14} />
                </button>
                <button
                  type="button"
                  aria-label={t("editor.moveDown")}
                  disabled={index === page.sections.length - 1}
                  onClick={() => moveSection(index, 1)}
                >
                  <HugeiconsIcon icon={ArrowDown01Icon} size={14} />
                </button>
                <button
                  type="button"
                  aria-label={t("editor.duplicate")}
                  onClick={() =>
                    ed.patchPage((p) => {
                      const sections = [...p.sections]
                      sections.splice(index + 1, 0, cloneSection(s))
                      return { ...p, sections }
                    })
                  }
                >
                  <HugeiconsIcon icon={Copy01Icon} size={14} />
                </button>
                <button
                  type="button"
                  aria-label={t("editor.delete")}
                  onClick={() => {
                    ed.patchPage((p) => ({
                      ...p,
                      sections: p.sections.filter((x) => x.id !== s.id),
                    }))
                    ed.select([])
                  }}
                >
                  <HugeiconsIcon icon={Delete02Icon} size={14} />
                </button>
              </>
            )}
          </div>
        )}
        <div className="fe-grow" data-grow={s.id} aria-hidden />
        {inPage && (
          <button
            type="button"
            className="fe-add-section"
            data-tool
            onClick={() => onAddSection(index)}
          >
            <HugeiconsIcon icon={Add01Icon} size={13} strokeWidth={2.4} />
            {t("editor.addSection")}
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      ref={outer}
      className="fe-canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={(ev) => {
        // Pointer capture aims the event at the canvas, so ask what's under it.
        const under = document.elementFromPoint(ev.clientX, ev.clientY)
        if (under instanceof HTMLElement) beginEdit(under)
      }}
    >
      <link
        rel="stylesheet"
        href={fontsHref([site.theme.heading, site.theme.body])}
        precedence="default"
      />
      <div
        className="fe-frame"
        data-device={device}
        style={{ width: stage * scale, height: height * scale }}
      >
        <div
          ref={inner}
          className="fe-scale"
          style={{ width: stage, transform: `scale(${scale})` }}
        >
          <SiteView site={site} page={page} overlay={overlay} device={device} />
        </div>
      </div>
      {!page.sections.length && (
        <button
          type="button"
          className="fr-primary fe-first"
          onClick={() => onAddSection(-1)}
        >
          {t("editor.addSection")}
        </button>
      )}
      <div className="fe-zoom" data-tool>
        <button
          type="button"
          aria-label={t("editor.zoomOut")}
          onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))}
        >
          −
        </button>
        <span>{Math.round(scale * 100)}%</span>
        <button
          type="button"
          aria-label={t("editor.zoomIn")}
          onClick={() => setZoom((z) => Math.min(1.6, z + 0.1))}
        >
          +
        </button>
      </div>
    </div>
  )
}
