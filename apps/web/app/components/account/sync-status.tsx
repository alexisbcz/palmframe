import { HugeiconsIcon } from "@hugeicons/react"
import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  CloudOffIcon,
} from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"

import type { SyncStatus as Status } from "@/components/comic-canvas/use-cloud-sync"
import { useT } from "@/i18n/core"
import { messages } from "./account.messages"

export function SyncStatus({ status }: { status: Status }) {
  const t = useT(messages)
  if (status === "conflict")
    return (
      <div className="flex items-center gap-2 text-sm text-destructive">
        <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} className="size-4" />
        <span title={t("sync.conflictHint")}>{t("sync.conflict")}</span>
        <Button variant="outline" size="sm" onPress={() => location.reload()}>
          {t("sync.reload")}
        </Button>
      </div>
    )
  const icon =
    status === "saving" ? (
      <Spinner className="size-3.5" />
    ) : (
      <HugeiconsIcon
        icon={status === "saved" ? CheckmarkCircle02Icon : CloudOffIcon}
        strokeWidth={2}
        className="size-3.5"
      />
    )
  return (
    <span
      role="status"
      title={t(`sync.${status}`)}
      className={
        "flex items-center gap-1.5 text-xs " +
        (status === "error" || status === "offline"
          ? "text-amber-600 dark:text-amber-400"
          : "text-muted-foreground")
      }
    >
      {icon}
      <span className="hidden max-w-48 truncate xl:inline">
        {t(`sync.${status}`)}
      </span>
    </span>
  )
}
