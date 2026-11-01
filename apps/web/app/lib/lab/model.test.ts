import { expect, test } from "bun:test"

import {
  LAB_DEFAULTS,
  civitaiTarget,
  fromCivitai,
  labQuery,
  toRequest,
  workflow,
} from "./model"
import { graphRequest, pngPrompt } from "./png"

test("a link round-trips to the same render", () => {
  const r = toRequest({
    prompt: "a knight",
    lora: "x.safetensors",
    strength: "0.8",
    seed: "702213660962888",
    w: "832",
    h: "1216",
  })
  const back = toRequest(Object.fromEntries(new URLSearchParams(labQuery(r))))
  expect(back).toEqual(r)
  expect(r.seed).toBe(702213660962888)
})

test("values are bounded and sizes snap", () => {
  const r = toRequest({ w: "99999", h: "770", steps: "-3", cfg: "abc" })
  expect(r.width).toBe(2048)
  expect(r.height).toBe(768)
  expect(r.steps).toBe(1)
  expect(r.cfg).toBe(LAB_DEFAULTS.cfg)
})

test("the LoRA sits between the model and the sampler, only when set", () => {
  const plain = workflow(toRequest({ prompt: "x" }))
  expect(plain["2"]).toBeUndefined()
  expect(plain["13"]!.inputs.model).toEqual(["1", 0])
  const styled = workflow(toRequest({ prompt: "x", lora: "a.safetensors" }))
  expect(styled["2"]!.inputs.lora_name).toBe("a.safetensors")
  expect(styled["13"]!.inputs.model).toEqual(["2", 0])
})

test("only Civitai links are read, and only their ids", () => {
  expect(civitaiTarget("https://civitai.red/images/132149040")).toEqual({
    kind: "image",
    id: "132149040",
  })
  expect(
    civitaiTarget(
      "https://civitai.red/models/1952560/anime-flat-style?modelVersionId=2985705"
    )
  ).toEqual({ kind: "version", id: "2985705" })
  expect(civitaiTarget("https://evil.example/images/1")).toBeNull()
  expect(civitaiTarget("http://169.254.169.254/images/1")).toBeNull()
  expect(civitaiTarget("not a link")).toBeNull()
})

test("Civitai settings fill in, keeping this machine's sampler", () => {
  const { values, missing } = fromCivitai(
    {
      prompt: "knight",
      seed: 5,
      Size: "768x1024",
      comfy: JSON.stringify({
        prompt: {
          "2": {
            inputs: {
              lora_1: { on: true, lora: "turbo.safetensors", strength: 1 },
              lora_2: { on: true, lora: "Flar.safetensors", strength: 0.7 },
              lora_3: { on: false, lora: "Off.safetensors", strength: 1 },
            },
          },
        },
      }),
    },
    ["flar.safetensors"]
  )
  expect(values).toEqual({
    prompt: "knight",
    seed: 5,
    width: 768,
    height: 1024,
    lora: "flar.safetensors",
    strength: 0.7,
  })
  expect(missing).toEqual(["turbo.safetensors"])
})

test("a render's settings read back from its PNG", () => {
  const r = toRequest({ prompt: "knight é", lora: "a.safetensors", seed: 9 })
  const text = new TextEncoder().encode(JSON.stringify(workflow(r)))
  const key = new TextEncoder().encode("prompt\0")
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length)
    new DataView(out.buffer).setUint32(0, data.length)
    out.set(new TextEncoder().encode(type), 4)
    out.set(data, 8)
    return out
  }
  const data = new Uint8Array(key.length + text.length)
  data.set(key)
  data.set(text, key.length)
  const parts = [
    new Uint8Array(8),
    chunk("IHDR", new Uint8Array(13)),
    chunk("tEXt", data),
    chunk("IDAT", new Uint8Array(4)),
  ]
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    png.set(p, at)
    at += p.length
  }
  expect(graphRequest(pngPrompt(png))).toEqual(r)
  expect(pngPrompt(png.subarray(0, 40))).toBeNull()
  expect(graphRequest(null)).toBeNull()
})
