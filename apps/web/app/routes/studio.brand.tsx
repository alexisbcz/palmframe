import * as React from "react"
import { useRevalidator } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { Delete02Icon, SparklesIcon } from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"
import { Textarea } from "@workspace/ui/components/textarea"

import { Failure, PageTitle, Slant } from "@/components/studio/ui"
import { useT } from "@/i18n/core"
import { COSTS } from "@/lib/credits"
import type { BrandKitRow } from "@/lib/database"
import { PRIVATE } from "@/lib/seo"
import { useStudioCall } from "@/lib/studio/client"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/studio.brand"
import { messages } from "./studio.messages"

export const meta: Route.MetaFunction = () => [PRIVATE]

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = await getViewer(request)
  const { data } = await supabase
    .from("comic_brand_kits")
    .select("*")
    .order("created_at")
  return { kits: (data ?? []) as BrandKitRow[] }
}

function Kit({ kit }: { kit: BrandKitRow }) {
  const t = useT(messages)
  const revalidator = useRevalidator()
  const { busy, error, call } = useStudioCall()
  const [voice, setVoice] = React.useState(kit.voice)
  const [saved, setSaved] = React.useState(false)

  const act = async (intent: string, extra = {}) => {
    const ok = await call(intent, { intent, id: kit.id, ...extra })
    if (ok) revalidator.revalidate()
    return ok
  }

  return (
    <article className="flex flex-col gap-4 rounded-2xl border p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            {kit.name}
            {kit.active && (
              <Slant className="bg-brand text-brand-foreground">
                {t("brand.inUse")}
              </Slant>
            )}
          </h2>
          <p className="text-sm text-muted-foreground">{kit.domain}</p>
          {kit.slogan && <p className="mt-1 text-sm">{kit.slogan}</p>}
        </div>
        <div className="flex items-center gap-1">
          {!kit.active && (
            <Button
              variant="outline"
              size="sm"
              isDisabled={busy !== null}
              onPress={() => act("brandUse")}
            >
              {t("brand.use")}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("brand.remove", { name: kit.name })}
            isDisabled={busy !== null}
            onPress={() => act("brandRemove")}
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
          </Button>
        </div>
      </header>

      {kit.colors.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={t("brand.colors")}>
          {kit.colors.map((c) => (
            <li key={c.hex} className="flex flex-col gap-1">
              <span
                className="block h-12 w-20 rounded-lg ring-1 ring-foreground/15"
                style={{ background: c.hex }}
              />
              <span className="text-xs text-muted-foreground uppercase tabular-nums">
                {c.hex}
              </span>
            </li>
          ))}
        </ul>
      )}

      {kit.logos.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={t("brand.logos")}>
          {kit.logos.map((l) => (
            <li
              key={l.url}
              className="flex size-20 items-center justify-center rounded-lg bg-white p-2 data-[dark=true]:bg-zinc-800"
              data-dark={l.mode === "dark"}
            >
              <img
                src={l.url}
                alt={t("brand.logoAlt", { name: kit.name })}
                referrerPolicy="no-referrer"
                className="max-h-full max-w-full object-contain"
              />
            </li>
          ))}
        </ul>
      )}

      {kit.fonts.length > 0 && (
        <p className="text-sm">
          <span className="text-muted-foreground">{t("brand.fonts")}: </span>
          {kit.fonts.map((f) => f.family).join(", ")}
        </p>
      )}

      <form
        className="flex flex-col gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          setSaved(false)
          if (await act("brandVoice", { voice })) setSaved(true)
        }}
      >
        <label htmlFor={`voice-${kit.id}`} className="text-sm font-medium">
          {t("brand.voice")}
        </label>
        <Textarea
          id={`voice-${kit.id}`}
          value={voice}
          rows={3}
          maxLength={1000}
          placeholder={t("brand.voiceHint")}
          onChange={(e) => setVoice(e.target.value)}
        />
        <div className="flex items-center gap-3">
          <Button
            type="submit"
            variant="outline"
            size="sm"
            isDisabled={busy !== null}
          >
            {t("brand.save")}
          </Button>
          {saved && (
            <p role="status" className="text-sm text-muted-foreground">
              {t("brand.saved")}
            </p>
          )}
        </div>
      </form>
      <Failure code={error} />
    </article>
  )
}

export default function StudioBrand({ loaderData }: Route.ComponentProps) {
  const t = useT(messages)
  const revalidator = useRevalidator()
  const { busy, error, call } = useStudioCall()
  const [domain, setDomain] = React.useState("")

  return (
    <>
      <PageTitle title={t("brand.title")} intro={t("brand.intro")} />
      <form
        className="flex max-w-xl flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          if (await call("brand", { intent: "brand", domain })) {
            setDomain("")
            revalidator.revalidate()
          }
        }}
      >
        <Input
          value={domain}
          required
          inputMode="url"
          autoComplete="url"
          aria-label={t("brand.domain")}
          placeholder={t("brand.domainHint")}
          onChange={(e) => setDomain(e.target.value)}
          className="min-w-48 flex-1"
        />
        <Button
          type="submit"
          isDisabled={busy !== null}
          className="bg-white text-black hover:bg-white/90"
        >
          {busy ? (
            <Spinner />
          ) : (
            <HugeiconsIcon icon={SparklesIcon} strokeWidth={2} />
          )}
          {t("brand.read", { cost: COSTS.brand_kit })}
        </Button>
      </form>
      <Failure code={error} />
      {loaderData.kits.length ? (
        <div className="flex flex-col gap-4">
          {loaderData.kits.map((k) => (
            <Kit key={k.id} kit={k} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("brand.empty")}</p>
      )}
    </>
  )
}
