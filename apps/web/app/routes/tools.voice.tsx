import * as React from "react"
import { data } from "react-router"

import { Button } from "@workspace/ui/components/button"

import {
  FileDrop,
  TaskStatus,
  ToolError,
  ToolPage,
  downloadBlob,
  useObjectUrls,
  useTask,
} from "@/components/tools/shared"
import { messages } from "@/components/tools/tools.messages"
import { useT } from "@/i18n/core"
import { requireTool } from "@/lib/tools.server"
import { baseName, encodeWav } from "@/lib/tools/audio"

import type { Route } from "./+types/tools.voice"

export async function loader({ request }: Route.LoaderArgs) {
  const { headers } = await requireTool(request, "voice")
  return data(null, { headers })
}

async function decode(file: File) {
  const context = new AudioContext()
  try {
    const audio = await context.decodeAudioData(await file.arrayBuffer())
    const channels = Array.from({ length: audio.numberOfChannels }, (_, i) =>
      audio.getChannelData(i)
    )
    return { channels, sampleRate: audio.sampleRate }
  } finally {
    void context.close()
  }
}

export default function Voice() {
  const t = useT(messages)
  const task = useTask()
  const [file, setFile] = React.useState<File | null>(null)
  const [cleaned, setCleaned] = React.useState<Blob | null>(null)
  const blobs = React.useMemo(
    () => (file && cleaned ? [file, cleaned] : []),
    [file, cleaned]
  )
  const [before, after] = useObjectUrls(blobs)

  const clean = () =>
    task.run(async () => {
      if (!file) return
      setCleaned(null)
      const { loadClear } = await import("@/lib/tools/models.client")
      const clear = await loadClear(task.download)
      task.work()
      const audio = await decode(file).catch(() => {
        throw new ToolError(t("voice.unreadable"))
      })
      const result = await clear.enhance(audio.channels, audio.sampleRate)
      setCleaned(encodeWav(result.channels, result.sampleRate))
    })

  return (
    <ToolPage id="voice">
      <FileDrop
        accept="audio/*"
        disabled={task.busy}
        onFiles={([f]) => {
          setFile(f!)
          setCleaned(null)
        }}
      />
      {file && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 truncate text-sm">{file.name}</p>
          <Button
            variant="outline"
            isDisabled={task.busy}
            onPress={() => void clean()}
          >
            {t("voice.action")}
          </Button>
        </div>
      )}
      <TaskStatus task={task} />
      {before && after && file && cleaned && (
        <div className="grid max-w-2xl gap-4">
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium">{t("voice.before")}</p>
            <audio controls src={before} className="w-full" />
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium">{t("voice.after")}</p>
            <audio controls src={after} className="w-full" />
          </div>
          <Button
            variant="outline"
            className="self-start"
            onPress={() =>
              downloadBlob(cleaned, `${baseName(file.name)}-clean.wav`)
            }
          >
            {t("voice.download")}
          </Button>
        </div>
      )}
    </ToolPage>
  )
}
