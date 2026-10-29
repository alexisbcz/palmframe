import * as React from "react"
import { useRevalidator, useSearchParams } from "react-router"

import { Button, buttonVariants } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Spinner } from "@workspace/ui/components/spinner"
import { Switch } from "@workspace/ui/components/switch"

import { useLocale, useT } from "@/i18n/core"
import type { OpenRouterStatus } from "@/routes/api.openrouter"

import { messages } from "./openrouter.messages"

// Settings section for paying with your own OpenRouter account instead of
// credits. Connecting goes through OpenRouter's sign-in; a key can also be
// pasted. The server keeps the key encrypted and never sends it back.
export function OpenRouter() {
  const t = useT(messages)
  const { locale } = useLocale()
  const revalidator = useRevalidator()
  const [params] = useSearchParams()
  const [status, setStatus] = React.useState<OpenRouterStatus | null>(null)
  const [key, setKey] = React.useState("")
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const result = params.get("openrouter")

  const load = React.useCallback(async () => {
    const res = await fetch("/api/openrouter")
    if (res.ok) setStatus(await res.json())
  }, [])
  React.useEffect(() => {
    void load()
  }, [load])

  // Every change reloads the section and the root data, so the editor knows
  // who pays.
  const run = async (
    at: string,
    method: "POST" | "PATCH" | "DELETE",
    body?: object
  ) => {
    setBusy(at)
    setError(null)
    try {
      const res = await fetch("/api/openrouter", {
        method,
        headers: { "content-type": "application/json" },
        body: body && JSON.stringify(body),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? t("errors.generic"))
      await load()
      revalidator.revalidate()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.generic"))
      return false
    } finally {
      setBusy(null)
    }
  }

  const usd = (n: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(
      n
    )

  return (
    <section className="grid gap-4 border-b py-8 last:border-b-0 md:grid-cols-[12rem_minmax(0,1fr)]">
      <h2 className="text-sm font-medium">{t("title")}</h2>
      <div className="flex max-w-lg flex-col gap-5">
        <p className="text-sm text-muted-foreground">{t("intro")}</p>

        {result === "connected" && (
          <p role="status" className="text-sm">
            {t("connected")}
          </p>
        )}
        {result === "failed" && (
          <p role="alert" className="text-sm text-destructive">
            {t("errors.connect")}
          </p>
        )}

        {!status ? (
          <Spinner />
        ) : !status.available ? (
          <p className="text-sm text-muted-foreground">{t("unavailable")}</p>
        ) : !status.connected ? (
          <>
            <a
              href="/api/openrouter/connect"
              className={buttonVariants({ variant: "outline" }) + " self-start"}
            >
              {t("connect")}
            </a>
            <form
              className="flex flex-col gap-1.5"
              onSubmit={async (e) => {
                e.preventDefault()
                if (await run("key", "POST", { key: key.trim() })) setKey("")
              }}
            >
              <label
                htmlFor="openrouter-key"
                className="text-sm text-muted-foreground"
              >
                {t("pasteKey")}
              </label>
              <div className="flex gap-2">
                <Input
                  id="openrouter-key"
                  type="password"
                  autoComplete="off"
                  value={key}
                  placeholder="sk-or-…"
                  onChange={(e) => setKey(e.target.value)}
                />
                <Button
                  type="submit"
                  variant="outline"
                  isDisabled={!key.trim() || busy === "key"}
                >
                  {busy === "key" && <Spinner />}
                  {t("save")}
                </Button>
              </div>
            </form>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1 text-sm">
              <span>{t("keyEnding", { hint: status.hint })}</span>
              <span className="text-muted-foreground tabular-nums">
                {status.account
                  ? status.account.remaining !== null
                    ? t("spentLeft", {
                        spent: usd(status.account.usage),
                        left: usd(status.account.remaining),
                      })
                    : t("spent", { spent: usd(status.account.usage) })
                  : t("errors.unreadable")}
              </span>
            </div>

            <Switch
              isSelected={status.enabled}
              isDisabled={busy === "enabled"}
              onChange={(enabled) => void run("enabled", "PATCH", { enabled })}
              className="gap-2 text-sm"
            >
              {t("pay")}
            </Switch>
            <p className="-mt-3 text-xs text-muted-foreground">
              {status.enabled ? t("payOn") : t("payOff")}
            </p>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="openrouter-image-model"
                className="text-sm text-muted-foreground"
              >
                {t("imageModel")}
              </label>
              <NativeSelect
                id="openrouter-image-model"
                value={status.imageModel}
                disabled={busy === "imageModel"}
                onChange={(e) =>
                  void run("imageModel", "PATCH", {
                    imageModel: e.target.value,
                  })
                }
              >
                {(status.models.some((m) => m.id === status.imageModel)
                  ? status.models
                  : [
                      { id: status.imageModel, name: status.imageModel },
                      ...status.models,
                    ]
                ).map((m) => (
                  <NativeSelectOption key={m.id} value={m.id}>
                    {m.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>

            <form
              className="flex flex-col gap-1.5"
              onSubmit={(e) => {
                e.preventDefault()
                const value = new FormData(e.currentTarget).get("textModel")
                void run("textModel", "PATCH", { textModel: value })
              }}
            >
              <label
                htmlFor="openrouter-text-model"
                className="text-sm text-muted-foreground"
              >
                {t("textModel")}
              </label>
              <div className="flex gap-2">
                <Input
                  id="openrouter-text-model"
                  name="textModel"
                  key={status.textModel}
                  defaultValue={status.textModel}
                />
                <Button
                  type="submit"
                  variant="outline"
                  isDisabled={busy === "textModel"}
                >
                  {busy === "textModel" && <Spinner />}
                  {t("save")}
                </Button>
              </div>
            </form>

            <Button
              variant="ghost"
              className="self-start text-destructive"
              isDisabled={busy === "disconnect"}
              onPress={() => {
                if (window.confirm(t("confirmDisconnect")))
                  void run("disconnect", "DELETE")
              }}
            >
              {t("disconnect")}
            </Button>
          </>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </section>
  )
}
