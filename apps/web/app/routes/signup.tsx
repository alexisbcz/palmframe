import * as React from "react"
import { redirect, useNavigate, useSearchParams } from "react-router"
import { Mail01Icon, UserAdd01Icon } from "@hugeicons/core-free-icons"

import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"

import {
  AuthCard,
  AuthShell,
  EMAIL_PATTERN,
  FormError,
  LegalNote,
  MIN_PASSWORD,
  MailSent,
  SubmitButton,
  TextButton,
  TextLink,
  authError,
  privateTitle,
  type SentKind,
} from "@/components/auth/auth-ui"
import { messages } from "@/components/auth/auth.messages"
import { useT } from "@/i18n/core"
import { callbackUrl, useSupabase } from "@/lib/supabase.browser"
import { safeNext } from "@/lib/next"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/signup"

export const meta: Route.MetaFunction = ({ matches }) =>
  privateTitle(matches, "signup.meta")

export async function loader({ request }: Route.LoaderArgs) {
  const { viewer, headers } = await getViewer(request)
  const next = safeNext(new URL(request.url).searchParams.get("next"))
  if (viewer) throw redirect(next, { headers })
  return null
}

export default function Signup() {
  const t = useT(messages)
  const supabase = useSupabase()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get("next"))
  const [withPassword, setWithPassword] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [sent, setSent] = React.useState<{
    to: string
    name: string
    password?: string
    kind: SentKind
  } | null>(null)

  const sendLink = async (email: string, name: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        data: { name },
        emailRedirectTo: callbackUrl(next),
      },
    })
    return error
  }

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const name = String(form.get("name") ?? "").trim()
    const email = String(form.get("email") ?? "").trim()
    const password = String(form.get("password") ?? "")
    if (!EMAIL_PATTERN.test(email)) return
    if (withPassword && password.length < MIN_PASSWORD)
      return setError(t("errors.tooShort"))
    setPending(true)
    setError(null)
    try {
      if (!withPassword) {
        const error = await sendLink(email, name)
        if (error) throw error
        return setSent({ to: email, name, kind: "link" })
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name }, emailRedirectTo: callbackUrl(next) },
      })
      if (error) throw error
      // Supabase answers an existing address with a user and no identities.
      if (data.user && !data.user.identities?.length)
        throw new Error("User already registered")
      if (data.session) return navigate(next, { replace: true })
      setSent({ to: email, name, password, kind: "confirm" })
    } catch (err) {
      setError(authError(err, t))
    } finally {
      setPending(false)
    }
  }

  if (sent)
    return (
      <AuthShell>
        <MailSent
          to={sent.to}
          kind={sent.kind}
          onBack={() => setSent(null)}
          onResend={async () => {
            const { error } =
              sent.kind === "link"
                ? { error: await sendLink(sent.to, sent.name) }
                : await supabase.auth.resend({
                    type: "signup",
                    email: sent.to,
                    options: { emailRedirectTo: callbackUrl(next) },
                  })
            return error ? authError(error, t) : null
          }}
        />
      </AuthShell>
    )

  return (
    <AuthShell>
      <AuthCard
        title={t("signup.title")}
        description={
          withPassword ? t("signup.passwordHint") : t("signup.magicHint")
        }
      >
        <form onSubmit={onSubmit} noValidate={false}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">{t("signup.name")}</FieldLabel>
              <Input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                placeholder={t("signup.namePlaceholder")}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="email">{t("fields.email")}</FieldLabel>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder={t("fields.emailPlaceholder")}
                required
              />
            </Field>
            {withPassword && (
              <Field>
                <FieldLabel htmlFor="password">
                  {t("fields.password")}
                </FieldLabel>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={MIN_PASSWORD}
                  required
                  autoFocus
                />
              </Field>
            )}
            <Field>
              <SubmitButton
                pending={pending}
                icon={withPassword ? UserAdd01Icon : Mail01Icon}
              >
                {t("signup.submit")}
              </SubmitButton>
              <FormError>{error}</FormError>
              <TextButton
                onClick={() => {
                  setWithPassword((v) => !v)
                  setError(null)
                }}
              >
                {withPassword ? t("fields.useLink") : t("signup.usePassword")}
              </TextButton>
              <p className="text-center text-sm text-muted-foreground">
                {t("signup.haveAccount")}{" "}
                <TextLink
                  to={
                    next === "/projects"
                      ? "/login"
                      : `/login?next=${encodeURIComponent(next)}`
                  }
                >
                  {t("signup.signIn")}
                </TextLink>
              </p>
            </Field>
          </FieldGroup>
        </form>
      </AuthCard>
      <LegalNote template={t("signup.legal")} />
    </AuthShell>
  )
}
