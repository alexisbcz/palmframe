import { data, isRouteErrorResponse, useRouteError } from "react-router"

import { Reader, ReaderMissing } from "@/components/reader/reader"
import { readShared } from "@/lib/share.server"

import type { Route } from "./+types/read"

// The public side of a reader link. Never cached, so a revoked link is gone at
// once; the token stays out of Referer headers; search engines stay out.
const HEADERS = {
  "cache-control": "private, no-store",
  "referrer-policy": "no-referrer",
  "x-robots-tag": "noindex, nofollow",
}

export const meta: Route.MetaFunction = ({ loaderData }) => [
  {
    title: loaderData?.title ? `${loaderData.title} · Palmframe` : "Palmframe",
  },
  { name: "robots", content: "noindex, nofollow" },
  { name: "referrer", content: "no-referrer" },
]

export async function loader({ request, params }: Route.LoaderArgs) {
  const shared = await readShared(params.token)
  if (!shared) throw data("Not found", { status: 404, headers: HEADERS })
  return data({ ...shared, url: request.url }, { headers: HEADERS })
}

export const headers: Route.HeadersFunction = ({
  loaderHeaders,
  errorHeaders,
}) => errorHeaders ?? loaderHeaders

export default function Read({ loaderData }: Route.ComponentProps) {
  return <Reader {...loaderData} />
}

export function ErrorBoundary() {
  const error = useRouteError()
  return (
    <ReaderMissing
      missing={isRouteErrorResponse(error) && error.status === 404}
    />
  )
}
