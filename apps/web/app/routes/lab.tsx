import * as React from "react"
import { data, useNavigate } from "react-router"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"

import { allowed, civitaiMeta, installed } from "@/lib/lab/comfy.server"
import {
  LAB_DEFAULTS,
  civitaiTarget,
  fromCivitai,
  labQuery,
  toRequest,
  type LabRequest,
} from "@/lib/lab/model"
import { PRIVATE } from "@/lib/seo"

import type { Route } from "./+types/lab"

// A developer tool for this machine only, so its copy isn't translated.
export const meta: Route.MetaFunction = () => [
  { title: "Lab · Palmframe" },
  PRIVATE,
]

export async function loader({ request }: Route.LoaderArgs) {
  if (!allowed(request)) throw data("Not found", { status: 404 })
  const url = new URL(request.url)
  const comfy = await installed()
  const params = Object.fromEntries(url.searchParams)
  const link = params.civitai
  let base = LAB_DEFAULTS
  let notice: string | null = null
  let missing: string[] = []
  if (link) {
    const target = civitaiTarget(link)
    const found = target ? await civitaiMeta(target).catch(() => null) : null
    if (found) {
      const read = fromCivitai(found, comfy.loras)
      base = toRequest(read.values)
      missing = read.missing
      notice =
        "Filled in from Civitai. Steps, CFG and sampler stay on the local Turbo settings."
    } else
      notice = target
        ? "Civitai doesn't share this image's settings. Fill it in by hand, or paste the model page's link."
        : "That isn't a Civitai image or model version link."
  }
  return { comfy, missing, notice, initial: toRequest(params, base) }
}

interface Take {
  url: string
  seconds: number
  file: string
  seed: number
}

const randomSeed = () => Math.floor(Math.random() * 2 ** 48)

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

const SELECT =
  "h-9 w-full min-w-0 cursor-pointer rounded-md border bg-background px-2 text-sm"

export default function Lab({ loaderData }: Route.ComponentProps) {
  const { comfy, missing, notice, initial } = loaderData
  const navigate = useNavigate()
  const [r, setR] = React.useState<LabRequest>(initial)
  const [takes, setTakes] = React.useState<Take[]>([])
  const [busy, setBusy] = React.useState(false)
  const [starting, setStarting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [civitai, setCivitai] = React.useState("")
  const abort = React.useRef<AbortController>(null)
  const set = (patch: Partial<LabRequest>) => setR((v) => ({ ...v, ...patch }))
  React.useEffect(() => setR(initial), [initial])

  // Starting ComfyUI reloads from here, so a Civitai link is read again once
  // the installed LoRAs can be matched against it.
  const arrival = React.useRef<string | null>(null)

  // The address bar always holds the link to what's on screen.
  React.useEffect(() => {
    arrival.current ??= window.location.href
    const query = labQuery(r)
    window.history.replaceState(null, "", query ? `/lab?${query}` : "/lab")
  }, [r])

  const start = async () => {
    setStarting(true)
    setError(null)
    await fetch("/api/lab", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent: "start" }),
    })
    // ComfyUI takes a few seconds to bind its port.
    for (let i = 0; i < 40; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1_500))
      const status = await fetch("/api/lab").then((res) => res.json())
      if (status.running) break
    }
    window.location.href = arrival.current ?? "/lab"
  }

  const generate = async () => {
    const seed = r.seed || randomSeed()
    set({ seed })
    setBusy(true)
    setError(null)
    abort.current = new AbortController()
    try {
      const res = await fetch("/api/lab", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...r, seed }),
        signal: abort.current.signal,
      })
      if (!res.ok)
        throw new Error(
          ((await res.json().catch(() => null)) as { error?: string } | null)
            ?.error ?? `Failed (${res.status})`
        )
      const url = URL.createObjectURL(await res.blob())
      setTakes((t) => [
        {
          url,
          seed,
          seconds: Math.round(Number(res.headers.get("x-render-ms")) / 1000),
          file: res.headers.get("x-file") ?? "",
        },
        ...t,
      ])
    } catch (e) {
      if (!abort.current?.signal.aborted)
        setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[380px_minmax(0,1fr)]">
        <section className="flex flex-col gap-3">
          <h1 className="studio-title text-4xl">Lab</h1>
          <p className="text-sm text-muted-foreground">
            Renders on this Mac through ComfyUI, with no credits.
          </p>

          {!comfy.running && (
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
              ComfyUI isn't running.
              <Button
                variant="outline"
                isDisabled={starting}
                onPress={() => void start()}
              >
                {starting ? "Starting" : "Start ComfyUI"}
              </Button>
            </div>
          )}

          <div className="flex">
            <Input
              aria-label="Civitai link"
              className="min-w-0 flex-1 rounded-e-none"
              placeholder="Civitai image or model link"
              value={civitai}
              onChange={(e) => setCivitai(e.target.value)}
            />
            <Button
              variant="outline"
              className="rounded-s-none"
              isDisabled={!civitai.trim()}
              onPress={() =>
                navigate(`/lab?civitai=${encodeURIComponent(civitai.trim())}`)
              }
            >
              Fill in
            </Button>
          </div>
          {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
          {missing.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Used there, not installed here: {missing.join(", ")}
            </p>
          )}

          <Field label="Prompt">
            <Textarea
              className="min-h-32"
              value={r.prompt}
              onChange={(e) => set({ prompt: e.target.value })}
            />
          </Field>
          <Field label="Negative prompt">
            <Textarea
              className="min-h-16"
              value={r.negative}
              onChange={(e) => set({ negative: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-[minmax(0,1fr)_80px] gap-2">
            <Field label="LoRA">
              <select
                className={SELECT}
                value={r.lora}
                onChange={(e) => set({ lora: e.target.value })}
              >
                <option value="">None</option>
                {r.lora && !comfy.loras.includes(r.lora) && (
                  <option value={r.lora}>{r.lora}</option>
                )}
                {comfy.loras.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Strength">
              <Input
                type="number"
                step={0.05}
                value={r.strength}
                onChange={(e) => set({ strength: Number(e.target.value) })}
              />
            </Field>
          </div>
          <Field label="Model">
            <select
              className={SELECT}
              value={r.model}
              onChange={(e) => set({ model: e.target.value })}
            >
              {!comfy.models.includes(r.model) && (
                <option value={r.model}>{r.model}</option>
              )}
              {comfy.models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-4 gap-2">
            <Field label="Width">
              <Input
                type="number"
                step={16}
                value={r.width}
                onChange={(e) => set({ width: Number(e.target.value) })}
              />
            </Field>
            <Field label="Height">
              <Input
                type="number"
                step={16}
                value={r.height}
                onChange={(e) => set({ height: Number(e.target.value) })}
              />
            </Field>
            <Field label="Steps">
              <Input
                type="number"
                value={r.steps}
                onChange={(e) => set({ steps: Number(e.target.value) })}
              />
            </Field>
            <Field label="CFG">
              <Input
                type="number"
                step={0.5}
                value={r.cfg}
                onChange={(e) => set({ cfg: Number(e.target.value) })}
              />
            </Field>
          </div>
          <div className="flex items-end">
            <Field label="Seed (0 picks one)">
              <Input
                type="number"
                className="rounded-e-none"
                value={r.seed}
                onChange={(e) => set({ seed: Number(e.target.value) })}
              />
            </Field>
            <Button
              variant="outline"
              className="rounded-s-none"
              onPress={() => set({ seed: randomSeed() })}
            >
              New
            </Button>
          </div>
          {busy ? (
            <Button variant="outline" onPress={() => abort.current?.abort()}>
              Rendering. Cancel
            </Button>
          ) : (
            <Button
              isDisabled={!comfy.running || !r.prompt.trim()}
              onPress={() => void generate()}
            >
              Generate
            </Button>
          )}
          {error && (
            <p role="alert" className="text-sm break-words text-destructive">
              {error}
            </p>
          )}
        </section>

        <section className="grid content-start gap-4 sm:grid-cols-2">
          {takes.map((t) => (
            <figure key={t.url} className="flex flex-col gap-1.5">
              <img
                src={t.url}
                alt=""
                className="w-full rounded-lg outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
              />
              <figcaption className="text-xs text-muted-foreground tabular-nums">
                {t.seconds}s · seed {t.seed} · ComfyUI/output/{t.file}
              </figcaption>
            </figure>
          ))}
          {!takes.length && (
            <p className="text-sm text-muted-foreground">
              Renders appear here, and stay in ComfyUI/output.
            </p>
          )}
        </section>
      </main>
    </div>
  )
}
