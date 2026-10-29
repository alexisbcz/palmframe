import * as React from "react"
import { Link } from "react-router"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"

import { useLocale, useT } from "@/i18n/core"

import { messages } from "./api-keys.messages"

interface ApiKey {
  id: string
  name: string
  prefix: string
  last_used_at: string | null
  created_at: string
}

// Settings section for developer API keys. A new key is shown once; the
// server keeps only its hash.
export function ApiKeys() {
  const t = useT(messages)
  const { locale } = useLocale()
  const [keys, setKeys] = React.useState<ApiKey[] | null>(null)
  const [name, setName] = React.useState("")
  const [busy, setBusy] = React.useState<string | null>(null)
  const [fresh, setFresh] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    const res = await fetch("/api/keys")
    if (res.ok) setKeys((await res.json()).keys)
  }, [])
  React.useEffect(() => {
    void load()
  }, [load])

  const run = async (at: string, work: () => Promise<void>) => {
    setBusy(at)
    setError(null)
    try {
      await work()
      await load()
    } catch (e) {
      setError(
        e instanceof Error && e.message === "too_many_keys"
          ? t("errors.tooMany")
          : t("errors.generic")
      )
    } finally {
      setBusy(null)
    }
  }

  const create = () =>
    run("create", async () => {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? "error")
      setFresh(json.key)
      setCopied(false)
      setName("")
    })

  const revoke = (id: string) => {
    if (!window.confirm(t("confirmRevoke"))) return
    void run(id, async () => {
      const res = await fetch(`/api/keys?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("error")
    })
  }

  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    })

  return (
    <section className="grid gap-4 border-b py-8 last:border-b-0 md:grid-cols-[12rem_minmax(0,1fr)]">
      <h2 className="text-sm font-medium">{t("title")}</h2>
      <div className="flex max-w-lg flex-col gap-5">
        <p className="text-sm text-muted-foreground">
          {t("intro")}{" "}
          <Link to="/docs/api" className="underline underline-offset-4">
            {t("docs")}
          </Link>
        </p>

        {fresh && (
          <div className="flex flex-col gap-2 rounded-lg border p-3">
            <p role="status" className="text-sm">
              {t("created")}
            </p>
            <code className="rounded bg-muted px-2 py-1.5 font-mono text-xs break-all select-all">
              {fresh}
            </code>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onPress={() => {
                  void navigator.clipboard.writeText(fresh)
                  setCopied(true)
                }}
              >
                {copied ? t("copied") : t("copy")}
              </Button>
              <Button variant="ghost" onPress={() => setFresh(null)}>
                {t("done")}
              </Button>
            </div>
          </div>
        )}

        <form
          className="flex flex-col gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            void create()
          }}
        >
          <label
            htmlFor="api-key-name"
            className="text-sm text-muted-foreground"
          >
            {t("name")}
          </label>
          <div className="flex gap-2">
            <Input
              id="api-key-name"
              value={name}
              maxLength={60}
              placeholder={t("namePlaceholder")}
              onChange={(e) => setName(e.target.value)}
            />
            <Button
              type="submit"
              variant="outline"
              isDisabled={busy === "create"}
            >
              {busy === "create" && <Spinner />}
              {t("create")}
            </Button>
          </div>
        </form>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        {keys && !keys.length && (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        )}
        {!!keys?.length && (
          <ul className="flex flex-col divide-y rounded-lg border">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">
                    {k.name || k.prefix}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    <code className="font-mono">{k.prefix}…</code> ·{" "}
                    {k.last_used_at
                      ? t("lastUsed", { date: date(k.last_used_at) })
                      : t("neverUsed")}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  className="text-destructive"
                  isDisabled={busy === k.id}
                  onPress={() => revoke(k.id)}
                >
                  {busy === k.id && <Spinner />}
                  {t("revoke")}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
