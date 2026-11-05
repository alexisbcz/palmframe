import * as React from "react"
import { data, useSearchParams } from "react-router"

import { messages } from "@/components/newsroom/newsroom.messages"
import "@/components/newsroom/newsroom.css"
import "@/components/newsroom/publication.css"
import { useT } from "@/i18n/core"
import { readPublication } from "@/lib/newsroom/public.server"
import { PRIVATE } from "@/lib/seo"
import { getViewer } from "@/lib/supabase.server"

import { Footer, Masthead, accentStyle } from "./n"
import type { Route } from "./+types/n.unsubscribe"

export const meta: Route.MetaFunction = () => [PRIVATE]

export async function loader({ request, params }: Route.LoaderArgs) {
  const { viewer } = await getViewer(request)
  const found = await readPublication(params.slug, viewer?.id)
  if (!found) throw data("Not found", { status: 404 })
  return { publication: found.publication }
}

// A page with a button, not a link that acts: mail scanners open links, and
// that mustn't unsubscribe anyone.
export default function Unsubscribe({ loaderData }: Route.ComponentProps) {
  const t = useT(messages)
  const { publication: p } = loaderData
  const [params] = useSearchParams()
  const token = params.get("t") ?? ""
  const [state, setState] = React.useState<"idle" | "busy" | "done" | "failed">(
    "idle"
  )
  const go = async () => {
    setState("busy")
    const res = await fetch(`/api/newsroom/public/${p.slug}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "unsubscribe", token }),
    }).catch(() => null)
    setState(res?.ok ? "done" : "failed")
  }
  return (
    <div className="nr np" data-theme={p.theme} style={accentStyle(p.accent)}>
      <div className="np-wrap">
        <Masthead slug={p.slug} name={p.name} tagline={p.tagline} />
        <div className="np-article" style={{ maxWidth: 520 }}>
          <h1 style={{ fontSize: 32 }}>
            {t("public.unsubTitle", { name: p.name })}
          </h1>
          {state === "done" ? (
            <p className="np-dek" role="status">
              {t("public.unsubDone")}
            </p>
          ) : (
            <>
              <p className="np-dek">{t("public.unsubText")}</p>
              <p style={{ marginTop: 24 }}>
                <button
                  type="button"
                  className="np-button"
                  disabled={state === "busy" || !token}
                  onClick={() => void go()}
                >
                  {t("public.unsubButton")}
                </button>
              </p>
              {(state === "failed" || !token) && (
                <p
                  className="np-note"
                  data-error
                  role="alert"
                  style={{ marginTop: 12 }}
                >
                  {t("public.unsubFailed")}
                </p>
              )}
            </>
          )}
        </div>
        <Footer />
      </div>
    </div>
  )
}
