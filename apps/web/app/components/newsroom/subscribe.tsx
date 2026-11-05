import * as React from "react"

import { useT } from "@/i18n/core"

import { messages } from "./newsroom.messages"

export function Subscribe({ slug, name }: { slug: string; name: string }) {
  const t = useT(messages)
  const [email, setEmail] = React.useState("")
  const [trap, setTrap] = React.useState("")
  const [state, setState] = React.useState<
    "idle" | "busy" | "done" | "invalid" | "failed"
  >("idle")
  const id = React.useId()
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setState("invalid")
      return
    }
    setState("busy")
    try {
      const res = await fetch(`/api/newsroom/public/${slug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "subscribe",
          email: email.trim(),
          website: trap,
        }),
      })
      setState(res.ok ? "done" : res.status === 400 ? "invalid" : "failed")
    } catch {
      setState("failed")
    }
  }
  return (
    <section className="np-subscribe" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>{t("public.subscribeTitle")}</h3>
      <p>{t("public.subscribeText", { name })}</p>
      {state === "done" ? (
        <p className="np-note" role="status">
          {t("public.subscribed")}
        </p>
      ) : (
        <form onSubmit={submit} noValidate>
          <label htmlFor={`${id}-email`} className="sr-only">
            {t("public.email")}
          </label>
          <input
            id={`${id}-email`}
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder={t("public.email")}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              if (state !== "busy") setState("idle")
            }}
            aria-invalid={state === "invalid" || undefined}
            required
          />
          <input
            className="np-trap"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden
            value={trap}
            onChange={(e) => setTrap(e.target.value)}
            name="website"
          />
          <button
            type="submit"
            className="np-button"
            disabled={state === "busy"}
          >
            {t("public.subscribe")}
          </button>
        </form>
      )}
      {(state === "invalid" || state === "failed") && (
        <p className="np-note" data-error role="alert">
          {t(state === "invalid" ? "public.invalid" : "public.failed")}
        </p>
      )}
    </section>
  )
}
