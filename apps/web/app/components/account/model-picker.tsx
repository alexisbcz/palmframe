import * as React from "react"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowDown01Icon,
  PencilEdit02Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command"
import { Popover, PopoverTrigger } from "@workspace/ui/components/popover"

import { useLocale, useT } from "@/i18n/core"
import type { ModelOption } from "@/routes/api.openrouter"

import { messages } from "./openrouter.messages"

// Provider logos from LobeHub's icon set, by OpenRouter author slug. Colour
// versions where there is one; the rest are drawn in black on a white tile.
const CDN =
  "https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@1.101.0/icons"
const ICONS: Record<string, string> = {
  "aion-labs": "aionlabs-color",
  amazon: "nova-color",
  anthropic: "anthropic",
  "black-forest-labs": "bfl",
  bytedance: "bytedance-color",
  "bytedance-seed": "bytedance-color",
  cognitivecomputations: "dolphin",
  cohere: "cohere-color",
  deepseek: "deepseek-color",
  "dots-studio": "dotsstudio",
  fireworks: "fireworks-color",
  google: "gemini-color",
  "ibm-granite": "ibm",
  inception: "inception",
  inclusionai: "ling-color",
  "inference-net": "inference",
  krea: "krea",
  liquid: "liquid",
  meituan: "longcat-color",
  meta: "meta-color",
  "meta-llama": "meta-color",
  microsoft: "microsoft-color",
  minimax: "minimax-color",
  mistralai: "mistral-color",
  moonshotai: "moonshot",
  morph: "morph-color",
  nousresearch: "nousresearch",
  nvidia: "nvidia-color",
  openai: "openai",
  openrouter: "openrouter-color",
  perceptron: "perceptron",
  perplexity: "perplexity-color",
  poolside: "poolside-color",
  qwen: "qwen-color",
  recraft: "recraft",
  rekaai: "reka",
  relace: "relace",
  sakana: "sakana-color",
  stepfun: "stepfun-color",
  tencent: "tencent-color",
  typesafe: "typesafeai",
  upstage: "upstage-color",
  "x-ai": "xai",
  xiaomi: "xiaomimimo",
  "z-ai": "zhipu-color",
}

// Providers people look for first; the rest follow alphabetically.
const FIRST = [
  "openai",
  "google",
  "anthropic",
  "x-ai",
  "black-forest-labs",
  "bytedance-seed",
  "qwen",
  "deepseek",
  "moonshotai",
  "z-ai",
  "mistralai",
  "meta-llama",
]

const author = (id: string) => id.split("/")[0]!.replace(/^~/, "")

// "OpenAI: GPT Image 2" is shown as "GPT Image 2" under "OpenAI".
function split(m: { id: string; name: string }) {
  const at = m.name.indexOf(": ")
  return at > 0
    ? { provider: m.name.slice(0, at), model: m.name.slice(at + 2) }
    : { provider: author(m.id), model: m.name }
}

export function ProviderLogo({
  model,
  className,
}: {
  model: string
  className?: string
}) {
  const icon = ICONS[author(model)]
  const [broken, setBroken] = React.useState(false)
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-md ring-1",
        icon && !broken
          ? "bg-white ring-black/10"
          : "bg-muted text-[11px] font-semibold text-muted-foreground uppercase ring-foreground/15",
        className
      )}
    >
      {icon && !broken ? (
        <img
          src={`${CDN}/${icon}.svg`}
          alt=""
          loading="lazy"
          className="size-[70%] object-contain"
          onError={() => setBroken(true)}
        />
      ) : (
        author(model).charAt(0)
      )}
    </span>
  )
}

// A searchable model menu grouped by provider, with logos. `custom` allows
// any OpenRouter model id typed into the search, for models not listed.
export function ModelPicker({
  id,
  value,
  models,
  onChange,
  isDisabled,
  custom,
}: {
  id?: string
  value: string
  models: ModelOption[]
  onChange: (id: string) => void
  isDisabled?: boolean
  custom?: boolean
}) {
  const t = useT(messages)
  const { locale } = useLocale()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")

  const current = models.find((m) => m.id === value)
  const shown = current
    ? split(current)
    : { provider: author(value), model: value }

  const groups = React.useMemo(() => {
    const by = new Map<string, { provider: string; models: ModelOption[] }>()
    for (const m of models) {
      const key = author(m.id)
      const g = by.get(key) ?? { provider: split(m).provider, models: [] }
      g.models.push(m)
      by.set(key, g)
    }
    const rank = (k: string) => {
      const i = FIRST.indexOf(k)
      return i < 0 ? FIRST.length : i
    }
    return [...by.entries()]
      .sort(
        ([a, ga], [b, gb]) =>
          rank(a) - rank(b) || ga.provider.localeCompare(gb.provider)
      )
      .map(([key, g]) => ({
        key,
        ...g,
        models: g.models.sort((a, b) => b.created - a.created),
      }))
  }, [models])

  const usd = (n: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: n < 1 ? 3 : 2,
    }).format(n)
  const detail = (m: ModelOption) => {
    if (m.refs) return t("picker.refs", { n: m.refs })
    const parts = []
    if (m.context)
      parts.push(
        t("picker.context", {
          n: new Intl.NumberFormat(locale, { notation: "compact" }).format(
            m.context
          ),
        })
      )
    if (m.price)
      parts.push(
        m.price.input + m.price.output === 0
          ? t("picker.free")
          : t("picker.price", {
              input: usd(m.price.input),
              output: usd(m.price.output),
            })
      )
    return parts.join(" · ")
  }

  const typed = query.trim()
  const offerCustom =
    custom &&
    /^[\w.-]+\/[\w.:-]+$/.test(typed) &&
    !models.some((m) => m.id === typed)

  const pick = (next: string) => {
    setOpen(false)
    setQuery("")
    if (next !== value) onChange(next)
  }

  const row =
    "gap-2.5 rounded-md! px-2 py-1.5 [&>svg:last-child]:hidden data-focused:bg-muted"

  return (
    <PopoverTrigger isOpen={open} onOpenChange={setOpen}>
      <Button
        id={id}
        variant="outline"
        isDisabled={isDisabled}
        className="h-10 w-full justify-start gap-2.5 px-2 font-normal"
      >
        <ProviderLogo model={value} />
        <span className="min-w-0 truncate">{shown.model}</span>
        <span className="truncate text-muted-foreground max-sm:hidden">
          {shown.provider}
        </span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          strokeWidth={2}
          className={cn(
            "ms-auto shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </Button>
      <Popover
        placement="bottom start"
        className="w-(--trigger-width) min-w-72 gap-0 overflow-hidden p-0"
      >
        <Command
          inputValue={query}
          onInputChange={setQuery}
          className="rounded-none! p-0"
        >
          <div className="border-b p-1.5 pb-2 [&_[data-slot=input-group]]:has-[input:focus-visible]:border-ring [&_[data-slot=input-group]]:has-[input:focus-visible]:ring-3 [&_[data-slot=input-group]]:has-[input:focus-visible]:ring-ring/50">
            <CommandInput placeholder={t("picker.search")} />
          </div>
          <CommandList
            aria-label={t("picker.search")}
            onAction={(key) => pick(key === "custom" ? typed : String(key))}
            className="max-h-80 p-1"
            renderEmptyState={() => (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t("picker.empty")}
              </p>
            )}
          >
            {offerCustom && (
              <CommandGroup>
                <CommandItem id="custom" textValue={typed} className={row}>
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted ring-1 ring-foreground/15">
                    <HugeiconsIcon
                      icon={PencilEdit02Icon}
                      strokeWidth={2}
                      className="size-3.5"
                    />
                  </span>
                  <span className="truncate">
                    {t("picker.custom", { id: typed })}
                  </span>
                </CommandItem>
              </CommandGroup>
            )}
            {groups.map((g) => (
              <CommandGroup key={g.key} heading={g.provider}>
                {g.models.map((m) => (
                  <CommandItem
                    key={m.id}
                    id={m.id}
                    textValue={`${m.name} ${m.id}`}
                    className={row}
                  >
                    <ProviderLogo model={m.id} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{split(m).model}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {detail(m) || m.id}
                      </span>
                    </span>
                    {m.id === value && (
                      <HugeiconsIcon
                        icon={Tick02Icon}
                        strokeWidth={2}
                        className="ms-auto size-4 shrink-0"
                      />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </Popover>
    </PopoverTrigger>
  )
}
