import { redirect } from "react-router"

import { safeNext } from "@/lib/next"

import type { Route } from "./+types/api.instagram.callback"

// Instagram's login comes back here with `connected=instagram` or `error=…`.
// In a popup, it tells the dialog that opened it and closes; otherwise it
// goes back to `next` with `?instagram=connected|error`.
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url)
  const p = url.searchParams
  const ok = p.get("connected") === "instagram" && !p.get("error")
  const message = {
    type: "palmframe:instagram",
    ok,
    username: ok ? (p.get("username") ?? "") : "",
    error: ok ? "" : (p.get("error") ?? "connection_failed"),
  }
  if (p.get("popup") !== "1") {
    const next = new URL(safeNext(p.get("next"), "/"), url.origin)
    next.searchParams.set("instagram", ok ? "connected" : "error")
    return redirect(next.pathname + next.search)
  }
  // JSON in a script tag: escape "<" so a crafted value can't close it.
  const json = JSON.stringify(message).replace(/</g, "\\u003c")
  const origin = JSON.stringify(url.origin)
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Instagram</title>
<script>
  try { window.opener && window.opener.postMessage(${json}, ${origin}) } catch {}
  window.close()
</script>
<p style="font:14px system-ui;padding:24px">You can close this window.</p>`,
    { headers: { "content-type": "text/html; charset=utf-8" } }
  )
}
