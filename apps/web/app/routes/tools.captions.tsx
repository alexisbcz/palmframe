import * as React from "react"
import { data } from "react-router"

import { Button } from "@workspace/ui/components/button"
import { Textarea } from "@workspace/ui/components/textarea"

import {
  CopyButton,
  FileDrop,
  TaskStatus,
  ToolPage,
  downloadBlob,
  useTask,
} from "@/components/tools/shared"
import { messages } from "@/components/tools/tools.messages"
import { useLocale, useT } from "@/i18n/core"
import { requireTool } from "@/lib/tools.server"
import { baseName } from "@/lib/tools/audio"
import { toCues, toSrt, toVtt, type Word } from "@/lib/tools/captions"

import type { Route } from "./+types/tools.captions"

export async function loader({ request }: Route.LoaderArgs) {
  const { headers } = await requireTool(request, "captions")
  return data(null, { headers })
}

// Telling the language apart needs the audio decoded whole, so very long
// recordings go without. Captions matter more than the label.
const LANGUAGE_CHECK_LIMIT = 100 * 1024 * 1024
const EAR_RATE = 16_000
const EAR_SECONDS = 30

async function spokenLanguage(file: File, onProgress: (f: number) => void) {
  if (file.size > LANGUAGE_CHECK_LIMIT) return null
  const { loadEar } = await import("@/lib/tools/models.client")
  const context = new OfflineAudioContext(1, EAR_RATE * EAR_SECONDS, EAR_RATE)
  const audio = await context.decodeAudioData(await file.arrayBuffer())
  const source = context.createBufferSource()
  source.buffer = audio
  source.connect(context.destination)
  source.start()
  const rendered = await context.startRendering()
  const ear = await loadEar(onProgress)
  const detection = await ear.identify(rendered.getChannelData(0), EAR_RATE)
  return detection.isReliable ? detection.language : null
}

export default function Captions() {
  const t = useT(messages)
  const { locale } = useLocale()
  const task = useTask()
  const [file, setFile] = React.useState<File | null>(null)
  const [words, setWords] = React.useState<Word[] | null>(null)
  const [transcript, setTranscript] = React.useState("")
  const [language, setLanguage] = React.useState<string | null>(null)
  const [webgpu, setWebgpu] = React.useState(true)
  React.useEffect(() => setWebgpu("gpu" in navigator), [])

  const transcribe = () =>
    task.run(async () => {
      if (!file) return
      setWords(null)
      setLanguage(null)
      const { loadVoz } = await import("@/lib/tools/models.client")
      const voz = await loadVoz(task.download)
      task.work(0)
      const result = await voz.transcribe(file, { onProgress: task.work })
      setWords(result.words)
      setTranscript(result.text)
      task.work()
      setLanguage(await spokenLanguage(file, task.download).catch(() => null))
    })

  const save = (text: string, extension: string) =>
    file &&
    downloadBlob(
      new Blob([text], { type: "text/plain" }),
      `${baseName(file.name)}.${extension}`
    )

  const languageName =
    language &&
    new Intl.DisplayNames([locale], { type: "language" }).of(language)

  return (
    <ToolPage id="captions">
      {webgpu ? (
        <>
          <p className="text-sm text-muted-foreground">
            {t("captions.memory")}
          </p>
          <FileDrop
            accept="audio/*,video/*"
            disabled={task.busy}
            onFiles={([f]) => {
              setFile(f!)
              setWords(null)
            }}
          />
        </>
      ) : (
        <p role="alert" className="max-w-2xl text-sm text-destructive">
          {t("captions.needsWebgpu")}
        </p>
      )}
      {file && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="min-w-0 truncate text-sm">{file.name}</p>
          <Button
            variant="outline"
            isDisabled={task.busy}
            onPress={() => void transcribe()}
          >
            {t("captions.action")}
          </Button>
        </div>
      )}
      <TaskStatus task={task} />
      {words && (
        <div className="flex max-w-2xl flex-col gap-3">
          {languageName && (
            <p className="text-sm text-muted-foreground">
              {t("captions.language", { language: languageName })}
            </p>
          )}
          <Textarea
            aria-label={t("captions.transcript")}
            readOnly
            rows={10}
            value={transcript}
          />
          <div className="flex flex-wrap gap-2">
            <CopyButton text={transcript} />
            <Button
              variant="outline"
              onPress={() => save(toSrt(toCues(words)), "srt")}
            >
              {t("captions.srt")}
            </Button>
            <Button
              variant="outline"
              onPress={() => save(toVtt(toCues(words)), "vtt")}
            >
              {t("captions.vtt")}
            </Button>
          </div>
        </div>
      )}
    </ToolPage>
  )
}
