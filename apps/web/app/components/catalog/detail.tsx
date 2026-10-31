import * as React from "react"
import { Link, useLocation, useNavigate } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Copy01Icon,
  Delete02Icon,
  Flag02Icon,
  Layers01Icon,
  MagicWand01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"

import { Badge } from "@workspace/ui/components/badge"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Spinner } from "@workspace/ui/components/spinner"
import { Tooltip, TooltipTrigger } from "@workspace/ui/components/tooltip"
import { cn } from "cn"

import { useViewer } from "@/components/account/account-menu"
import { ModelLabel } from "@/components/model-label"
import { useT } from "@/i18n/core"
import { COSTS } from "@/lib/credits"

import { SfxArt } from "./card"
import { messages } from "./catalog.messages"
import { catalogRequest } from "./client"
import { Gallery } from "./gallery"
import { RATIO, hasReference, type Asset } from "./model"
import { SaveButton } from "./save-button"
import { UseMenu } from "./use-menu"

const REASONS = ["sexual", "minor", "hate", "copyright", "else"] as const

// The words behind the asset, to copy into any prompt.
function promptOf(a: Asset) {
  const p = a.payload
  if (p.type === "look")
    return [p.recipe?.prose, p.recipe?.tags].filter(Boolean).join("\n")
  if (p.type === "story") return p.brief
  if (p.type === "sfx") return p.text
  if (p.type === "comic") return ""
  if (p.type === "direction")
    return [p.prompt, p.tags.join(", ")].filter(Boolean).join("\n")
  return p.tags.join(", ")
}

function Report({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const t = useT(messages)
  const [sent, setSent] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const send = async (reason: string) => {
    try {
      await catalogRequest({ intent: "report", id: asset.id, reason })
      setSent(true)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <Dialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      className="sm:max-w-sm"
    >
      <DialogHeader>
        <DialogTitle>{t("report.title", { name: asset.name })}</DialogTitle>
        <DialogDescription>
          {sent ? t("report.thanks") : t("report.body")}
        </DialogDescription>
      </DialogHeader>
      {!sent && (
        <div className="flex flex-col gap-1">
          {REASONS.map((r) => (
            <Button
              key={r}
              variant="outline"
              className="justify-start"
              onPress={() => void send(r)}
            >
              {t(`report.${r}`)}
            </Button>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </Dialog>
  )
}

// A copy of the comic as the person's own carousel, opened in the editor.
function CopyComic({ asset }: { asset: Asset }) {
  const t = useT(messages)
  const viewer = useViewer()
  const navigate = useNavigate()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const copy = async () => {
    if (!viewer) return navigate(`/login?next=/catalog/${asset.id}`)
    setBusy(true)
    setError(null)
    try {
      const { id } = await catalogRequest({
        intent: "copy-comic",
        id: asset.id,
      })
      navigate(`/p/${id}`)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-1">
      <Button className="w-full" isDisabled={busy} onPress={() => void copy()}>
        {busy && <Spinner data-icon="inline-start" />}
        {t("comic.copy")}
      </Button>
      <p className="text-xs text-muted-foreground">{t("comic.copyHint")}</p>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

function Owner({ asset, onGone }: { asset: Asset; onGone: () => void }) {
  const t = useT(messages)
  const [isPublic, setPublic] = React.useState(!!asset.isPublic)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const run = async (body: Record<string, unknown>, then: () => void) => {
    setBusy(true)
    setError(null)
    try {
      await catalogRequest({ ...body, id: asset.id })
      then()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      {asset.hidden && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {t("detail.hidden")}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          isDisabled={busy || asset.hidden}
          onPress={() =>
            void run({ intent: "publish", isPublic: !isPublic }, () =>
              setPublic(!isPublic)
            )
          }
        >
          {t(isPublic ? "detail.unpublish" : "detail.publish")}
        </Button>
        <TooltipTrigger isDisabled={busy}>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("detail.delete")}
            isDisabled={busy}
            onPress={() => void run({ intent: "delete" }, onGone)}
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
          </Button>
          <Tooltip>{t("detail.delete")}</Tooltip>
        </TooltipTrigger>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

export function AssetDetail({
  asset,
  related,
}: {
  asset: Asset
  related: Asset[]
}) {
  const t = useT(messages)
  const viewer = useViewer()
  const navigate = useNavigate()
  const { search } = useLocation()
  const [copied, setCopied] = React.useState(false)
  const [reporting, setReporting] = React.useState(false)
  const close = () =>
    navigate(`/catalog${search}`, { preventScrollReset: true })
  const prompt = promptOf(asset)
  const tags = "tags" in asset.payload ? asset.payload.tags : []
  const sheet =
    asset.payload.type === "character" ? asset.payload.sheet : undefined
  const sheetModel =
    asset.payload.type === "character" ? asset.payload.sheetModel : undefined

  const copy = async () => {
    await navigator.clipboard.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Dialog
      isOpen
      onOpenChange={(open) => !open && close()}
      className="gap-0 overflow-hidden p-0 sm:max-w-5xl"
    >
      <div className="grid max-h-[calc(100svh-2rem)] overflow-y-auto md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-px bg-muted">
          {asset.payload.type === "comic" ? (
            <Gallery
              key={asset.id}
              label={asset.name}
              images={asset.payload.pages.map((src, i) => ({
                src,
                alt: t("comic.slide", { n: i + 1 }),
              }))}
              style={{ aspectRatio: RATIO.comic }}
            />
          ) : asset.payload.type === "sfx" ? (
            <div
              className="relative max-h-[60svh] w-full md:max-h-none"
              style={{ aspectRatio: RATIO[asset.kind] }}
            >
              <SfxArt payload={asset.payload} />
            </div>
          ) : (
            asset.image && (
              <Gallery
                key={asset.id}
                label={asset.name}
                images={[
                  { src: asset.image, alt: asset.name },
                  ...(sheet
                    ? [
                        {
                          src: sheet,
                          alt: t("detail.sheetOf", { name: asset.name }),
                          contain: true,
                        },
                      ]
                    : []),
                ]}
                className="max-h-[60svh] md:max-h-none"
                style={{ aspectRatio: RATIO[asset.kind] }}
              />
            )
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4 p-5">
          <DialogHeader className="pe-8">
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <Badge variant="secondary">{t(`kinds.${asset.kind}`)}</Badge>
              {asset.official ? (
                <span>{t("detail.official")}</span>
              ) : (
                <span>
                  {t("detail.by", {
                    name: asset.author ?? t("detail.anonymous"),
                  })}
                </span>
              )}
            </div>
            <DialogTitle className="text-xl font-semibold">
              {asset.name}
            </DialogTitle>
            <DialogDescription className="text-pretty">
              {asset.description}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              {asset.kind === "comic" ? (
                <CopyComic asset={asset} />
              ) : (
                <UseMenu ids={[asset.id]} label={t("detail.use")} />
              )}
            </div>
            <SaveButton
              asset={asset}
              className="size-9 bg-muted text-foreground hover:bg-muted/70"
            />
          </div>

          {(asset.model || sheetModel) && (
            <dl className="flex flex-col gap-0.5 text-xs text-muted-foreground">
              {asset.model && (
                <div className="flex justify-between gap-3">
                  <dt>{t("detail.model")}</dt>
                  <dd className="flex min-w-0 text-foreground">
                    <ModelLabel model={asset.model} />
                  </dd>
                </div>
              )}
              {sheetModel && (
                <div className="flex justify-between gap-3">
                  <dt>{t("detail.sheetModel")}</dt>
                  <dd className="flex min-w-0 text-foreground">
                    <ModelLabel model={sheetModel} />
                  </dd>
                </div>
              )}
            </dl>
          )}

          {hasReference(asset) && (
            <p className="flex items-start gap-2 rounded-lg bg-muted p-2.5 text-xs text-muted-foreground">
              <HugeiconsIcon
                icon={Layers01Icon}
                strokeWidth={2}
                className="mt-px size-3.5 shrink-0"
              />
              {t("detail.reference", {
                plain: COSTS.panel,
                credits: COSTS.panel_ref,
              })}
            </p>
          )}

          {prompt && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-muted-foreground">
                  {t("detail.prompt")}
                </h3>
                <Button variant="ghost" size="sm" onPress={() => void copy()}>
                  <HugeiconsIcon
                    icon={copied ? Tick02Icon : Copy01Icon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  {t(copied ? "detail.copied" : "detail.copy")}
                </Button>
              </div>
              {tags.length ? (
                <ul className="flex flex-wrap gap-1">
                  {tags.map((tag) => (
                    <li
                      key={tag}
                      className="rounded-md bg-muted px-1.5 py-0.5 text-xs"
                    >
                      {tag}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-lg bg-muted p-2.5 text-xs whitespace-pre-line">
                  {prompt}
                </p>
              )}
            </div>
          )}

          {asset.genres.length > 0 && (
            <ul className="flex flex-wrap gap-1">
              {asset.genres.map((g) => (
                <li key={g}>
                  <Link
                    to={`/catalog?genre=${g}`}
                    className="block rounded-full border px-2.5 py-0.5 text-xs transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    {t(`genres.${g}`)}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {related.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <h3 className="text-xs font-medium text-muted-foreground">
                {t("detail.related")}
              </h3>
              <ul className="grid grid-cols-6 gap-1.5">
                {related.map((r) => (
                  <li key={r.id}>
                    <Link
                      to={`/catalog/${r.id}${search}`}
                      preventScrollReset
                      aria-label={r.name}
                      title={r.name}
                      className="block aspect-square overflow-hidden rounded-md bg-muted ring-1 ring-foreground/10 transition-shadow outline-none hover:ring-foreground/40 focus-visible:ring-3 focus-visible:ring-ring/60"
                    >
                      <img
                        src={r.image ?? ""}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <DialogFooter className="mt-auto flex-row flex-wrap justify-between border-t pt-3 sm:justify-between">
            {asset.kind !== "comic" ? (
              <Link
                to={`/catalog/create?remix=${asset.id}`}
                className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
              >
                <HugeiconsIcon
                  icon={MagicWand01Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {t("detail.remix")}
              </Link>
            ) : (
              <span />
            )}
            {!asset.official && !asset.mine && viewer && (
              <Button
                variant="ghost"
                size="sm"
                onPress={() => setReporting(true)}
              >
                <HugeiconsIcon
                  icon={Flag02Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {t("report.open")}
              </Button>
            )}
          </DialogFooter>

          {asset.mine && <Owner asset={asset} onGone={close} />}
        </div>
      </div>
      {reporting && (
        <Report asset={asset} onClose={() => setReporting(false)} />
      )}
    </Dialog>
  )
}
