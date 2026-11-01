import { LAB_DEFAULTS, type LabLora, type LabRequest } from "./model"

// ComfyUI writes the graph it ran into each PNG, ahead of the pixels. Reading
// that back means a render's settings live with the file.
export function pngPrompt(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let at = 8
  while (at + 12 <= bytes.length) {
    const length = view.getUint32(at)
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8))
    if (type === "IDAT" || type === "IEND") return null
    const end = at + 8 + length
    if (end > bytes.length) return null
    if (type === "tEXt") {
      const data = bytes.subarray(at + 8, end)
      const split = data.indexOf(0)
      const key = String.fromCharCode(...data.subarray(0, split))
      if (key === "prompt") {
        try {
          return JSON.parse(new TextDecoder().decode(data.subarray(split + 1)))
        } catch {
          return null
        }
      }
    }
    at = end + 4
  }
  return null
}

type Graph = Record<string, { inputs?: Record<string, unknown> } | undefined>

// The inverse of `workflow`. Null for a graph the lab didn't make.
export function graphRequest(graph: Graph | null): LabRequest | null {
  const sampler = graph?.["14"]?.inputs
  const latent = graph?.["7"]?.inputs
  if (!sampler || !latent) return null
  // Walks back up the chain, so older renders with one LoRA read the same way.
  const loras: LabLora[] = []
  let link = graph?.["13"]?.inputs?.model as [string, number] | undefined
  for (let node = graph?.[link?.[0] ?? ""]?.inputs; node?.lora_name;) {
    loras.unshift({
      name: node.lora_name as string,
      strength: (node.strength_model as number) ?? 1,
    })
    link = node.model as [string, number] | undefined
    node = graph?.[link?.[0] ?? ""]?.inputs
  }
  const value = <T>(v: unknown, fallback: T) => (v ?? fallback) as T
  const d = LAB_DEFAULTS
  return {
    prompt: value(graph?.["5"]?.inputs?.text, ""),
    negative: value(graph?.["6"]?.inputs?.text, ""),
    model: value(graph?.["1"]?.inputs?.unet_name, d.model),
    loras,
    seed: value(sampler.seed, 0),
    width: value(latent.width, d.width),
    height: value(latent.height, d.height),
    steps: value(sampler.steps, d.steps),
    cfg: value(sampler.cfg, d.cfg),
    sampler: value(sampler.sampler_name, d.sampler),
  }
}
