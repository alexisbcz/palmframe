import { expect, test } from "bun:test"

import {
  LAB_DEFAULTS,
  civitaiTarget,
  fromCivitai,
  labQuery,
  toRequest,
  workflow,
} from "./model"

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
