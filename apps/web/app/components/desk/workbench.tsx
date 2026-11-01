import * as React from "react"
import { Link } from "react-router"

import { useT } from "@/i18n/core"
import { saveManuscript, type Saved } from "@/lib/desk/client"
import {
  castOf,
  paginate,
  parseScript,
  scenesOf,
  type Element,
} from "@/lib/desk/fountain"
import { lintBody } from "@/lib/desk/lint"
import {
  countWords,
  dayKey,
  newPart,
  totalWords,
  toManuscript,
  type Light,
  type Manuscript,
  type Part,
} from "@/lib/desk/model"
import {
  formById,
  hasDictionary,
  loadDictionary,
  scan,
  syllableCount,
} from "@/lib/desk/poetry"
import { carriage, strike, thud } from "@/lib/desk/sound"
import { READABILITY, textStats, type Alert } from "@/lib/desk/vale/vale"
import { useSupabase } from "@/lib/supabase.browser"

import { Bindery } from "./bindery"
import { Corkboard, Cards } from "./cards"
import "./desk.css"
import { messages } from "./desk.messages"
import {
  Editor,
  type EditorHandle,
  type Find,
  type MenuAnchor,
  type Tools,
} from "./editor"
import { Folder, type FolderTab } from "./folder"
import { Rail } from "./instruments"
import { Bubble, ContextMenu, type MenuActions } from "./menus"
import { DeskScene, useLight, type Sheet } from "./view"

type Status = "saved" | "dirty" | "saving" | Saved

interface HoveredLine {
  line: number
  top: number
  height: number
  text: string
  type: Element | null
  rect: DOMRect
}

const backupKey = (id: string) => `palmframe-desk-${id}`

export function Workbench({
  id,
  initial,
  revision,
}: {
  id: string
  initial: Manuscript
  revision: number
}) {
  const t = useT(messages)
  const supabase = useSupabase()
  const [m, setM] = React.useState(initial)
  const [partId, setPartId] = React.useState(initial.parts[0]!.id)
  const [status, setStatus] = React.useState<Status>("saved")
  const [alerts, setAlerts] = React.useState<Alert[]>([])
  const [tab, setTab] = React.useState<FolderTab>("notes")
  const [light, setLight] = useLight()
  const [tools, setTools] = React.useState<Tools>({
    scansion: initial.kind === "poetry",
    rhymes: initial.kind === "poetry",
    sound: false,
    focus: false,
    typewriter: false,
  })
  const [caret, setCaret] = React.useState({ word: "", line: 0, offset: 0 })
  const [slip, setSlip] = React.useState<{
    alert: Alert
    rect: DOMRect
  } | null>(null)
  const [find, setFind] = React.useState<Find | null>(null)
  const [replace, setReplace] = React.useState("")
  const [board, setBoard] = React.useState(false)
  const [bindery, setBindery] = React.useState(false)
  const [dictReady, setDictReady] = React.useState(hasDictionary() ? 1 : 0)
  const [sprint, setSprint] = React.useState<{
    ends: number
    start: number
  } | null>(null)

  const [recovered, setRecovered] = React.useState<Manuscript | null>(null)

  // A backup only outlives a save that failed, so finding one means text was
  // left behind: a lost connection, or a conflict with another tab.
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(backupKey(id))
      if (!raw) return
      const backup = toManuscript(JSON.parse(raw))
      if (JSON.stringify(backup.parts) !== JSON.stringify(initial.parts))
        setRecovered(backup)
      else localStorage.removeItem(backupKey(id))
    } catch {
      // Unreadable or blocked: nothing to offer.
    }
  }, [id, initial])

  const [pasteBlocked, setPasteBlocked] = React.useState(false)
  const [menu, setMenu] = React.useState<MenuAnchor | null>(null)
  const [selection, setSelection] = React.useState<{
    text: string
    rect: DOMRect
  } | null>(null)
  const [line, setLine] = React.useState<HoveredLine | null>(null)
  const [hint, setHint] = React.useState<{
    text: string
    rect: DOMRect
  } | null>(null)
  const hoverTimer = React.useRef(0)
  const hintTimer = React.useRef(0)
  const onSlip = React.useRef(false)

  const editor = React.useRef<EditorHandle>(null)
  const paperRef = React.useRef<HTMLDivElement>(null)
  const cardsRef = React.useRef<HTMLDivElement>(null)
  const folderRef = React.useRef<HTMLDivElement>(null)
  const railRef = React.useRef<HTMLDivElement>(null)

  const part = m.parts.find((p) => p.id === partId) ?? m.parts[0]!
  const form = m.kind === "poetry" ? formById(part.form) : null

  // Saving ------------------------------------------------------------------
  const latest = React.useRef({ m, revision, dirty: false, saving: false })
  latest.current.m = m

  const flush = React.useCallback(async () => {
    const s = latest.current
    if (!s.dirty || s.saving) return
    s.saving = true
    s.dirty = false
    setStatus("saving")
    const { result, revision: next } = await saveManuscript(
      supabase,
      id,
      s.m,
      s.revision
    )
    s.saving = false
    s.revision = next
    if (result === "ok") {
      setStatus(s.dirty ? "dirty" : "saved")
      try {
        localStorage.removeItem(backupKey(id))
      } catch {
        // The row is the copy that counts.
      }
      if (s.dirty) window.setTimeout(() => void flush(), 800)
    } else {
      s.dirty = true
      setStatus(result)
    }
  }, [id, supabase])

  const timer = React.useRef(0)
  const change = React.useCallback(
    (update: (m: Manuscript) => Manuscript) => {
      setM((prev) => {
        const next = update(prev)
        latest.current.m = next
        return next
      })
      latest.current.dirty = true
      setStatus("dirty")
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        void flush()
        try {
          localStorage.setItem(backupKey(id), JSON.stringify(latest.current.m))
        } catch {
          // Too big or private: the save above is what matters.
        }
      }, 1200)
    },
    [flush, id]
  )

  React.useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (latest.current.dirty) e.preventDefault()
    }
    window.addEventListener("beforeunload", leave)
    return () => window.removeEventListener("beforeunload", leave)
  }, [])

  const patchPart = React.useCallback(
    (pid: string, patch: Partial<Part>) =>
      change((d) => ({
        ...d,
        parts: d.parts.map((p) => (p.id === pid ? { ...p, ...patch } : p)),
      })),
    [change]
  )

  const partIdRef = React.useRef(partId)
  partIdRef.current = partId
  const onChange = React.useCallback(
    (body: string) => {
      setSlip(null)
      const pid = partIdRef.current
      change((d) => {
        const before = countWords(d.parts.find((p) => p.id === pid)?.body ?? "")
        const delta = Math.max(0, countWords(body) - before)
        const today = dayKey()
        return {
          ...d,
          parts: d.parts.map((p) => (p.id === pid ? { ...p, body } : p)),
          log: delta
            ? { ...d.log, [today]: (d.log[today] ?? 0) + delta }
            : d.log,
        }
      })
    },
    [change]
  )

  // Linting -----------------------------------------------------------------
  const rulesKey = `${m.styles}|${m.mutedRules}|${m.accepted}|${m.minLevel}|${m.customRules.length}|${m.language}`
  React.useEffect(() => {
    const handle = window.setTimeout(
      () => setAlerts(lintBody(m, part.body)),
      220
    )
    return () => window.clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part.body, part.id, rulesKey])

  React.useEffect(() => {
    if (m.kind !== "poetry" || dictReady) return
    void loadDictionary().then(() => setDictReady(1))
  }, [m.kind, dictReady])

  // Numbers for the instruments --------------------------------------------
  const words = React.useMemo(() => totalWords(m), [m])
  const today = m.log[dayKey()] ?? 0
  const grade = React.useMemo(() => {
    const s = textStats(part.body)
    return s.words > 20 ? READABILITY["Flesch-Kincaid"](s) : null
  }, [part.body])
  const script = React.useMemo(
    () => (m.kind === "screenplay" ? parseScript(part.body) : []),
    [m.kind, part.body]
  )
  const pages = React.useMemo(
    () => (m.kind === "screenplay" ? paginate(script).length : 0),
    [m.kind, script]
  )
  const scenes = React.useMemo(() => scenesOf(script), [script])
  const cast = React.useMemo(() => castOf(script), [script])

  // Parts --------------------------------------------------------------------
  const addPart = () => {
    const p = newPart("", "", m.kind === "poetry" ? "free" : undefined)
    change((d) => ({ ...d, parts: [...d.parts, p] }))
    setPartId(p.id)
    thud()
    window.setTimeout(() => editor.current?.focus(), 60)
  }
  const removePart = (pid: string) => {
    if (m.parts.length < 2) return
    if (!window.confirm(t("cards.confirmDelete"))) return
    const left = m.parts.filter((p) => p.id !== pid)
    change((d) => ({ ...d, parts: d.parts.filter((p) => p.id !== pid) }))
    if (pid === partId) setPartId(left[0]!.id)
  }
  const reorder = (from: number, to: number) =>
    change((d) => {
      const parts = [...d.parts]
      const [moved] = parts.splice(from, 1)
      parts.splice(to, 0, moved!)
      return { ...d, parts }
    })

  // A scene card moves its text: everything up to the next heading.
  const moveScene = (from: number, to: number) => {
    if (from === to) return
    const lines = part.body.split("\n")
    const starts = scenes.map((s) => s.line)
    const chunks = starts.map((s, i) =>
      lines.slice(s, starts[i + 1] ?? lines.length)
    )
    const head = lines.slice(0, starts[0] ?? 0)
    const [moved] = chunks.splice(from, 1)
    chunks.splice(to, 0, moved!)
    const tidy = chunks.map((c) => {
      const copy = [...c]
      while (copy.length && !copy[copy.length - 1]!.trim()) copy.pop()
      return [...copy, ""]
    })
    const body = [...head, ...tidy.flat()].join("\n").trimEnd()
    patchPart(part.id, { body })
    editor.current?.setBody(part.id, body)
  }

  const restore = (data: Manuscript) => {
    change(() => data)
    setPartId(data.parts[0]!.id)
    data.parts.forEach((p) => editor.current?.setBody(p.id, p.body))
    editor.current?.setBody(data.parts[0]!.id, data.parts[0]!.body)
  }

  // Keyboard ------------------------------------------------------------------
  React.useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key === "f") {
        e.preventDefault()
        setFind((f) => f ?? { query: "", index: 0 })
      }
      if (mod && e.key === "s") {
        e.preventDefault()
        latest.current.dirty = true
        void flush()
      }
      if (mod && e.key === ".") {
        e.preventDefault()
        setTools((v) => ({ ...v, focus: !v.focus }))
      }
      if (e.key === "Escape") {
        setFind(null)
        setSlip(null)
        setBoard(false)
        setBindery(false)
      }
    }
    window.addEventListener("keydown", on)
    return () => window.removeEventListener("keydown", on)
  }, [flush])

  const onKey = React.useCallback(
    (key: string) => {
      window.clearTimeout(hintTimer.current)
      setHint(null)
      if (!tools.sound) return
      if (key === "Enter") carriage()
      else strike(key)
    },
    [tools.sound]
  )

  const onCaret = React.useCallback(
    (c: {
      word: string
      line: number
      offset: number
      alert: number | null
      rect: DOMRect | null
    }) => {
      setCaret({ word: c.word, line: c.line, offset: c.offset })
      setAlerts((list) => {
        const a = c.alert !== null ? list[c.alert] : null
        setSlip(a && c.rect ? { alert: a, rect: c.rect } : null)
        return list
      })
    },
    []
  )

  const applyAlert = (a: Alert) => {
    if (a.fix === undefined) return
    // Removing a word takes its trailing space with it.
    const tail = a.fix === "" && part.body[a.end] === " " ? 1 : 0
    editor.current?.replaceRange(a.start, a.end + tail, a.fix)
    setSlip(null)
  }
  const acceptAlert = (a: Alert) => {
    change((d) => ({
      ...d,
      accepted: [...new Set([...d.accepted, a.match.trim().toLowerCase()])],
    }))
    setSlip(null)
  }

  // Flagged words open their note on hover, after a beat, and it stays while the
  // pointer crosses over to it.
  const alertsRef = React.useRef(alerts)
  alertsRef.current = alerts
  const onHoverAlert = React.useCallback(
    (index: number | null, rect: DOMRect | null) => {
      window.clearTimeout(hoverTimer.current)
      hoverTimer.current = window.setTimeout(
        () => {
          if (index === null) {
            if (!onSlip.current) setSlip(null)
            return
          }
          const a = alertsRef.current[index]
          if (a && rect) setSlip({ alert: a, rect })
        },
        index === null ? 320 : 240
      )
    },
    []
  )

  const facts = React.useRef({
    cast,
    scenes,
    kind: m.kind,
    language: m.language,
  })
  facts.current = { cast, scenes, kind: m.kind, language: m.language }

  const describeLine = React.useCallback(
    (l: HoveredLine) => {
      const { cast, scenes, kind, language } = facts.current
      if (kind === "poetry" && l.text.trim()) {
        const s = language === "en" ? scan(l.text) : null
        const heard = s?.meter
          ? `${t(`meters.${s.meter}`)} ${t(`feet.f${Math.min(s.feet, 8)}` as "feet.f5")}`
          : ""
        return [
          t("hint.syllables", { count: syllableCount(l.text, language) }),
          heard,
        ]
          .filter(Boolean)
          .join(" · ")
      }
      if (l.type === "character") {
        const name = l.text
          .replace(/^@/, "")
          .replace(/\s*\(.*$/, "")
          .trim()
          .toUpperCase()
        const c = cast.find((x) => x.name === name)
        return c
          ? t("report.lines", { speeches: c.speeches, scenes: c.scenes })
          : null
      }
      if (l.type === "scene") {
        const s = scenes.find((x) => x.line === l.line)
        return s?.characters.length ? s.characters.join(", ") : null
      }
      return null
    },
    [t]
  )

  const onHoverLine = React.useCallback(
    (l: HoveredLine | null) => {
      setLine(l)
      window.clearTimeout(hintTimer.current)
      setHint(null)
      if (!l) return
      hintTimer.current = window.setTimeout(() => {
        const text = describeLine(l)
        if (text) setHint({ text, rect: l.rect })
      }, 700)
    },
    [describeLine]
  )

  const closeMenu = React.useCallback(() => {
    setMenu(null)
    editor.current?.focus()
  }, [])

  const menuActions: MenuActions = {
    undo: () => editor.current?.undo(),
    redo: () => editor.current?.redo(),
    cut: () => editor.current?.clip("cut"),
    copy: () => editor.current?.clip("copy"),
    paste: () =>
      void editor.current?.paste().catch(() => setPasteBlocked(true)),
    selectLine: () => editor.current?.selectLine(),
    mark: (mark) => editor.current?.wrap(mark),
    sceneBreak: () => editor.current?.insertLine("***"),
    find: (word) => {
      setFind({ query: word, index: 0 })
      editor.current?.nextHit(word)
    },
    setElement: (to) => editor.current?.setElement(to),
    rhymes: () => setTab("verse"),
    swapWord: (word) => {
      if (menu) editor.current?.replaceSpan(menu.from, menu.to, word)
    },
    applyAlert,
    acceptAlert,
    muteRule: (check) =>
      change((d) => ({
        ...d,
        mutedRules: [...new Set([...d.mutedRules, check])],
      })),
  }

  const sheets = React.useCallback((): Sheet[] => {
    const rect = (el: HTMLElement | null, z: number): Sheet | null => {
      if (!el || !el.offsetParent) return null
      const r = el.getBoundingClientRect()
      return r.width
        ? { x: r.left, y: r.top, w: r.width, h: r.height, z }
        : null
    }
    // The column isn't an object: only the cards in it are.
    const cards = [...(cardsRef.current?.querySelectorAll(".dk-card") ?? [])]
    const stack = (): Sheet | null => {
      const first = cards[0]?.getBoundingClientRect()
      const last = cards.at(-1)?.getBoundingClientRect()
      return first && last
        ? {
            x: first.left,
            y: first.top,
            w: first.width + 8,
            h: last.bottom - first.top,
            z: 7,
          }
        : null
    }
    return [
      rect(paperRef.current, 1.5),
      stack(),
      rect(
        folderRef.current?.querySelector(
          ".dk-folder-body"
        ) as HTMLElement | null,
        2
      ),
      rect(railRef.current, 22),
    ].filter((s): s is Sheet => !!s)
  }, [])

  const statusLabel: Record<Status, string> = {
    saved: t("save.saved"),
    dirty: t("save.dirty"),
    saving: t("save.saving"),
    ok: t("save.saved"),
    conflict: t("save.conflict"),
    error: t("save.error"),
  }

  const paperTitle = m.title || t("untitled")
  const placeholder =
    m.kind === "novel"
      ? t("editor.placeholderNovel")
      : m.kind === "poetry"
        ? t("editor.placeholderPoetry")
        : t("editor.placeholderScript")

  return (
    <div
      className="dk fixed inset-0 overflow-hidden"
      data-light={light}
      data-kind={m.kind}
    >
      <DeskScene
        light={light}
        sheets={sheets}
        layout="work"
        tick={`${m.kind}${board}${m.parts.length}${scenes.length}`}
      />

      <div className="dk-layout">
        <div className="dk-left">
          <Link to="/desk" className="dk-brass-tag">
            <span aria-hidden>←</span> {t("backToShelf")}
          </Link>
          <div ref={cardsRef} className="min-h-0 flex-1">
            <Cards
              manuscript={m}
              current={part.id}
              scenes={scenes}
              caretLine={caret.line}
              onPick={setPartId}
              onPickScene={(line) => {
                const offset =
                  part.body.split("\n").slice(0, line).join("\n").length +
                  (line ? 1 : 0)
                editor.current?.jump(offset)
              }}
              onAdd={addPart}
              onDelete={removePart}
              onReorder={reorder}
              onMoveScene={moveScene}
              onBoard={() => setBoard(true)}
            />
          </div>
        </div>

        <div className="dk-center">
          <div className="dk-scroll">
            <div
              ref={paperRef}
              className="dk-sheet"
              onMouseLeave={() => onHoverLine(null)}
              data-kind={m.kind}
              data-revision={m.revision}
            >
              <input
                className="dk-work-title"
                value={m.title}
                placeholder={t("titlePlaceholder")}
                aria-label={t("titlePlaceholder")}
                onChange={(e) => {
                  const title = e.target.value
                  change((d) => ({ ...d, title }))
                }}
              />
              {m.kind !== "screenplay" ? (
                <input
                  className="dk-part-title"
                  value={part.title}
                  placeholder={
                    m.kind === "poetry"
                      ? t("editor.poemTitle")
                      : t("editor.chapterTitle")
                  }
                  aria-label={
                    m.kind === "poetry"
                      ? t("editor.poemTitle")
                      : t("editor.chapterTitle")
                  }
                  onChange={(e) =>
                    patchPart(part.id, { title: e.target.value })
                  }
                />
              ) : null}
              {line ? (
                <button
                  type="button"
                  className="dk-handle"
                  style={{ top: line.top + Math.min(line.height, 26) / 2 - 11 }}
                  aria-label={t("menu.lineMenu")}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    editor.current?.caretTo(line.line)
                    const a = editor.current?.anchor()
                    if (a) setMenu({ ...a, x: e.clientX + 14, y: e.clientY })
                  }}
                />
              ) : null}
              <Editor
                ref={editor}
                partId={part.id}
                body={part.body}
                kind={m.kind}
                language={m.language}
                form={form}
                tools={tools}
                alerts={alerts}
                find={find}
                dictReady={dictReady}
                placeholder={placeholder}
                ariaLabel={paperTitle}
                onChange={onChange}
                onCaret={onCaret}
                onMenu={setMenu}
                onSelection={setSelection}
                onHoverAlert={onHoverAlert}
                onHoverLine={onHoverLine}
                onKey={onKey}
              />
            </div>
          </div>
        </div>

        <div className="dk-right">
          <div ref={folderRef} className="min-h-0 flex-1">
            <Folder
              tab={tab}
              onTab={setTab}
              manuscript={m}
              manuscriptId={id}
              part={part}
              alerts={alerts}
              caret={caret}
              tools={tools}
              onTools={(patch) => setTools((v) => ({ ...v, ...patch }))}
              change={change}
              patchPart={patchPart}
              onJump={(a) => editor.current?.jump(a.start)}
              onApply={applyAlert}
              onAccept={acceptAlert}
              onInsert={(s) => editor.current?.insert(s)}
              scenes={scenes}
              cast={cast}
              pages={pages}
              onRestore={restore}
              dictReady={dictReady > 0}
            />
          </div>
        </div>
      </div>

      <div ref={railRef} className="dk-rail-wrap">
        <Rail
          manuscript={m}
          words={words}
          pages={pages}
          today={today}
          grade={grade}
          light={light}
          status={statusLabel[status]}
          statusKind={status}
          tools={tools}
          sprint={sprint}
          onSprint={setSprint}
          onLight={(l: Light) => {
            setLight(l)
            thud()
          }}
          onTools={(patch) => setTools((v) => ({ ...v, ...patch }))}
          onBind={() => setBindery(true)}
          onMark={(mark) => editor.current?.wrap(mark)}
          onFind={() => setFind({ query: "", index: 0 })}
        />
      </div>

      {pasteBlocked ? (
        <div className="dk-hint dk-hint-fixed" role="alert">
          {t("menu.pasteBlocked")}
          <button type="button" onClick={() => setPasteBlocked(false)}>
            {t("close")}
          </button>
        </div>
      ) : null}

      {hint && !slip && !menu && !selection ? (
        <div
          className="dk-hint"
          style={{ top: hint.rect.top - 6, insetInlineStart: hint.rect.left }}
        >
          {hint.text}
        </div>
      ) : null}

      {selection && !menu ? (
        <Bubble
          info={selection}
          kind={m.kind}
          type={editor.current?.anchor()?.type ?? null}
          actions={menuActions}
          onMenu={() => {
            const a = editor.current?.anchor()
            if (a) setMenu({ ...a, y: selection.rect.bottom + 8 })
          }}
        />
      ) : null}

      {menu ? (
        <ContextMenu
          anchor={menu}
          kind={m.kind}
          alert={menu.alert !== null ? (alerts[menu.alert] ?? null) : null}
          actions={menuActions}
          onClose={closeMenu}
        />
      ) : null}

      {slip && !menu ? (
        <div
          className="dk-slip"
          onMouseEnter={() => {
            onSlip.current = true
            window.clearTimeout(hoverTimer.current)
          }}
          onMouseLeave={() => {
            onSlip.current = false
            onHoverAlert(null, null)
          }}
          style={{
            top: Math.max(12, slip.rect.top - 8),
            insetInlineStart: slip.rect.left + slip.rect.width / 2,
          }}
          data-level={slip.alert.level}
        >
          <p>{slip.alert.message}</p>
          <div className="flex items-center gap-3">
            {slip.alert.fix !== undefined ? (
              <button type="button" onClick={() => applyAlert(slip.alert)}>
                {slip.alert.fix
                  ? t("notes.applyTo", { fix: slip.alert.fix })
                  : t("notes.strike")}
              </button>
            ) : null}
            <button type="button" onClick={() => acceptAlert(slip.alert)}>
              {t("notes.ignore")}
            </button>
          </div>
        </div>
      ) : null}

      {recovered ? (
        <div className="dk-recover" role="alert">
          <p>{t("recover.found")}</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                restore(recovered)
                setRecovered(null)
              }}
            >
              {t("recover.restore")}
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.removeItem(backupKey(id))
                } catch {
                  // Already gone or blocked.
                }
                setRecovered(null)
              }}
            >
              {t("recover.discard")}
            </button>
          </div>
        </div>
      ) : null}

      {find ? (
        <div className="dk-find" role="search">
          <input
            autoFocus
            className="dk-find-input"
            placeholder={t("find.find")}
            aria-label={t("find.find")}
            value={find.query}
            onChange={(e) => setFind({ ...find, query: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") editor.current?.nextHit(find.query)
            }}
          />
          <input
            className="dk-find-input"
            placeholder={t("find.replace")}
            aria-label={t("find.replace")}
            value={replace}
            onChange={(e) => setReplace(e.target.value)}
          />
          <button
            type="button"
            className="dk-find-btn"
            onClick={() => editor.current?.nextHit(find.query)}
          >
            {t("find.next")}
          </button>
          <button
            type="button"
            className="dk-find-btn"
            onClick={() => editor.current?.replaceAll(find.query, replace)}
          >
            {t("find.all")}
          </button>
          <button
            type="button"
            className="dk-find-btn"
            aria-label={t("close")}
            onClick={() => setFind(null)}
          >
            ×
          </button>
        </div>
      ) : null}

      {board ? (
        <Corkboard
          manuscript={m}
          scenes={scenes}
          onClose={() => setBoard(false)}
          onPick={(pid) => {
            setPartId(pid)
            setBoard(false)
          }}
          onPickScene={(line) => {
            setBoard(false)
            const offset =
              part.body.split("\n").slice(0, line).join("\n").length +
              (line ? 1 : 0)
            window.setTimeout(() => editor.current?.jump(offset), 40)
          }}
          onReorder={reorder}
          onMoveScene={moveScene}
          patchPart={patchPart}
        />
      ) : null}

      {bindery ? (
        <Bindery
          manuscript={m}
          words={words}
          pages={pages}
          change={change}
          onClose={() => setBindery(false)}
        />
      ) : null}
    </div>
  )
}
