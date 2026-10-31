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

const fold = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()

// Every word has to appear, in any order: "image openai" finds GPT Image.
function matches(m: ModelOption, terms: string[]) {
  const haystack = fold(`${m.name} ${m.id} ${split(m).provider}`)
  return terms.every((term) => haystack.includes(term))
}

const isFree = (m: ModelOption) =>
  !!m.price && m.price.input + m.price.output === 0

// By provider, the usual ones first, newest models first within each.
function byProvider(models: ModelOption[]) {
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
}

function FilterChip({
  pressed,
  count,
  onPress,
  children,
}: {
  pressed: boolean
  count?: number
  onPress: (e: React.MouseEvent) => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onPress}
      className={cn(
        "inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-xs font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        pressed
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {children}
      {count !== undefined && (
        <span className="font-normal tabular-nums opacity-60">{count}</span>
      )}
    </button>
  )
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

// A searchable model menu grouped by provider, with logos and chips that
// narrow it to one provider. `custom` allows any OpenRouter model id typed
// into the search, for models not listed.
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
  const [provider, setProvider] = React.useState<string | null>(null)
  const [freeOnly, setFreeOnly] = React.useState(false)
  const rootRef = React.useRef<HTMLDivElement>(null)

  const current = models.find((m) => m.id === value)
  const shown = current
    ? split(current)
    : { provider: author(value), model: value }

  const terms = React.useMemo(
    () => fold(query).split(/\s+/).filter(Boolean),
    [query]
  )
  // What the search and the Free toggle leave: the chips count this, so they
  // show where the matches are.
  const found = React.useMemo(
    () => models.filter((m) => matches(m, terms) && (!freeOnly || isFree(m))),
    [models, terms, freeOnly]
  )
  const chips = React.useMemo(() => byProvider(found), [found])
  const filtered = terms.length > 0 || freeOnly || provider !== null
  // The selected model leads an unfiltered list instead of its provider.
  const pinned = !filtered ? current : undefined
  const groups = React.useMemo(
    () =>
      byProvider(
        found.filter(
          (m) => (!provider || author(m.id) === provider) && m.id !== pinned?.id
        )
      ),
    [found, provider, pinned]
  )
  const hasFree = React.useMemo(() => models.some(isFree), [models])
  const providerName =
    provider && split(models.find((m) => author(m.id) === provider)!).provider

  React.useEffect(() => {
    rootRef.current
      ?.querySelector("[data-slot=command-list]")
      ?.scrollTo({ top: 0 })
  }, [terms, provider, freeOnly])

  const clearFilters = () => {
    setQuery("")
    setProvider(null)
    setFreeOnly(false)
  }

  // Back to the search box after a click, so typing and arrows carry on.
  const backToSearch = (e: React.MouseEvent) => {
    if (e.detail && matchMedia("(pointer: fine)").matches)
      rootRef.current?.querySelector("input")?.focus()
  }

  const usd = (n: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: n < 1 ? 3 : 2,
    }).format(n)
  const detail = (m: ModelOption) => {
    if (m.refs) return t("picker.refs", { count: m.refs })
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
    clearFilters()
    if (next !== value) onChange(next)
  }

  const row =
    "gap-2.5 rounded-md! px-2 py-1.5 [&>svg:last-child]:hidden data-focused:bg-muted"
  // Headings stay in view while their provider scrolls past.
  const group =
    "overflow-visible **:[[cmdk-group-heading]]:sticky **:[[cmdk-group-heading]]:top-0 **:[[cmdk-group-heading]]:z-10 **:[[cmdk-group-heading]]:bg-popover"

  const option = (m: ModelOption) => (
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
  )

  return (
    <PopoverTrigger
      isOpen={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) clearFilters()
      }}
    >
      <Button
        id={id}
        variant="outline"
        isDisabled={isDisabled}
        // Stays full width while the menu is open.
        className="h-10 w-full justify-start gap-2.5 px-2 font-normal data-pressed:scale-100!"
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
        <div ref={rootRef} className="contents">
          <Command
            inputValue={query}
            onInputChange={setQuery}
            // The list is already narrowed, and the chips need the same matches.
            filter={() => true}
            className="rounded-none! p-0"
          >
            <div className="shrink-0 p-1.5 pb-2 [&_[data-slot=input-group]]:has-[input:focus-visible]:border-ring [&_[data-slot=input-group]]:has-[input:focus-visible]:ring-3 [&_[data-slot=input-group]]:has-[input:focus-visible]:ring-ring/50">
              <CommandInput placeholder={t("picker.search")} />
            </div>
            <div
              role="group"
              aria-label={t("picker.providers")}
              className="flex shrink-0 scroll-px-2 [scrollbar-width:none] gap-1 overflow-x-auto border-b [mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)] px-2.5 pe-6 pb-2"
            >
              <FilterChip
                pressed={!provider}
                count={found.length}
                onPress={(e) => {
                  setProvider(null)
                  backToSearch(e)
                }}
              >
                {t("picker.all")}
              </FilterChip>
              {hasFree && (
                <FilterChip
                  pressed={freeOnly}
                  onPress={(e) => {
                    setFreeOnly(!freeOnly)
                    backToSearch(e)
                  }}
                >
                  {t("picker.free")}
                </FilterChip>
              )}
              {provider && !chips.some((c) => c.key === provider) && (
                <FilterChip
                  pressed
                  count={0}
                  onPress={(e) => {
                    setProvider(null)
                    backToSearch(e)
                  }}
                >
                  <ProviderLogo
                    model={`${provider}/`}
                    className="size-4 rounded-[3px]"
                  />
                  {providerName}
                </FilterChip>
              )}
              {chips.map((c) => (
                <FilterChip
                  key={c.key}
                  pressed={provider === c.key}
                  count={c.models.length}
                  onPress={(e) => {
                    setProvider(provider === c.key ? null : c.key)
                    backToSearch(e)
                  }}
                >
                  <ProviderLogo
                    model={`${c.key}/`}
                    className="size-4 rounded-[3px]"
                  />
                  {c.provider}
                </FilterChip>
              ))}
            </div>
            <CommandList
              aria-label={t("picker.search")}
              onAction={(key) => pick(key === "custom" ? typed : String(key))}
              className="max-h-[min(20rem,45svh)] min-h-0 scroll-pt-8 px-1 pb-1"
              renderEmptyState={() => (
                <div className="flex flex-col items-center gap-2 py-6 text-sm text-muted-foreground">
                  <p>{t("picker.empty")}</p>
                  {filtered && (
                    <Button variant="outline" size="sm" onPress={clearFilters}>
                      {t("picker.clear")}
                    </Button>
                  )}
                </div>
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
              {pinned && (
                <CommandGroup heading={t("picker.current")} className={group}>
                  {option(pinned)}
                </CommandGroup>
              )}
              {groups.map((g) => (
                <CommandGroup
                  key={g.key}
                  heading={g.provider}
                  className={group}
                >
                  {g.models.map(option)}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </div>
      </Popover>
    </PopoverTrigger>
  )
}
