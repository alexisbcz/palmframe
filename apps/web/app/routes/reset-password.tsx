import * as React from "react"
import { useNavigate } from "react-router"
import { LockPasswordIcon } from "@hugeicons/core-free-icons"

import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"

import {
  AuthCard,
  AuthShell,
  FormError,
  MIN_PASSWORD,
  SubmitButton,
  TextLink,
  authError,
  pageTitle,
} from "@/components/auth/auth-ui"
import { messages } from "@/components/auth/auth.messages"
import { useT } from "@/i18n/core"
import { useSupabase } from "@/lib/supabase.browser"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/reset-password"

export const meta: Route.MetaFunction = ({ matches }) =>
  pageTitle(matches, "reset.meta")

// The reset email signs the person in through /auth/callback first.
export async function loader({ request }: Route.LoaderArgs) {
  const { viewer } = await getViewer(request)
  return { signedIn: !!viewer }
}

export default function ResetPassword({ loaderData }: Route.ComponentProps) {
  const t = useT(messages)
  const supabase = useSupabase()
  const navigate = useNavigate()
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  if (!loaderData.signedIn)
    return (
      <AuthShell>
        <AuthCard title={t("reset.title")} description={t("reset.signedOut")}>
          <p className="text-center text-sm">
            <TextLink to="/login">{t("reset.newLink")}</TextLink>
          </p>
        </AuthCard>
      </AuthShell>
    )

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const password = String(new FormData(e.currentTarget).get("password"))
    if (password.length < MIN_PASSWORD) return setError(t("errors.tooShort"))
    setPending(true)
    setError(null)
    const { error } = await supabase.auth.updateUser({ password })
    setPending(false)
    if (error) return setError(authError(error, t))
    navigate("/projects", { replace: true })
  }

  return (
    <AuthShell>
      <AuthCard title={t("reset.title")}>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="password">{t("reset.password")}</FieldLabel>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={MIN_PASSWORD}
                required
                autoFocus
              />
              <FieldDescription>{t("reset.hint")}</FieldDescription>
            </Field>
            <Field>
              <SubmitButton pending={pending} icon={LockPasswordIcon}>
                {t("reset.submit")}
              </SubmitButton>
              <FormError>{error}</FormError>
            </Field>
          </FieldGroup>
        </form>
      </AuthCard>
    </AuthShell>
  )
}
