import * as React from "react"
import { Link } from "react-router"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import { Mail01Icon } from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Spinner } from "@workspace/ui/components/spinner"

import {
  DEFAULT_LOCALE,
  isLocale,
  translate,
  useT,
  type MessagePath,
  type Translate,
} from "@/i18n/core"
import { messages } from "./auth.messages"

// Inline links on the auth and legal pages are always underlined, in ink.
export const linkClass =
  "rounded-xs text-foreground underline decoration-foreground/35 underline-offset-4 transition-[text-decoration-color] duration-150 ease-out outline-none hover:decoration-foreground focus-visible:ring-3 focus-visible:ring-ring/50"

export function TextLink({
  className,
  ...props
}: React.ComponentProps<typeof Link>) {
  return <Link className={cn(linkClass, className)} {...props} />
}

// A link-styled button, for switching between the link and password forms.
export function TextButton({
  className,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn("mx-auto cursor-pointer text-sm", linkClass, className)}
      {...props}
    />
  )
}

// Fills `{name}` placeholders in a message with elements.
export function rich(template: string, parts: Record<string, React.ReactNode>) {
  return template.split(/(\{\w+\})/).map((chunk, i) => {
    const name = chunk.match(/^\{(\w+)\}$/)?.[1]
    return (
      <React.Fragment key={i}>
        {name && name in parts ? parts[name] : chunk}
      </React.Fragment>
    )
  })
}

export function Logo() {
  return (
    <Link
      to="/"
      className="flex items-center gap-2 self-center rounded-sm text-xl outline-none lettering focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <img src="/icon.svg" alt="" width={28} height={28} className="size-7" />
      Palmframe
    </Link>
  )
}

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted p-6 md:p-10 dark:bg-background">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Logo />
        {children}
      </div>
    </div>
  )
}

export function AuthCard({
  icon,
  title,
  description,
  children,
}: {
  // Shown above the title, in a ring.
  icon?: typeof Mail01Icon
  title: string
  description?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="text-center">
        {icon && (
          <span className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full border text-foreground">
            <HugeiconsIcon icon={icon} strokeWidth={2} className="size-5" />
          </span>
        )}
        <CardTitle className="text-3xl lettering">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export function LegalNote({ template }: { template: string }) {
  const t = useT(messages)
  return (
    <p className="px-6 text-center text-sm text-balance text-muted-foreground">
      {rich(template, {
        // Each link stays on one line; the sentence wraps around them.
        terms: (
          <TextLink to="/terms" className="whitespace-nowrap">
            {t("legal.terms")}
          </TextLink>
        ),
        privacy: (
          <TextLink to="/privacy" className="whitespace-nowrap">
            {t("legal.privacy")}
          </TextLink>
        ),
      })}
    </p>
  )
}

export function SubmitButton({
  pending,
  icon,
  children,
}: {
  pending: boolean
  icon?: typeof Mail01Icon
  children: React.ReactNode
}) {
  return (
    <Button
      type="submit"
      className="w-full"
      isDisabled={pending}
    >
      {pending ? (
        <Spinner />
      ) : (
        icon && <HugeiconsIcon icon={icon} strokeWidth={2} />
      )}
      {children}
    </Button>
  )
}

export function FormError({ children }: { children: React.ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="text-center text-sm text-destructive">
      {children}
    </p>
  )
}

export type SentKind = "link" | "confirm" | "reset"

export function MailSent({
  to,
  kind,
  onResend,
  onBack,
}: {
  to: string
  kind: SentKind
  onResend: () => Promise<string | null>
  onBack: () => void
}) {
  const t = useT(messages)
  const [pending, setPending] = React.useState(false)
  const [note, setNote] = React.useState<string | null>(null)
  return (
    <AuthCard
      icon={Mail01Icon}
      title={t("sent.title")}
      description={
        <>
          {/* Balanced lines, the address in one piece, the next step apart. */}
          <span className="block text-balance">
            {rich(t(`sent.${kind}`), {
              email: (
                <strong className="inline-block max-w-full font-medium [overflow-wrap:anywhere] text-foreground">
                  {to}
                </strong>
              ),
            })}
          </span>
          {kind !== "reset" && (
            <span className="mt-1.5 block text-balance">
              {t(`sent.${kind}Hint`)}
            </span>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <Button
          variant="outline"
          className="w-full"
          isDisabled={pending}
          onPress={async () => {
            setPending(true)
            setNote((await onResend()) ?? t("sent.resent"))
            setPending(false)
          }}
        >
          {pending && <Spinner />}
          {t("sent.resend")}
        </Button>
        <Button variant="ghost" className="w-full" onPress={onBack}>
          {t("sent.otherAddress")}
        </Button>
        {note && (
          <p
            role="status"
            className="text-center text-sm text-muted-foreground"
          >
            {note}
          </p>
        )}
      </div>
    </AuthCard>
  )
}

// Supabase's English errors, in the visitor's language.
export function authError(
  error: unknown,
  t: Translate<typeof messages.en>
): string {
  const text = error instanceof Error ? error.message : String(error ?? "")
  const known: [RegExp, Parameters<typeof t>[0]][] = [
    [/Invalid login credentials/i, "errors.invalidCredentials"],
    [/Email not confirmed/i, "errors.notConfirmed"],
    [/Signups not allowed for otp/i, "errors.noAccount"],
    [/invalid or has expired|otp_expired|flow state/i, "errors.expired"],
    [/code verifier/i, "errors.otherBrowser"],
    [/should be different from the old password/i, "errors.samePassword"],
    [/already registered|already been registered/i, "errors.exists"],
    [/only request this after/i, "errors.wait"],
    [/rate limit/i, "errors.rateLimit"],
    [/Password should be at least/i, "errors.tooShort"],
  ]
  for (const [pattern, key] of known) if (pattern.test(text)) return t(key)
  return t("errors.generic")
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const MIN_PASSWORD = 8

// `meta` runs outside React, so it reads the locale from the root loader.
export function pageTitle(
  matches: readonly unknown[],
  path: MessagePath<typeof messages.en>
) {
  const locale = (matches[0] as { loaderData?: { locale?: unknown } })
    ?.loaderData?.locale
  const title = translate(
    messages,
    isLocale(locale) ? locale : DEFAULT_LOCALE,
    path
  )
  return [{ title: `${title} · Palmframe` }]
}

// Sign-in pages have nothing for a search engine to send people to.
export const privateTitle = (
  matches: readonly unknown[],
  path: MessagePath<typeof messages.en>
) => [...pageTitle(matches, path), { name: "robots", content: "noindex" }]
