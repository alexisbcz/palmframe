import { Link, useNavigate, useRouteLoaderData, useSubmit } from "react-router"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import { FolderLibraryIcon, Logout01Icon } from "@hugeicons/core-free-icons"

import { Button, buttonVariants } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

import { useT } from "@/i18n/core"
import type { Viewer } from "@/lib/database"
import { messages } from "./account.messages"

export function useViewer() {
  return (useRouteLoaderData("root")?.viewer ?? null) as Viewer | null
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?"
  )
}

export function AccountMenu() {
  const t = useT(messages)
  const viewer = useViewer()
  const navigate = useNavigate()
  const submit = useSubmit()

  if (!viewer)
    return (
      <Link
        to="/login?next=/projects"
        className={cn(buttonVariants({ variant: "outline" }))}
      >
        {t("account.signIn")}
      </Link>
    )

  return (
    <DropdownMenuTrigger>
      <Button
        variant="outline"
        size="icon"
        aria-label={`${t("account.label")}: ${viewer.name}`}
        className="rounded-full text-xs"
      >
        {initials(viewer.name)}
      </Button>
      <DropdownMenu
        placement="bottom end"
        className="w-max max-w-[calc(100vw-2rem)] min-w-52"
        onAction={(key) => {
          if (key === "projects") navigate("/projects")
          if (key === "logout")
            submit(null, { method: "post", action: "/logout" })
        }}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col py-1.5">
            <span className="truncate text-sm text-foreground">
              {viewer.name}
            </span>
            <span className="truncate font-normal">{viewer.email}</span>
          </DropdownMenuLabel>
          <DropdownMenuItem id="projects">
            <HugeiconsIcon icon={FolderLibraryIcon} strokeWidth={2} />
            {t("account.projects")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem id="logout">
          <HugeiconsIcon icon={Logout01Icon} strokeWidth={2} />
          {t("account.signOut")}
        </DropdownMenuItem>
      </DropdownMenu>
    </DropdownMenuTrigger>
  )
}
