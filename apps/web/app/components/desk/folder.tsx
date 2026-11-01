import * as React from "react"

import { useT } from "@/i18n/core"
import { useLocale } from "@/i18n/core"
import type { CastMember, Scene } from "@/lib/desk/fountain"
import { compileCustom } from "@/lib/desk/lint"
import {
  REVISIONS,
  totalWords,
  toManuscript,
  type Manuscript,
  type Part,
} from "@/lib/desk/model"
import {
  checkForm,
  dominantMeter,
  formById,
  FORMS,
  lastWord,
  rhymesFor,
  type FormIssue,
} from "@/lib/desk/poetry"
import { STYLES, stylesFor } from "@/lib/desk/styles"
import type { Alert, Level } from "@/lib/desk/vale/vale"
import { useSupabase } from "@/lib/supabase.browser"

import { messages } from "./desk.messages"
import type { Tools } from "./editor"

export type FolderTab =
  "notes" | "styles" | "verse" | "report" | "drafts" | "title"

interface Props {
  tab: FolderTab
  onTab(t: FolderTab): void
  manuscript: Manuscript
  manuscriptId: string
  part: Part
  alerts: Alert[]
  caret: { word: string; line: number }
  tools: Tools
  onTools(p: Partial<Tools>): void
  change(u: (m: Manuscript) => Manuscript): void
  patchPart(id: string, p: Partial<Part>): void
  onJump(a: Alert): void
  onApply(a: Alert): void
  onAccept(a: Alert): void
  onInsert(s: string): void
  scenes: Scene[]
  cast: CastMember[]
  pages: number
  onRestore(m: Manuscript): void
  dictReady: boolean
}

export function Folder(p: Props) {
  const t = useT(messages)
  const { manuscript: m } = p
  const tabs: FolderTab[] = [
    "notes",
    "styles",
    ...(m.kind === "poetry" ? (["verse"] as const) : []),
    ...(m.kind === "screenplay" ? (["report"] as const) : []),
    "drafts",
    "title",
  ]
  return (
    <section className="dk-folder" aria-label={t("folder.label")}>
      <div className="dk-folder-tabs" role="tablist">
        {tabs.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={p.tab === id}
            data-on={p.tab === id}
            onClick={() => p.onTab(id)}
          >
            {t(`folder.${id}`)}
            {id === "notes" && p.alerts.length ? (
              <i>{p.alerts.length}</i>
            ) : null}
          </button>
        ))}
      </div>
      <div className="dk-folder-body" role="tabpanel">
        {p.tab === "notes" ? <Notes {...p} /> : null}
        {p.tab === "styles" ? <Styles {...p} /> : null}
        {p.tab === "verse" ? <Verse {...p} /> : null}
        {p.tab === "report" ? <Report {...p} /> : null}
        {p.tab === "drafts" ? <Drafts {...p} /> : null}
        {p.tab === "title" ? <TitlePage {...p} /> : null}
      </div>
    </section>
  )
}

function Notes({
  alerts,
  manuscript: m,
  change,
  onJump,
  onApply,
  onAccept,
}: Props) {
  const t = useT(messages)
  const levels: Level[] = ["suggestion", "warning", "error"]
  const count = (l: Level) => alerts.filter((a) => a.level === l).length
  return (
    <div className="grid gap-3">
      <div
        className="dk-levels"
        role="radiogroup"
        aria-label={t("notes.level")}
      >
        {levels.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={m.minLevel === l}
            data-on={m.minLevel === l}
            onClick={() => change((d) => ({ ...d, minLevel: l }))}
          >
            {t(`notes.${l}`)} <small>{count(l)}</small>
          </button>
        ))}
      </div>
      {!m.styles.length && !m.customRules.length ? (
        <p className="dk-pencil">{t("notes.noStyle")}</p>
      ) : !alerts.length ? (
        <p className="dk-pencil">{t("notes.clean")}</p>
      ) : (
        <ol className="grid gap-2">
          {alerts.slice(0, 200).map((a, i) => (
            <li
              key={`${a.start}-${a.check}-${i}`}
              className="dk-note"
              data-level={a.level}
            >
              <button
                type="button"
                className="dk-note-hit"
                onClick={() => onJump(a)}
              >
                <em>
                  {a.match.length > 42 ? `${a.match.slice(0, 40)}…` : a.match}
                </em>
                <span>{a.message}</span>
                <small>{a.check}</small>
              </button>
              <div className="flex gap-3">
                {a.fix !== undefined ? (
                  <button
                    type="button"
                    className="dk-note-act"
                    onClick={() => onApply(a)}
                  >
                    {a.fix
                      ? t("notes.applyTo", { fix: a.fix })
                      : t("notes.strike")}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="dk-note-act"
                  onClick={() => onAccept(a)}
                >
                  {t("notes.ignore")}
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

// The rolodex: a real wheel of cards. It turns with the scroll wheel, a drag or
// the arrow keys, and each card is a button that takes the style on or off.
function Styles({ manuscript: m, change }: Props) {
  const t = useT(messages)
  const list = React.useMemo(() => stylesFor(m.kind), [m.kind])
  const [turn, setTurn] = React.useState(0)
  const wheel = React.useRef<HTMLDivElement>(null)
  const at = ((Math.round(turn) % list.length) + list.length) % list.length
  const style = list[at]!
  // Radius from the polygon: cards this tall meet edge to edge, never overlap.
  const faces = Math.max(list.length, 8)
  const step = 360 / faces
  const radius = Math.round(61 / Math.tan(Math.PI / faces))

  React.useEffect(() => {
    const el = wheel.current
    if (!el) return
    const on = (e: WheelEvent) => {
      e.preventDefault()
      setTurn((v) => v + Math.sign(e.deltaY) * 0.5)
    }
    el.addEventListener("wheel", on, { passive: false })
    return () => el.removeEventListener("wheel", on)
  }, [])

  const active = m.styles.includes(style.id)
  const toggle = () =>
    change((d) => ({
      ...d,
      styles: active
        ? d.styles.filter((s) => s !== style.id)
        : [...d.styles, style.id],
    }))
  const ruleNames = Object.keys(style.rules)

  return (
    <div className="grid gap-4">
      <div
        ref={wheel}
        className="dk-rolo"
        tabIndex={0}
        role="listbox"
        aria-label={t("styles.title")}
        aria-activedescendant={`dk-rolo-${style.id}`}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault()
            setTurn((v) => Math.round(v) + 1)
          }
          if (e.key === "ArrowUp") {
            e.preventDefault()
            setTurn((v) => Math.round(v) - 1)
          }
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault()
            toggle()
          }
        }}
      >
        <div
          className="dk-rolo-drum"
          style={{
            transform: `translateZ(${-radius}px) rotateX(${turn * step}deg)`,
          }}
        >
          {list.map((s, i) => {
            const on = m.styles.includes(s.id)
            return (
              <div
                key={s.id}
                id={`dk-rolo-${s.id}`}
                role="option"
                aria-selected={on}
                className="dk-rolo-card"
                data-front={i === at || undefined}
                data-near={
                  Math.min(
                    (i - at + list.length) % list.length,
                    (at - i + list.length) % list.length
                  ) <= 1 || undefined
                }
                style={{
                  transform: `rotateX(${-i * step}deg) translateZ(${radius}px)`,
                }}
                onClick={() => {
                  if (i === at) toggle()
                  else
                    setTurn(
                      (v) =>
                        v +
                        (((i - at + list.length + list.length / 2) %
                          list.length) -
                          list.length / 2)
                    )
                }}
              >
                <b>{s.name}</b>
                <small>{s.source}</small>
                {on ? <i className="dk-stamp">{t("styles.on")}</i> : null}
              </div>
            )
          })}
        </div>
        <span className="dk-rolo-axle" aria-hidden />
      </div>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="dk-tab-btn"
          aria-label={t("styles.prev")}
          onClick={() => setTurn((v) => Math.round(v) - 1)}
        >
          ↑
        </button>
        <button type="button" className="dk-tab-btn flex-1" onClick={toggle}>
          {active
            ? t("styles.takeOff", { name: style.name })
            : t("styles.putOn", { name: style.name })}
        </button>
        <button
          type="button"
          className="dk-tab-btn"
          aria-label={t("styles.next")}
          onClick={() => setTurn((v) => Math.round(v) + 1)}
        >
          ↓
        </button>
      </div>
      <p className="dk-pencil">
        {t(`motto.${style.id.replace("-", "")}` as "motto.hemingway")}
      </p>
      <details className="dk-details">
        <summary>{t("styles.rules", { count: ruleNames.length })}</summary>
        <ul className="grid gap-1">
          {ruleNames.map((r) => {
            const name = `${style.name}.${r}`
            const muted = m.mutedRules.includes(name)
            return (
              <li key={r}>
                <label className="dk-rule">
                  <input
                    type="checkbox"
                    checked={!muted}
                    onChange={() =>
                      change((d) => ({
                        ...d,
                        mutedRules: muted
                          ? d.mutedRules.filter((x) => x !== name)
                          : [...d.mutedRules, name],
                      }))
                    }
                  />
                  {r}
                </label>
              </li>
            )
          })}
        </ul>
      </details>
      <CustomRules manuscript={m} change={change} />
    </div>
  )
}

const EXAMPLE = `extends: existence
message: "Do you need '%s'?"
level: warning
ignorecase: true
tokens:
  - suddenly`

function CustomRules({
  manuscript: m,
  change,
}: {
  manuscript: Manuscript
  change(u: (m: Manuscript) => Manuscript): void
}) {
  const t = useT(messages)
  const [source, setSource] = React.useState("")
  const [name, setName] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const add = (rule: string, label: string) => {
    const clean =
      label.replace(/[^\w-]+/g, "") || `Rule${m.customRules.length + 1}`
    const compiled = compileCustom(clean, rule)
    if (compiled instanceof Error) {
      setError(compiled.message)
      return false
    }
    change((d) => ({
      ...d,
      customRules: [
        ...d.customRules.filter((r) => r.name !== clean),
        { name: clean, source: rule },
      ],
    }))
    setError(null)
    return true
  }
  return (
    <details className="dk-details">
      <summary>{t("styles.custom", { count: m.customRules.length })}</summary>
      <div className="grid gap-2">
        <p className="text-xs">{t("styles.customHint")}</p>
        {m.customRules.map((r) => (
          <div
            key={r.name}
            className="flex items-center justify-between gap-2 text-sm"
          >
            <code className="truncate">{r.name}</code>
            <button
              type="button"
              className="dk-note-act"
              onClick={() =>
                change((d) => ({
                  ...d,
                  customRules: d.customRules.filter((x) => x.name !== r.name),
                }))
              }
            >
              {t("styles.remove")}
            </button>
          </div>
        ))}
        <input
          className="dk-field"
          placeholder={t("styles.ruleName")}
          aria-label={t("styles.ruleName")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <textarea
          className="dk-field font-mono"
          rows={7}
          spellCheck={false}
          placeholder={EXAMPLE}
          aria-label={t("styles.ruleSource")}
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />
        {error ? (
          <p role="alert" className="dk-error">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <button
            type="button"
            className="dk-tab-btn flex-1"
            disabled={!source.trim()}
            onClick={() => {
              if (add(source, name)) {
                setSource("")
                setName("")
              }
            }}
          >
            {t("styles.addRule")}
          </button>
          <label className="dk-tab-btn cursor-pointer">
            {t("styles.upload")}
            <input
              type="file"
              accept=".yml,.yaml"
              multiple
              className="sr-only"
              onChange={async (e) => {
                for (const f of e.target.files ?? [])
                  add(await f.text(), f.name.replace(/\.ya?ml$/, ""))
                e.target.value = ""
              }}
            />
          </label>
        </div>
      </div>
    </details>
  )
}

const issueLine = (i: FormIssue) => ("line" in i ? i.line + 1 : 0)

function Verse({
  manuscript: m,
  part,
  tools,
  onTools,
  patchPart,
  caret,
  onInsert,
  dictReady,
}: Props) {
  const t = useT(messages)
  const form = formById(part.form)
  const issues = React.useMemo(
    () => checkForm(part.body, form, m.language),
    [part.body, form, m.language]
  )
  const lines = part.body.split("\n")
  const meter = React.useMemo(
    () =>
      m.language === "en" ? dominantMeter(lines.filter((l) => l.trim())) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [part.body, m.language, dictReady]
  )
  const seed = caret.word || lastWord(lines[caret.line] ?? "")
  const hits = React.useMemo(
    () => (dictReady && seed && m.language === "en" ? rhymesFor(seed) : []),
    [dictReady, seed, m.language]
  )
  const describe = (i: FormIssue) => {
    switch (i.code) {
      case "lines":
        return t("verse.issueLines", { expected: i.expected, got: i.got })
      case "stanza":
        return t("verse.issueStanza", {
          n: i.stanza + 1,
          expected: i.expected,
          got: i.got,
        })
      case "syllables":
        return t("verse.issueSyllables", {
          n: i.line + 1,
          expected: i.expected,
          got: i.got,
        })
      case "rhyme":
        return t("verse.issueRhyme", { n: i.line + 1, word: i.expected })
      case "refrain":
        return t("verse.issueRefrain", { n: i.line + 1, source: i.source + 1 })
      case "meter":
        return t("verse.issueMeter", { n: i.line + 1 })
      case "endword":
        return t("verse.issueEnd", { n: i.line + 1, word: i.expected })
      default:
        return t("verse.issueRefrain", { n: 0, source: 0 })
    }
  }
  return (
    <div className="grid gap-4">
      <label className="grid gap-1">
        <span className="dk-label">{t("verse.form")}</span>
        <select
          className="dk-field"
          value={form.id}
          onChange={(e) => patchPart(part.id, { form: e.target.value })}
        >
          {FORMS.map((f) => (
            <option key={f.id} value={f.id}>
              {t(`forms.${f.id.replace("-", "")}` as "forms.free")}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <label className="dk-rule">
          <input
            type="checkbox"
            checked={tools.scansion}
            onChange={(e) => onTools({ scansion: e.target.checked })}
          />
          {t("verse.scansion")}
        </label>
        <label className="dk-rule">
          <input
            type="checkbox"
            checked={tools.rhymes}
            onChange={(e) => onTools({ rhymes: e.target.checked })}
          />
          {t("verse.rhymeMarks")}
        </label>
      </div>
      {meter ? (
        <p className="dk-pencil">
          {t("verse.heard", {
            meter: t(`meters.${meter.meter}`),
            feet: t(`feet.f${Math.min(meter.feet, 8)}` as "feet.f5"),
          })}
        </p>
      ) : null}
      {form.id !== "free" ? (
        issues.length ? (
          <ul className="grid gap-1">
            {issues.slice(0, 40).map((i, n) => (
              <li key={n} className="dk-issue">
                {describe(i)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="dk-pencil">{t("verse.formOk")}</p>
        )
      ) : null}
      <div className="grid gap-2">
        <span className="dk-label">
          {seed ? t("verse.rhymesFor", { word: seed }) : t("verse.rhymes")}
        </span>
        {m.language === "fr" ? (
          <p className="text-xs">{t("verse.rhymesEnglish")}</p>
        ) : !dictReady ? (
          <p className="text-xs">{t("verse.loading")}</p>
        ) : hits.length ? (
          <div className="dk-rhymes">
            {hits.map((h) => (
              <button
                key={h.word}
                type="button"
                data-kind={h.kind}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onInsert(h.word)
                }}
              >
                {h.word}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-xs">{t("verse.noRhymes")}</p>
        )}
      </div>
      {issues.length ? (
        <span className="sr-only">{issueLine(issues[0]!)}</span>
      ) : null}
    </div>
  )
}

function Report({ manuscript: m, change, scenes, cast, pages }: Props) {
  const t = useT(messages)
  const interior = scenes.filter((s) => s.interior === "INT").length
  const night = scenes.filter((s) => /NIGHT/i.test(s.time)).length
  const talk = cast.reduce((n, c) => n + c.words, 0)
  const places = new Map<string, number>()
  for (const s of scenes) places.set(s.place, (places.get(s.place) ?? 0) + 1)
  return (
    <div className="grid gap-4">
      <dl className="dk-facts">
        <div>
          <dt>{t("report.runtime")}</dt>
          <dd>{t("report.minutes", { count: pages })}</dd>
        </div>
        <div>
          <dt>{t("report.scenes")}</dt>
          <dd>{scenes.length}</dd>
        </div>
        <div>
          <dt>{t("report.interior")}</dt>
          <dd>
            {interior} / {scenes.length - interior}
          </dd>
        </div>
        <div>
          <dt>{t("report.night")}</dt>
          <dd>{night}</dd>
        </div>
      </dl>
      <div className="grid gap-1">
        <span className="dk-label">{t("report.cast")}</span>
        <ul className="grid gap-1">
          {cast.map((c) => (
            <li key={c.name} className="dk-cast">
              <span className="truncate">{c.name}</span>
              <i
                style={{
                  width: `${talk ? (c.words / cast[0]!.words) * 100 : 0}%`,
                }}
                aria-hidden
              />
              <small>
                {t("report.lines", { speeches: c.speeches, scenes: c.scenes })}
              </small>
            </li>
          ))}
        </ul>
      </div>
      <div className="grid gap-1">
        <span className="dk-label">{t("report.places")}</span>
        <ul className="grid gap-0.5 text-sm">
          {[...places.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([p, n]) => (
              <li key={p} className="flex justify-between gap-2">
                <span className="truncate">{p}</span>
                <small>{n}</small>
              </li>
            ))}
        </ul>
      </div>
      <div className="grid gap-1">
        <span className="dk-label">{t("report.revision")}</span>
        <div className="dk-revisions">
          {REVISIONS.map((r) => (
            <button
              key={r}
              type="button"
              data-color={r}
              data-on={m.revision === r}
              aria-label={r}
              aria-pressed={m.revision === r}
              onClick={() => change((d) => ({ ...d, revision: r }))}
            />
          ))}
        </div>
      </div>
      <p className="text-xs">{t("report.keys")}</p>
    </div>
  )
}

function Drafts({ manuscript: m, manuscriptId, onRestore }: Props) {
  const t = useT(messages)
  const { locale } = useLocale()
  const supabase = useSupabase()
  const [rows, setRows] = React.useState<
    { id: string; label: string; words: number; created_at: string }[] | null
  >(null)
  const [label, setLabel] = React.useState("")
  const load = React.useCallback(async () => {
    const { data } = await supabase
      .from("comic_manuscript_drafts")
      .select("id, label, words, created_at")
      .eq("manuscript_id", manuscriptId)
      .order("created_at", { ascending: false })
    setRows(data ?? [])
  }, [manuscriptId, supabase])
  React.useEffect(() => {
    void load()
  }, [load])
  const keep = async () => {
    await supabase.from("comic_manuscript_drafts").insert({
      manuscript_id: manuscriptId,
      label: label.trim() || t("drafts.defaultLabel"),
      words: totalWords(m),
      data: m,
    })
    setLabel("")
    void load()
  }
  const restore = async (id: string) => {
    if (!window.confirm(t("drafts.confirmRestore"))) return
    const { data } = await supabase
      .from("comic_manuscript_drafts")
      .select("data")
      .eq("id", id)
      .single()
    if (data) onRestore(toManuscript(data.data))
  }
  const remove = async (id: string) => {
    await supabase.from("comic_manuscript_drafts").delete().eq("id", id)
    void load()
  }
  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  })
  return (
    <div className="grid gap-3">
      <p className="text-xs">{t("drafts.hint")}</p>
      <div className="flex">
        <input
          className="dk-field min-w-0 flex-1 !rounded-e-none"
          placeholder={t("drafts.label")}
          aria-label={t("drafts.label")}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <button
          type="button"
          className="dk-tab-btn !rounded-s-none"
          onClick={() => void keep()}
        >
          {t("drafts.keep")}
        </button>
      </div>
      <ol className="grid gap-2">
        {(rows ?? []).map((r) => (
          <li key={r.id} className="dk-note">
            <div className="dk-note-hit">
              <em>{r.label}</em>
              <small>
                {date.format(new Date(r.created_at))} ·{" "}
                {t("cards.words", { count: r.words })}
              </small>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                className="dk-note-act"
                onClick={() => void restore(r.id)}
              >
                {t("drafts.restore")}
              </button>
              <button
                type="button"
                className="dk-note-act"
                onClick={() => void remove(r.id)}
              >
                {t("drafts.remove")}
              </button>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function TitlePage({ manuscript: m, change }: Props) {
  const t = useT(messages)
  const field = (
    key: "subtitle" | "author" | "contact",
    label: string,
    area = false
  ) => (
    <label className="grid gap-1">
      <span className="dk-label">{label}</span>
      {area ? (
        <textarea
          className="dk-field"
          rows={3}
          value={m[key]}
          onChange={(e) => change((d) => ({ ...d, [key]: e.target.value }))}
        />
      ) : (
        <input
          className="dk-field"
          value={m[key]}
          onChange={(e) => change((d) => ({ ...d, [key]: e.target.value }))}
        />
      )}
    </label>
  )
  const number = (key: "dailyGoal" | "totalGoal", label: string) => (
    <label className="grid gap-1">
      <span className="dk-label">{label}</span>
      <input
        className="dk-field"
        type="number"
        min={0}
        step={50}
        value={m[key]}
        onChange={(e) =>
          change((d) => ({
            ...d,
            [key]: Math.max(0, Number(e.target.value) || 0),
          }))
        }
      />
    </label>
  )
  return (
    <div className="grid gap-3">
      {m.kind !== "screenplay"
        ? field("subtitle", t("titlePage.subtitle"))
        : null}
      {field("author", t("titlePage.author"))}
      {field("contact", t("titlePage.contact"), true)}
      <label className="grid gap-1">
        <span className="dk-label">{t("titlePage.language")}</span>
        <select
          className="dk-field"
          value={m.language}
          onChange={(e) => {
            const language = e.target.value as "en" | "fr"
            change((d) => {
              const allowed = STYLES.filter(
                (s) => s.language === language && s.for.includes(d.kind)
              ).map((s) => s.id)
              const kept = d.styles.filter((s) => allowed.includes(s))
              return {
                ...d,
                language,
                styles: kept.length ? kept : allowed.slice(0, 1),
              }
            })
          }}
        >
          <option value="en">English</option>
          <option value="fr">Français</option>
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        {number("dailyGoal", t("titlePage.dailyGoal"))}
        {number("totalGoal", t("titlePage.totalGoal"))}
      </div>
    </div>
  )
}
