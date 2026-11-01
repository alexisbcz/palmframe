import * as React from "react"
import { Link, useNavigate } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft01Icon,
  Copy01Icon,
  Download04Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"

import { booth, saveToken } from "@/lib/dub/booth.client"
import { timecode, type BoothStatus, type Shelf } from "@/lib/dub/model"

import { ArmedKey, errorOf, errorText, formatBytes, useDubT } from "./parts"
import type { Link as BoothLink } from "./use-booth"

const COMMAND = "uv run --script ~/Downloads/booth.py"

export function Plug({
  link,
  onPaired,
}: {
  link: BoothLink
  onPaired: () => void
}) {
  const t = useDubT()
  const [copied, setCopied] = React.useState(false)
  const [code, setCode] = React.useState("")
  const [bad, setBad] = React.useState(false)
  const [safari, setSafari] = React.useState(false)
  // A local address means a local app, so the Booth must be told who to answer.
  const [command, setCommand] = React.useState(COMMAND)

  React.useEffect(() => {
    setSafari(
      /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent)
    )
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname))
      setCommand(`${COMMAND} --app ${location.origin}`)
  }, [])

  const copy = () => {
    void navigator.clipboard.writeText(command).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    })
  }

  const pair = async (e: React.FormEvent) => {
    e.preventDefault()
    const token = code.trim()
    saveToken(token)
    try {
      await booth.status()
      onPaired()
    } catch {
      setBad(true)
    }
  }

  return (
    <div className="dub-plug">
      <div className="dub-socket" data-live={link === "unpaired"} aria-hidden>
        <i />
        <i />
        <span className="dub-cable" />
      </div>
      <div className="dub-plug-card">
        <p className="dub-kicker">{t("plug.kicker")}</p>
        <h1 className="studio-title">{t("plug.heading")}</h1>
        <p>{t("plug.body")}</p>
        {safari && (
          <p role="alert" className="dub-warn">
            {t("plug.safari")}
          </p>
        )}
        {link !== "unpaired" && (
          <ol>
            <li>{t("plug.step1")}</li>
            <li>
              {t("plug.step2")}
              <a className="dub-download" href="/dub/booth.py" download>
                {t("plug.download")}
                <HugeiconsIcon
                  icon={Download04Icon}
                  strokeWidth={2}
                  className="size-4"
                />
              </a>
              <div className="dub-command">
                <input
                  aria-label={t("plug.command")}
                  readOnly
                  value={command}
                  dir="ltr"
                />
                <button type="button" onClick={copy}>
                  {copied ? t("plug.copied") : t("plug.copy")}
                  <HugeiconsIcon
                    icon={copied ? Tick02Icon : Copy01Icon}
                    strokeWidth={2}
                    className="size-4"
                  />
                </button>
              </div>
            </li>
            <li>{t("plug.step3")}</li>
          </ol>
        )}
        <small>{t("plug.first")}</small>
        <form onSubmit={(e) => void pair(e)} className="dub-pair">
          <label htmlFor="booth-code">{t("plug.tokenHint")}</label>
          <div className="dub-command">
            <input
              id="booth-code"
              autoComplete="off"
              spellCheck={false}
              placeholder={t("plug.tokenLabel")}
              value={code}
              onChange={(e) => {
                setCode(e.target.value)
                setBad(false)
              }}
            />
            <button type="submit" disabled={!code.trim()}>
              {t("plug.pair")}
            </button>
          </div>
          {bad && (
            <p role="alert" className="dub-warn">
              {t("plug.badToken")}
            </p>
          )}
        </form>
        <p className="dub-listening">
          <span aria-hidden className="nv-led" data-on={link === "unpaired"} />
          {t("plug.waiting")}
        </p>
        <Link to="/projects" className="dub-link">
          {t("backToApp")}
        </Link>
      </div>
    </div>
  )
}

export function Lobby({ status }: { status: BoothStatus }) {
  const t = useDubT()
  const navigate = useNavigate()
  const [shelf, setShelf] = React.useState<Shelf[] | null>(null)
  const [threading, setThreading] = React.useState<number | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [over, setOver] = React.useState(false)
  const input = React.useRef<HTMLInputElement>(null)

  const load = React.useCallback(() => {
    booth.shelf().then(setShelf, (e) => setError(errorOf(e)))
  }, [])
  React.useEffect(load, [load])

  const thread = async (file: File) => {
    setError(null)
    setThreading(0)
    try {
      const project = await booth.upload(file, setThreading)
      await navigate(`/dub/${project.id}`)
    } catch (e) {
      setError(errorOf(e))
      setThreading(null)
    }
  }

  return (
    <div className="dub-lobby">
      <header className="dub-lobby-top">
        <Link to="/projects" className="dub-back" aria-label={t("backToApp")}>
          <HugeiconsIcon
            icon={ArrowLeft01Icon}
            strokeWidth={2}
            className="rtl:rotate-180"
          />
        </Link>
        <div>
          <h1 className="studio-title">{t("title")}</h1>
          <p>{t("tagline")}</p>
        </div>
      </header>
      {!status.ffmpeg && (
        <p role="alert" className="dub-warn">
          {t("plug.noFfmpeg")}
        </p>
      )}
      {!status.speech && (
        <p role="alert" className="dub-warn">
          {t("plug.noSpeech")}
        </p>
      )}
      <div className="dub-lobby-grid">
        <section
          className="dub-projector"
          data-over={over}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            const file = e.dataTransfer.files[0]
            if (file) void thread(file)
          }}
        >
          <div
            aria-hidden
            className="dub-projector-reels"
            data-busy={threading !== null}
          >
            <i />
            <i />
          </div>
          <h2 className="studio-title">
            {threading !== null ? t("lobby.threading") : t("lobby.drop")}
          </h2>
          {threading !== null ? (
            <span
              role="progressbar"
              aria-valuenow={Math.round(threading * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t("lobby.threading")}
              className="dub-ticket-bar"
            >
              <i style={{ transform: `scaleX(${threading})` }} />
            </span>
          ) : (
            <>
              <p>{t("lobby.dropHint")}</p>
              <input
                ref={input}
                hidden
                type="file"
                accept="video/*,.mkv,.ts"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ""
                  if (file) void thread(file)
                }}
              />
              <button
                type="button"
                className="nv-key"
                data-tone="fire"
                onClick={() => input.current?.click()}
              >
                {t("lobby.browse")}
              </button>
            </>
          )}
          {error && (
            <p role="alert" className="dub-warn">
              {errorText(t, error)}
            </p>
          )}
        </section>
        <section className="dub-shelf" aria-label={t("lobby.shelf")}>
          <h2 className="nv-engraved">{t("lobby.shelf")}</h2>
          {shelf && !shelf.length && (
            <p className="dub-empty">{t("lobby.empty")}</p>
          )}
          <ul>
            {shelf?.map((reel) => (
              <li key={reel.id}>
                <Link to={`/dub/${reel.id}`} className="dub-reel">
                  <i aria-hidden className="dub-can" />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate">{reel.title}</b>
                    <small>
                      {reel.status === "ingesting"
                        ? t("lobby.importing")
                        : reel.status === "failed"
                          ? t("lobby.broken")
                          : reel.lines
                            ? t("lobby.takes", {
                                done: reel.takes,
                                total: reel.lines,
                              })
                            : t("lobby.noScript")}
                      {reel.renders > 0 &&
                        ` · ${t("lobby.masters", { count: reel.renders })}`}
                    </small>
                  </span>
                  <time>{timecode(reel.duration)}</time>
                </Link>
                <ArmedKey
                  label="×"
                  armedLabel={t("lobby.removeYes")}
                  onConfirm={() =>
                    void booth
                      .remove(reel.id)
                      .then(load, (e) => setError(errorOf(e)))
                  }
                />
              </li>
            ))}
          </ul>
          <footer>
            <small>
              {t("lobby.folder")}: {status.home} ·{" "}
              {t("lobby.free", { size: formatBytes(status.free) })}
            </small>
            <small>{t("lobby.rights")}</small>
          </footer>
        </section>
      </div>
    </div>
  )
}
