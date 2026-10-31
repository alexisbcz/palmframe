import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { SearchIcon } from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import { ButtonGroup } from "@workspace/ui/components/button-group"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"

import { Failure, PageTitle, PlanButton, Thumb } from "@/components/studio/ui"
import { useLocale, useT } from "@/i18n/core"
import { COSTS } from "@/lib/credits"
import { PRIVATE } from "@/lib/seo"
import { useStudioCall } from "@/lib/studio/client"
import type { Product } from "@/lib/studio/model"

import type { Route } from "./+types/studio.product"
import { messages } from "./studio.messages"

export const meta: Route.MetaFunction = () => [PRIVATE]

export default function StudioProduct() {
  const t = useT(messages)
  const { locale } = useLocale()
  const { busy, error, call } = useStudioCall()
  const [url, setUrl] = React.useState("")
  const [product, setProduct] = React.useState<Product | null>(null)

  return (
    <>
      <PageTitle title={t("product.title")} intro={t("product.intro")} />
      <form
        className="flex max-w-2xl flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          setProduct(null)
          const r = await call<{ product: Product }>("product", {
            intent: "product",
            url: url.trim(),
          })
          if (r) setProduct(r.product)
        }}
      >
        <ButtonGroup className="w-full">
<Input
          type="url"
          value={url}
          required
          aria-label={t("product.url")}
          placeholder={t("product.url")}
          onChange={(e) => setUrl(e.target.value)}
          className="min-w-0 flex-1"
        />
        <Button
          type="submit"
          isDisabled={busy !== null}
          className="bg-white text-black hover:bg-white/90"
        >
          {t("product.read", { cost: COSTS.studio_lookup })}
          {busy ? (<Spinner />) : (<HugeiconsIcon icon={SearchIcon} strokeWidth={2} data-icon="inline-end" />)}
        </Button>
</ButtonGroup>
</form>
      <Failure code={error} />
      {product && (
        <article className="flex flex-wrap gap-6 rounded-2xl border p-5">
          <Thumb src={product.image} className="aspect-square w-48 bg-white" />
          <div className="flex min-w-64 flex-1 flex-col gap-3">
            <div>
              <h2 className="studio-title text-2xl">{product.name}</h2>
              <p className="text-sm text-muted-foreground">{product.brand}</p>
            </div>
            {product.price !== null && product.currency && (
              <p className="studio-title text-2xl text-brand-ink">
                {new Intl.NumberFormat(locale, {
                  style: "currency",
                  currency: product.currency,
                }).format(product.price)}
              </p>
            )}
            <p className="line-clamp-4 text-sm text-muted-foreground">
              {product.description}
            </p>
            {product.features.length > 0 && (
              <ul className="list-inside list-disc text-sm">
                {product.features.slice(0, 5).map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            )}
            <div>
              <PlanButton source={{ kind: "product", product }} white />
            </div>
          </div>
        </article>
      )}
    </>
  )
}
