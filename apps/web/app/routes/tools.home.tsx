import { Link, useRouteLoaderData } from "react-router"
import { cn } from "cn"

import { Button, buttonVariants } from "@workspace/ui/components/button"

import { openSettings } from "@/components/settings/settings-dialog"
import { messages } from "@/components/tools/tools.messages"
import { useT } from "@/i18n/core"
import { toolPath, type ToolId } from "@/lib/tools/catalog"

export default function ToolsHome() {
  const t = useT(messages)
  const layout = useRouteLoaderData("routes/tools") as
    { enabled: ToolId[] } | undefined
  return (
    <>
      <div className="max-w-2xl">
        <h1 className="studio-title text-4xl">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("intro")}</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {layout?.enabled.map((id) => (
          <li
            key={id}
            className="flex flex-col items-start gap-3 rounded-lg border p-4"
          >
            <div>
              <h2 className="font-medium">{t(`${id}.name`)}</h2>
              <p className="text-sm text-muted-foreground">{t(`${id}.hint`)}</p>
            </div>
            <Link
              to={toolPath(id)}
              aria-label={`${t("open")}: ${t(`${id}.name`)}`}
              className={cn(buttonVariants({ variant: "outline" }), "mt-auto")}
            >
              {t("open")}
            </Link>
          </li>
        ))}
      </ul>
      <Button
        variant="outline"
        className="self-start"
        onPress={() => openSettings("labs")}
      >
        {t("more")}
      </Button>
    </>
  )
}
