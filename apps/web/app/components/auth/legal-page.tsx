import * as React from "react"
import { Link, useNavigate } from "react-router"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons"

import { Button, buttonVariants } from "@workspace/ui/components/button"

import { useT } from "@/i18n/core"
import { AuthCard, AuthShell } from "./auth-ui"
import { messages } from "./auth.messages"

export function LegalPage({ kind }: { kind: "terms" | "privacy" }) {
  const t = useT(messages)
  const navigate = useNavigate()
  // React Router numbers this tab's entries (history.state.idx); 0 means the
  // visit started here, so there's no page of ours to go back to.
  const [canGoBack, setCanGoBack] = React.useState(false)
  React.useEffect(() => {
    setCanGoBack((window.history.state?.idx ?? 0) > 0)
  }, [])
  const icon = (
    <HugeiconsIcon
      icon={ArrowLeft01Icon}
      strokeWidth={2}
      data-icon="inline-start"
      className="rtl:rotate-180"
    />
  )
  return (
    <AuthShell>
      <AuthCard title={t(`legal.${kind}Title`)}>
        <div className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>{t(`legal.${kind}P1`)}</p>
          <p>{t(`legal.${kind}P2`)}</p>
          <p>{t(`legal.${kind}P3`)}</p>
          {canGoBack ? (
            <Button
              variant="outline"
              className="mt-2 w-full"
              onPress={() => navigate(-1)}
            >
              {icon}
              {t("legal.goBack")}
            </Button>
          ) : (
            <Link
              to="/"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "mt-2 w-full"
              )}
            >
              {icon}
              {t("legal.back")}
            </Link>
          )}
        </div>
      </AuthCard>
    </AuthShell>
  )
}
