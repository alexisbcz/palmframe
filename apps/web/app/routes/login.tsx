import * as React from "react"
import { redirect, useNavigate, useSearchParams } from "react-router"
import { Login03Icon, Mail01Icon } from "@hugeicons/core-free-icons"

import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"

import {
  AuthCard,
  AuthShell,
  EMAIL_PATTERN,
  FormError,
  LegalNote,
  MailSent,
  SubmitButton,
  TextButton,
  TextLink,
  authError,
  pageTitle,
  type SentKind,
} from "@/components/auth/auth-ui"
import { messages } from "@/components/auth/auth.messages"
import { useT } from "@/i18n/core"
import { callbackUrl, useSupabase } from "@/lib/supabase.browser"
import { safeNext } from "@/lib/next"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/login"

export const meta: Route.MetaFunction = ({ matches }) =>
  pageTitle(matches, "login.meta")

export async function loader({ request }: Route.LoaderArgs) {
  const { viewer, headers } = await getViewer(request)
  const next = safeNext(new URL(request.url).searchParams.get("next"))
  if (viewer) throw redirect(next, { headers })
  return null
}

export default function Login() {
  const t = useT(messages)
  const supabase = useSupabase()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get("next"))
  const [withPassword, setWithPassword] = React.useState(false)
  const [email, setEmail] = React.useState("")
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(
    params.get("error") === "browser"
      ? t("errors.otherBrowser")
      : params.get("error")
        ? t("errors.expired")
        : null
  )
  const [sent, setSent] = React.useState<{ to: string; kind: SentKind } | null>(
    null
  )

  // A link signs in an existing account or creates one, like the editor.
  const send = async (kind: "link" | "reset", to: string) => {
    const { error } =
      kind === "link"
        ? await supabase.auth.signInWithOtp({
            email: to,
            options: {
              emailRedirectTo: callbackUrl(next),
              shouldCreateUser: true,
            },
          })
        : await supabase.auth.resetPasswordForEmail(to, {
            redirectTo: callbackUrl("/reset-password"),
          })
    return error
  }

  const request = async (kind: "link" | "reset") => {
    const to = email.trim()
    if (!EMAIL_PATTERN.test(to)) {
      document.getElementById("email")?.focus()
      return
    }
    setPending(true)
    setError(null)
    const error = await send(kind, to)
    setPending(false)
    if (error) setError(authError(error, t))
    else setSent({ to, kind })
  }

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!withPassword) return request("link")
    const password = String(new FormData(e.currentTarget).get("password"))
    setPending(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setPending(false)
    if (error) return setError(authError(error, t))
    navigate(next, { replace: true })
  }

  if (sent)
    return (
      <AuthShell>
        <MailSent
          to={sent.to}
          kind={sent.kind}
          onBack={() => setSent(null)}
          onResend={async () => {
            const error = await send(
              sent.kind === "reset" ? "reset" : "link",
              sent.to
            )
            return error ? authError(error, t) : null
          }}
        />
      </AuthShell>
    )

  return (
    <AuthShell>
      <AuthCard
        title={t("login.title")}
        description={
          withPassword ? t("login.passwordHint") : t("login.magicHint")
        }
      >
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email">{t("fields.email")}</FieldLabel>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder={t("fields.emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            {withPassword && (
              <Field>
                <div className="flex items-center">
                  <FieldLabel htmlFor="password">
                    {t("fields.password")}
                  </FieldLabel>
                  <TextButton
                    className="ms-auto me-0"
                    onClick={() => request("reset")}
                  >
                    {t("login.forgot")}
                  </TextButton>
                </div>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  autoFocus
                />
              </Field>
            )}
            <Field>
              <SubmitButton
                pending={pending}
                icon={withPassword ? Login03Icon : Mail01Icon}
              >
                {withPassword ? t("login.submit") : t("login.sendLink")}
              </SubmitButton>
              <FormError>{error}</FormError>
              <TextButton
                onClick={() => {
                  setWithPassword((v) => !v)
                  setError(null)
                }}
              >
                {withPassword ? t("fields.useLink") : t("login.withPassword")}
              </TextButton>
              <p className="text-center text-sm text-muted-foreground">
                {t("login.noAccount")}{" "}
                <TextLink
                  to={
                    next === "/projects"
                      ? "/signup"
                      : `/signup?next=${encodeURIComponent(next)}`
                  }
                >
                  {t("login.createAccount")}
                </TextLink>
              </p>
            </Field>
          </FieldGroup>
        </form>
      </AuthCard>
      <LegalNote template={t("login.legal")} />
    </AuthShell>
  )
}
