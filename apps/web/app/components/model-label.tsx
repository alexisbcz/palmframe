import { cn } from "cn"

import { IMAGE_MODELS } from "@/lib/image-models"

import { PROVIDER_LOGOS, type ProviderId } from "./provider-logos"

// OpenRouter ids start with their provider: "openai/gpt-image-2".
const PREFIXES: Record<string, ProviderId> = {
  openai: "openai",
  google: "google",
  "black-forest-labs": "bfl",
  bytedance: "bytedance",
  "bytedance-seed": "bytedance",
  alibaba: "alibaba",
  qwen: "qwen",
  "x-ai": "xai",
  stabilityai: "stability",
  recraft: "recraft",
  ideogram: "ideogram",
}

const isPruna = (model: string) =>
  model === IMAGE_MODELS.pruna || model === IMAGE_MODELS.prunaEdit

export function providerOf(model: string): ProviderId | null {
  if (model === IMAGE_MODELS.klein) return "bfl"
  return PREFIXES[model.split("/")[0] ?? ""] ?? null
}

// A model's name with its provider's logo, when the provider has one.
export function ModelLabel({
  model,
  className,
}: {
  model: string
  className?: string
}) {
  const provider = providerOf(model)
  const logo = provider && PROVIDER_LOGOS[provider]
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      {isPruna(model) && (
        <img
          src="/providers/pruna.png"
          alt=""
          className="size-3.5 shrink-0 object-contain"
        />
      )}
      {logo && (
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          fillRule="evenodd"
          aria-hidden
          className="size-3.5 shrink-0"
        >
          {logo.paths.map((d) => (
            <path key={d} d={d} />
          ))}
        </svg>
      )}
      <span className="min-w-0 truncate">{model}</span>
    </span>
  )
}
