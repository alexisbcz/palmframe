import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Copy01Icon, Link01Icon, Tick02Icon } from "@hugeicons/core-free-icons"

import { Button, LinkButton } from "@workspace/ui/components/button"
import { ButtonGroup } from "@workspace/ui/components/button-group"
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Spinner } from "@workspace/ui/components/spinner"

import { useT } from "@/i18n/core"

import { messages } from "./share.messages"

export function ShareButton({ projectId }: { projectId: string }) {
  const t = useT(messages)
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button
        variant="outline"
        className="max-sm:px-2"
        onPress={() => setOpen(true)}
      >
        <HugeiconsIcon
          icon={Link01Icon}
          strokeWidth={2}
          data-icon="inline-start"
        />
        <span className="max-sm:sr-only">{t("button")}</span>
      </Button>
      {open && (
        <ShareDialog projectId={projectId} onClose={() => setOpen(false)} />
      )}
    </>
  )
}

async function request(projectId: string, method: string) {
  const res = await fetch(`/api/share/${projectId}`, { method })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error ?? res.statusText)
  return body.token as string | null
}

function ShareDialog({
  projectId,
  onClose,
}: {
  projectId: string
  onClose: () => void
}) {
  const t = useT(messages)
  // undefined until the current link is known.
  const [token, setToken] = React.useState<string | null | undefined>()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)
  const [confirming, setConfirming] = React.useState(false)

  const change = React.useCallback(
    async (method: string) => {
      setBusy(true)
      setError(null)
      try {
        setToken(await request(projectId, method))
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setBusy(false)
        setConfirming(false)
      }
    },
    [projectId]
  )

  React.useEffect(() => {
    void change("GET")
  }, [change])

  const url = token ? `${location.origin}/read/${token}` : ""
  const copy = async () => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Dialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      className="sm:max-w-md"
    >
      <DialogHeader>
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>

      {token === undefined && !error && <Skeleton className="h-8 w-full" />}

      {token === null && (
        <Button isDisabled={busy} onPress={() => change("POST")}>
          {busy && <Spinner data-icon="inline-start" />}
          {t("create")}
        </Button>
      )}

      {token && (
        <div className="flex flex-col gap-3">
          <ButtonGroup className="w-full">
            <Input
              readOnly
              aria-label={t("link")}
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 font-mono text-xs"
            />
            <Button className="data-pressed:scale-100!" onPress={copy}>
              <HugeiconsIcon
                icon={copied ? Tick02Icon : Copy01Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              {copied ? t("copied") : t("copy")}
            </Button>
          </ButtonGroup>
          <p className="text-xs text-muted-foreground">{t("hint")}</p>
          <div className="flex items-center justify-between gap-2">
            <LinkButton
              variant="ghost"
              href={url}
              target="_blank"
              rel="noreferrer"
            >
              {t("open")}
            </LinkButton>
            <Button
              variant={confirming ? "destructive" : "outline"}
              isDisabled={busy}
              onPress={() =>
                confirming ? change("DELETE") : setConfirming(true)
              }
            >
              {busy && <Spinner data-icon="inline-start" />}
              {confirming ? t("confirmRevoke") : t("revoke")}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t("failed", { error })}
        </p>
      )}
    </Dialog>
  )
}
