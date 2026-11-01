import * as React from "react"
import { useT } from "@/i18n/core"
import { cn } from "cn"

import { Button } from "@workspace/ui/components/button"
import { Progress } from "@workspace/ui/components/progress"

import { TOOLS, type ToolId } from "@/lib/tools/catalog"

import { messages } from "./tools.messages"

type Stage = "idle" | "download" | "work"

// One action at a time, with what it's doing and how far along it is. `error`
// holds a user-facing message; anything unexpected becomes the generic one.
export function useTask() {
  const t = useT(messages)
  const [stage, setStage] = React.useState<Stage>("idle")
  const [progress, setProgress] = React.useState<number | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const alive = React.useRef(true)
  React.useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const download = React.useCallback((fraction: number) => {
    if (!alive.current) return
    setStage("download")
    setProgress(fraction)
  }, [])

  const work = React.useCallback((fraction: number | null = null) => {
    if (!alive.current) return
    setStage("work")
    setProgress(fraction)
  }, [])

  const run = async (task: () => Promise<void>) => {
    setError(null)
    setStage("download")
    setProgress(null)
    try {
      await task()
    } catch (cause) {
      console.error(cause)
      if (alive.current)
        setError(cause instanceof ToolError ? cause.message : t("failed"))
    } finally {
      if (alive.current) setStage("idle")
    }
  }

  return { busy: stage !== "idle", stage, progress, error, run, download, work }
}

export class ToolError extends Error {}

export type Task = ReturnType<typeof useTask>

export function TaskStatus({ task }: { task: Task }) {
  const t = useT(messages)
  if (task.error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {task.error}
      </p>
    )
  if (!task.busy) return null
  const label = task.stage === "download" ? t("downloading") : t("working")
  return (
    <div aria-live="polite" className="flex max-w-md flex-col gap-1.5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <Progress
        aria-label={label}
        isIndeterminate={task.progress === null}
        value={task.progress === null ? undefined : task.progress * 100}
      />
    </div>
  )
}

export function ToolPage({
  id,
  children,
}: {
  id: ToolId
  children: React.ReactNode
}) {
  const t = useT(messages)
  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-2xl">
        <h1 className="studio-title text-4xl">{t(`${id}.name`)}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t(`${id}.hint`)}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("privacyNote")} {t("firstRun", { mb: TOOLS[id].downloadMB })}
        </p>
      </div>
      {children}
    </div>
  )
}

export function FileDrop({
  accept,
  multiple = false,
  disabled = false,
  onFiles,
}: {
  accept: string
  multiple?: boolean
  disabled?: boolean
  onFiles: (files: File[]) => void
}) {
  const t = useT(messages)
  const [over, setOver] = React.useState(false)
  const take = (list: FileList | null) => {
    // A file with no type is left for the decoder to judge.
    const kinds = accept.split(",").map((a) => a.split("/")[0]!)
    const files = [...(list ?? [])].filter(
      (f) => !f.type || kinds.some((kind) => f.type.startsWith(`${kind}/`))
    )
    if (files.length) onFiles(multiple ? files : files.slice(0, 1))
  }
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        if (!disabled) take(e.dataTransfer.files)
      }}
      className={cn(
        "flex max-w-2xl cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed px-6 py-10 text-center transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50",
        over && "border-ring bg-muted",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      <input
        type="file"
        className="sr-only"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(e) => {
          take(e.target.files)
          e.target.value = ""
        }}
      />
      <span className="text-sm font-medium">
        {t(multiple ? "chooseFiles" : "chooseFile")}
      </span>
      <span className="text-sm text-muted-foreground">
        {t(multiple ? "dropHintMany" : "dropHint")}
      </span>
    </label>
  )
}

export function CopyButton({ text }: { text: string }) {
  const t = useT(messages)
  const [copied, setCopied] = React.useState(false)
  return (
    <Button
      variant="outline"
      onPress={async () => {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? t("copied") : t("copy")}
    </Button>
  )
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

// Object URLs for previews, released when the set changes or the page closes.
export function useObjectUrls(blobs: Blob[]) {
  const [urls, setUrls] = React.useState<string[]>([])
  React.useEffect(() => {
    const made = blobs.map((b) => URL.createObjectURL(b))
    setUrls(made)
    return () => made.forEach((u) => URL.revokeObjectURL(u))
  }, [blobs])
  return urls
}
