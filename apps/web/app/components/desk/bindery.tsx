import * as React from "react"

import { useT } from "@/i18n/core"
import { exportAs } from "@/lib/desk/client"
import {
  FORMATS,
  TRIMS,
  type FormatId,
  type Trim,
} from "@/lib/desk/export/common"
import { CLOTHS, type Cloth, type Manuscript } from "@/lib/desk/model"

import { messages } from "./desk.messages"

export function Bindery({
  manuscript: m,
  words,
  pages,
  change,
  onClose,
}: {
  manuscript: Manuscript
  words: number
  pages: number
  change(u: (m: Manuscript) => Manuscript): void
  onClose(): void
}) {
  const t = useT(messages)
  const formats = (Object.keys(FORMATS) as FormatId[]).filter((f) =>
    FORMATS[f].for.includes(m.kind)
  )
  const [trim, setTrim] = React.useState<Trim>("5.5x8.5")
  const [busy, setBusy] = React.useState<FormatId | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState<FormatId | null>(null)
  const spine = Math.min(
    64,
    12 + (m.kind === "screenplay" ? pages : words / 300) * 0.09
  )

  const run = async (f: FormatId) => {
    setBusy(f)
    setError(null)
    setDone(null)
    try {
      await exportAs(m, f, trim)
      setDone(f)
    } catch (e) {
      setError(e instanceof Error ? e.message : t("bindery.failed"))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      className="dk-bindery"
      role="dialog"
      aria-modal="true"
      aria-label={t("bindery.title")}
    >
      <div className="dk-bindery-stage" aria-hidden>
        <div
          className="dk-book"
          style={
            {
              "--cloth": CLOTHS[m.cloth],
              "--spine": `${spine}px`,
            } as React.CSSProperties
          }
          data-light-cloth={m.cloth === "bone" || undefined}
        >
          <div className="dk-book-front">
            <b>{m.title || t("untitled")}</b>
            <span>{m.author}</span>
          </div>
          <div className="dk-book-spine">
            <b>{m.title}</b>
          </div>
          <div className="dk-book-pages" />
          <div className="dk-book-back" />
        </div>
      </div>
      <div className="dk-order">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2>{t("bindery.title")}</h2>
            <p>{t("bindery.subtitle")}</p>
          </div>
          <button type="button" className="dk-note-act" onClick={onClose}>
            {t("close")}
          </button>
        </header>
        <div className="grid gap-2">
          <span className="dk-label">{t("bindery.cloth")}</span>
          <div className="flex gap-2">
            {(Object.keys(CLOTHS) as Cloth[]).map((c) => (
              <button
                key={c}
                type="button"
                className="dk-swatch"
                style={{ background: CLOTHS[c] }}
                data-on={m.cloth === c}
                aria-pressed={m.cloth === c}
                aria-label={t(`cloth.${c}`)}
                onClick={() => change((d) => ({ ...d, cloth: c }))}
              />
            ))}
          </div>
        </div>
        {m.kind !== "screenplay" ? (
          <div className="grid gap-2">
            <span className="dk-label">{t("bindery.trim")}</span>
            <div className="flex flex-wrap gap-1">
              {(Object.keys(TRIMS) as Trim[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  className="dk-trim"
                  data-on={trim === k}
                  aria-pressed={trim === k}
                  onClick={() => setTrim(k)}
                >
                  {TRIMS[k].label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="grid gap-2">
          <span className="dk-label">{t("bindery.formats")}</span>
          <ul className="dk-tags">
            {formats.map((f) => (
              <li key={f}>
                <button
                  type="button"
                  className="dk-tag"
                  disabled={!!busy}
                  onClick={() => void run(f)}
                >
                  <b>{t(`formats.${f}`)}</b>
                  <small>
                    {busy === f
                      ? t("bindery.working")
                      : done === f
                        ? t("bindery.done")
                        : t(`formatHints.${f}`)}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        </div>
        {error ? (
          <p role="alert" className="dk-error">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}
