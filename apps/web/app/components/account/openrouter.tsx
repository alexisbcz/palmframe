import * as React from "react"
import { useRevalidator } from "react-router"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import { ButtonGroup } from "@workspace/ui/components/button-group"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"
import { Switch } from "@workspace/ui/components/switch"

import { useLocale, useT } from "@/i18n/core"
import type { OpenRouterStatus } from "@/routes/api.openrouter"

import { ModelPicker } from "./model-picker"
import { messages } from "./openrouter.messages"

// Settings section for paying with your own OpenRouter account instead of
// credits. Connecting goes through OpenRouter's sign-in; a key can also be
// pasted. The server keeps the key encrypted and never sends it back.
// `result` is how that sign-in ended, from the return address.
export function OpenRouter({ result }: { result?: string | null }) {
  const t = useT(messages)
  const { locale } = useLocale()
  const revalidator = useRevalidator()
  const [status, setStatus] = React.useState<OpenRouterStatus | null>(null)
  const [key, setKey] = React.useState("")
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [disconnecting, setDisconnecting] = React.useState(false)

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
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
    }).format(n)

  return (
    <div className="flex flex-col gap-5">
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
            <ButtonGroup className="w-full">
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
                className="data-pressed:scale-100!"
                variant="outline"
                isDisabled={!key.trim() || busy === "key"}
              >
                {busy === "key" && <Spinner />}
                {t("save")}
              </Button>
            </ButtonGroup>
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

          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{t("pay")}</span>
              <span className="text-xs text-muted-foreground">
                {status.enabled ? t("payOn") : t("payOff")}
              </span>
            </span>
            <Switch
              aria-label={t("pay")}
              isSelected={status.enabled}
              isDisabled={busy === "enabled"}
              onChange={(enabled) => void run("enabled", "PATCH", { enabled })}
              className="mt-0.5"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="openrouter-image-model"
              className="text-sm text-muted-foreground"
            >
              {t("imageModel")}
            </label>
            <ModelPicker
              id="openrouter-image-model"
              value={status.imageModel}
              models={status.models}
              isDisabled={busy === "imageModel"}
              onChange={(imageModel) =>
                void run("imageModel", "PATCH", { imageModel })
              }
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="openrouter-text-model"
              className="text-sm text-muted-foreground"
            >
              {t("textModel")}
            </label>
            <ModelPicker
              id="openrouter-text-model"
              value={status.textModel}
              models={status.textModels}
              isDisabled={busy === "textModel"}
              custom
              onChange={(textModel) =>
                void run("textModel", "PATCH", { textModel })
              }
            />
          </div>

          <Button
            variant="ghost"
            className="self-start text-destructive"
            isDisabled={busy === "disconnect"}
            onPress={() => setDisconnecting(true)}
          >
            {t("disconnect")}
          </Button>
          <AlertDialog isOpen={disconnecting} onOpenChange={setDisconnecting}>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("disconnectTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("disconnectBody")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
              <Button
                variant="destructive"
                onPress={() => {
                  setDisconnecting(false)
                  void run("disconnect", "DELETE")
                }}
              >
                {t("disconnect")}
              </Button>
            </AlertDialogFooter>
          </AlertDialog>
        </>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
