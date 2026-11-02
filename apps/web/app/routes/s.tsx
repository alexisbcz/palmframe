import * as React from "react"
import { data, useLocation } from "react-router"

import { SiteView } from "@/components/sites/site"
import { fontsHref, safeImage } from "@/lib/sites/model"
import { anon, readRelease } from "@/lib/sites/public.server"
import { seo } from "@/lib/seo"

import type { Route } from "./+types/s"

export const meta: Route.MetaFunction = ({ loaderData }) => {
  if (!loaderData) return [{ title: "Not found" }]
  const { site, slug, page, post, product } = loaderData
  const pageTitle =
    post?.title ??
    product?.name ??
    (page?.seo.title ||
      (page?.slug ? `${page.name} · ${site.name}` : site.name))
  const image =
    safeImage(post?.cover) ||
    safeImage(product?.images[0]) ||
    safeImage(page?.seo.image) ||
    safeImage(site.settings.shareImage)
  const path = loaderData.path
  const favicon = safeImage(site.settings.favicon)
  return [
    ...seo({
      title: pageTitle,
      description:
        post?.excerpt ||
        product?.description.slice(0, 160) ||
        page?.seo.description ||
        site.settings.description ||
        site.name,
      path,
      noindex: !loaderData.indexable,
      type: post ? "article" : "website",
      ...(image && { image }),
    }),
    {
      tagName: "link",
      rel: "stylesheet",
      href: fontsHref([site.theme.heading, site.theme.body]),
    },
    ...(favicon ? [{ tagName: "link", rel: "icon", href: favicon }] : []),
    ...(site.posts.length
      ? [
          {
            tagName: "link",
            rel: "alternate",
            type: "application/rss+xml",
            title: site.name,
            href: `/s/${slug}/rss.xml`,
          },
        ]
      : []),
  ]
}

export async function loader({ params }: Route.LoaderArgs) {
  const release = await readRelease(params.slug)
  if (!release) throw data("Not found", { status: 404 })
  const site = release.data
  const splat = (params["*"] ?? "").replace(/\/$/, "")
  const [first, second] = splat.split("/")
  const post =
    first === "blog" && second
      ? (site.posts.find((p) => p.slug === second && !p.draft) ?? null)
      : null
  const product =
    first === "shop" && second
      ? (site.products.find((p) => p.slug === second) ?? null)
      : null
  const page = post || product ? null : site.pages.find((p) => p.slug === splat)
  if (!post && !product && !page) throw data("Not found", { status: 404 })
  const usesBooking = site.services.length > 0
  const taken = usesBooking
    ? ((await anon().rpc("comic_site_taken", { p_slug: params.slug })).data ??
      [])
    : []
  return {
    site,
    slug: release.slug,
    indexable: release.indexable,
    page: page ?? null,
    post,
    product,
    taken,
    path: `/s/${release.slug}${splat ? `/${splat}` : ""}`,
  }
}

export default function PublicSite({ loaderData }: Route.ComponentProps) {
  const { site, slug, page, post, product, taken, path } = loaderData
  const location = useLocation()
  React.useEffect(() => {
    void fetch(`/api/sites/public/${slug}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "view", path: location.pathname }),
    }).catch(() => {})
  }, [slug, location.pathname])
  return (
    <SiteView
      site={site}
      page={page}
      post={post}
      product={product}
      base={`/s/${slug}`}
      slug={slug}
      taken={taken}
      path={path}
      live
      badge
    />
  )
}
