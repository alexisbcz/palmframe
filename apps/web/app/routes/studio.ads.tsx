import * as React from "react"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowRight01Icon,
  Calendar03Icon,
  Copy01Icon,
  Image02Icon,
  SearchIcon,
  SparklesIcon,
} from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import { ButtonGroup } from "@workspace/ui/components/button-group"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"

import {
  Failure,
  PageTitle,
  PlanButton,
  Slant,
  Thumb,
  useCompact,
} from "@/components/studio/ui"
import { useT } from "@/i18n/core"
import { COSTS } from "@/lib/credits"
import { PRIVATE } from "@/lib/seo"
import { useStudioCall } from "@/lib/studio/client"
import type { Ad, Advertiser } from "@/lib/studio/model"

import type { Route } from "./+types/studio.ads"
import { messages } from "./studio.messages"

export const meta: Route.MetaFunction = () => [PRIVATE]

// Three months of paid delivery is a strong sign something works.
const PROVEN_DAYS = 90

function AdRow({
  ad,
  open,
  onOpen,
}: {
  ad: Ad
  open: boolean
  onOpen: () => void
}) {
  const t = useT(messages)
  return (
    <>
      <tr className="border-t hover:bg-foreground/5">
        <td className="px-3 py-3">
          <button
            type="button"
            aria-expanded={open}
            onClick={onOpen}
            className="flex w-full min-w-0 items-center gap-3 rounded-md text-start outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              strokeWidth={2}
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform rtl:rotate-180",
                open && "rotate-90 rtl:rotate-90"
              )}
            />
            <Thumb src={ad.image} className="size-11" />
            <span className="min-w-0">
              <span className="line-clamp-1 font-medium">
                {ad.title || ad.body || ad.page}
              </span>
              <span className="line-clamp-1 text-xs text-brand-ink">
                {ad.format || t("ads.ad")}
              </span>
            </span>
          </button>
        </td>
        <td className="px-3 py-3 whitespace-nowrap tabular-nums">
          {ad.days >= PROVEN_DAYS ? (
            <span className="inline-flex items-center gap-2">
              <Slant>{t("ads.proven")}</Slant>
              <span className="text-brand-ink">
                {t("ads.daysValue", { n: ad.days })}
              </span>
            </span>
          ) : (
            t("ads.daysValue", { n: ad.days })
          )}
        </td>
        <td className="px-3 py-3 tabular-nums">{ad.variants}</td>
        <td className="px-3 py-3 whitespace-nowrap">{ad.cta || "—"}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={4} className="bg-foreground/5 px-5 py-4">
            <div className="flex flex-wrap gap-5">
              <Thumb src={ad.image} className="aspect-square w-44" />
              <div className="flex min-w-60 flex-1 flex-col gap-3">
                <p className="text-sm whitespace-pre-wrap">{ad.body}</p>
                <p className="text-xs text-muted-foreground">
                  {ad.platforms.join(" · ")}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <PlanButton source={{ kind: "ad", ad }} white />
                  <a
                    href={ad.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm underline underline-offset-2"
                  >
                    {t("ads.library")}
                  </a>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export default function StudioAds() {
  const t = useT(messages)
  const compact = useCompact()
  const { busy, error, call } = useStudioCall()
  const [query, setQuery] = React.useState("")
  const [advertisers, setAdvertisers] = React.useState<Advertiser[] | null>(
    null
  )
  const [current, setCurrent] = React.useState<Advertiser | null>(null)
  const [ads, setAds] = React.useState<Ad[] | null>(null)
  const [open, setOpen] = React.useState<string | null>(null)
  const [filter, setFilter] = React.useState("")

  const pick = async (a: Advertiser) => {
    setCurrent(a)
    setAds(null)
    const r = await call<{ ads: Ad[] }>("ads", {
      intent: "ads",
      pageId: a.pageId,
    })
    if (r) setAds(r.ads)
  }
  const shown = ads?.filter((a) =>
    `${a.title} ${a.body}`.toLowerCase().includes(filter.trim().toLowerCase())
  )

  return (
    <>
      <PageTitle title={t("ads.title")} intro={t("ads.intro")} />
      <form
        className="flex max-w-xl flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          setCurrent(null)
          setAds(null)
          const r = await call<{ advertisers: Advertiser[] }>("advertisers", {
            intent: "advertisers",
            query,
          })
          if (r) setAdvertisers(r.advertisers)
        }}
      >
        <ButtonGroup className="w-full">
<Input
          value={query}
          required
          minLength={2}
          aria-label={t("ads.search")}
          placeholder={t("ads.search")}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-0 flex-1"
        />
        <Button
          type="submit"
          isDisabled={busy !== null}
          className="bg-white text-black hover:bg-white/90"
        >
          {t("ads.find", { cost: COSTS.studio_lookup })}
          {busy === "advertisers" ? (<Spinner />) : (<HugeiconsIcon icon={SearchIcon} strokeWidth={2} data-icon="inline-end" />)}
        </Button>
</ButtonGroup>
</form>
      <Failure code={error} />

      {advertisers &&
        !current &&
        (advertisers.length ? (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {advertisers.map((a) => (
              <li key={a.pageId}>
                <button
                  type="button"
                  onClick={() => pick(a)}
                  className="flex w-full items-center gap-3 rounded-xl border p-3 text-start outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <Thumb src={a.image} className="size-10 rounded-full" />
                  <span className="min-w-0">
                    <span className="line-clamp-1 text-sm font-medium">
                      {a.name}
                    </span>
                    <span className="line-clamp-1 text-xs text-muted-foreground">
                      {[a.category, a.likes !== null && compact(a.likes)]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("ads.noneFound")}</p>
        ))}

      {current && (
        <section aria-label={current.name} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="studio-title flex items-center gap-2 text-xl">
              <Thumb src={current.image} className="size-7 rounded-full" />
              {current.name}
              {ads && (
                <span className="font-sans text-sm font-normal tracking-normal normal-case text-muted-foreground">
                  {t("ads.count", { n: ads.length })}
                </span>
              )}
            </h2>
            <Input
              value={filter}
              aria-label={t("ads.filter")}
              placeholder={t("ads.filter")}
              onChange={(e) => setFilter(e.target.value)}
              className="w-56"
            />
          </div>
          {busy === "ads" && <Spinner />}
          {shown && (
            <div className="overflow-x-auto rounded-2xl border">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="px-3 py-3 text-start font-normal">
                      <span className="inline-flex items-center gap-1.5">
                        <HugeiconsIcon
                          icon={Image02Icon}
                          strokeWidth={2}
                          className="size-3.5"
                        />
                        {t("ads.colAd")}
                      </span>
                    </th>
                    <th className="px-3 py-3 text-start font-normal">
                      <span className="inline-flex items-center gap-1.5">
                        <HugeiconsIcon
                          icon={Calendar03Icon}
                          strokeWidth={2}
                          className="size-3.5"
                        />
                        {t("ads.colDays")}
                      </span>
                    </th>
                    <th className="px-3 py-3 text-start font-normal">
                      <span className="inline-flex items-center gap-1.5">
                        <HugeiconsIcon
                          icon={Copy01Icon}
                          strokeWidth={2}
                          className="size-3.5"
                        />
                        {t("ads.colVariants")}
                      </span>
                    </th>
                    <th className="px-3 py-3 text-start font-normal">
                      <span className="inline-flex items-center gap-1.5">
                        <HugeiconsIcon
                          icon={SparklesIcon}
                          strokeWidth={2}
                          className="size-3.5"
                        />
                        {t("ads.colCta")}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((ad) => (
                    <AdRow
                      key={ad.id}
                      ad={ad}
                      open={open === ad.id}
                      onOpen={() => setOpen(open === ad.id ? null : ad.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  )
}
