import { Link } from "react-router"

import { buttonVariants } from "@workspace/ui/components/button"

import { useT } from "@/i18n/core"
import { messages } from "./error-page.messages"

export function ErrorPage({
  kind,
  children,
}: {
  kind: "missing" | "failed"
  children?: React.ReactNode
}) {
  const t = useT(messages)
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3 bg-background p-6 text-center text-foreground">
      <h1 className="lettering text-5xl">{t(`${kind}.title`)}</h1>
      <p className="max-w-sm text-sm text-balance text-muted-foreground">
        {t(`${kind}.body`)}
      </p>
      <Link to="/" className={buttonVariants({ className: "mt-3" })}>
        {t("home")}
      </Link>
      {children}
    </main>
  )
}
