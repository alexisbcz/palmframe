import { Link } from "react-router"
import { cn } from "cn"

import { buttonVariants } from "@workspace/ui/components/button"

import { useT } from "@/i18n/core"
import { AuthCard, AuthShell } from "./auth-ui"
import { messages } from "./auth.messages"

export function LegalPage({ kind }: { kind: "terms" | "privacy" }) {
  const t = useT(messages)
  return (
    <AuthShell>
      <AuthCard title={t(`legal.${kind}Title`)}>
        <div className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>{t(`legal.${kind}P1`)}</p>
          <p>{t(`legal.${kind}P2`)}</p>
          <p>{t(`legal.${kind}P3`)}</p>
          <Link
            to="/"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "mt-2 w-full"
            )}
          >
            {t("legal.back")}
          </Link>
        </div>
      </AuthCard>
    </AuthShell>
  )
}
