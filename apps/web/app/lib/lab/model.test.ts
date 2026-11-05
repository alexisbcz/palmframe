import { expect, test } from "bun:test"

import {
  LAB_DEFAULTS,
  civitaiBase,
  civitaiTarget,
  exampleQuery,
  fitSize,
  toExample,
  fromCivitai,
  insertMention,
  mentionAt,
  mergeLoras,
  promptParts,
  splitPrompt,
  pairedClip,
  labQuery,
  toRequest,
  workflow,
} from "./model"
import { graphRequest, pngPrompt } from "./png"

test("a link round-trips to the same render", () => {
  const r = toRequest({
    prompt: "a knight",
    lora: ["x.safetensors:0.8", "y.safetensors"],
    seed: "702213660962888",
    w: "832",
    h: "1216",
  })
  const query = new URLSearchParams(labQuery(r))
  const back = toRequest({
    ...Object.fromEntries(query),
    lora: query.getAll("lora"),
  })
  expect(back).toEqual(r)
  expect(r.loras).toEqual([
    { name: "x.safetensors", strength: 0.8 },
    { name: "y.safetensors", strength: 1 },
  ])
  expect(r.seed).toBe(702213660962888)
})

test("values are bounded and sizes snap", () => {
  const r = toRequest({ w: "99999", h: "770", steps: "-3", cfg: "abc" })
  expect(r.width).toBe(2048)
  expect(r.height).toBe(768)
  expect(r.steps).toBe(1)
  expect(r.cfg).toBe(LAB_DEFAULTS.cfg)
})

test("LoRAs chain between the model and the sampler, in order", () => {
  const plain = workflow(toRequest({ prompt: "x" }))
  expect(plain["13"]!.inputs.model).toEqual(["1", 0])
  const styled = workflow(toRequest({ prompt: "x", lora: ["a:0.5", "b", "c"] }))
  expect(styled["20"]!.inputs).toMatchObject({
    model: ["1", 0],
    lora_name: "a",
    strength_model: 0.5,
  })
  expect(styled["21"]!.inputs.model).toEqual(["20", 0])
  expect(styled["22"]!.inputs.model).toEqual(["21", 0])
  expect(styled["13"]!.inputs.model).toEqual(["22", 0])
})

test("a stack drops repeats and stops at the limit, and old links still work", () => {
  const many = toRequest({
    lora: ["a", "a", "b", "c", "d", "e", "f", "g", "h"],
  })
  expect(many.loras.map((l) => l.name)).toEqual(["a", "b", "c", "d", "e", "f"])
  expect(toRequest({ lora: "a.safetensors", strength: "0.7" }).loras).toEqual([
    { name: "a.safetensors", strength: 0.7 },
  ])
  expect(toRequest({ lora: "" }).loras).toEqual([])
})

test("a single-LoRA render from before stacks still reads back", () => {
  const graph = {
    "1": { inputs: { unet_name: "m" } },
    "2": { inputs: { model: ["1", 0], lora_name: "a", strength_model: 0.6 } },
    "7": { inputs: { width: 768, height: 1024 } },
    "13": { inputs: { model: ["2", 0] } },
    "14": { inputs: { seed: 1 } },
  }
  expect(graphRequest(graph)?.loras).toEqual([{ name: "a", strength: 0.6 }])
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
    loras: [{ name: "flar.safetensors", strength: 0.7 }],
  })
  expect(missing).toEqual(["turbo.safetensors"])
})

test("a render's settings read back from its PNG", () => {
  const r = toRequest({ prompt: "knight é", lora: ["a:0.5", "b"], seed: 9 })
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

test("a model takes its own text encoder when one is installed", () => {
  const clips = [LAB_DEFAULTS.clip, "rimix_txt.safetensors"]
  expect(pairedClip("rimix.safetensors", clips)).toBe("rimix_txt.safetensors")
  expect(pairedClip("other.safetensors", clips)).toBe(LAB_DEFAULTS.clip)
  const r = toRequest({ prompt: "x", clip: "rimix_txt.safetensors" })
  expect(workflow(r)["3"]!.inputs.clip_name).toBe("rimix_txt.safetensors")
})

const FILES = ["Smooth.safetensors", "flat.safetensors"]

test("LoRA tags leave the prompt and apply the LoRA", () => {
  const { prompt, tags, unknown } = splitPrompt(
    "a samurai, <lora:smooth:0.7> Smo0th, <lora:gone:1>, fire",
    FILES
  )
  expect(prompt).toBe("a samurai, Smo0th, fire")
  expect(tags).toEqual([{ name: "Smooth.safetensors", strength: 0.7 }])
  expect(unknown).toEqual(["gone"])
  expect(splitPrompt("<lora:flat>", FILES).tags[0]?.strength).toBe(1)
})

test("a tag sets the strength of what's stacked and adds what isn't", () => {
  const a = { name: "a", strength: 1 }
  expect(
    mergeLoras(
      [a],
      [
        { name: "a", strength: 0.5 },
        { name: "b", strength: 1 },
      ]
    )
  ).toEqual([
    { name: "a", strength: 0.5 },
    { name: "b", strength: 1 },
  ])
})

test("mentions are found at the caret, and not inside words", () => {
  expect(mentionAt("a knight @smo", 13)).toEqual({ start: 9, query: "smo" })
  expect(mentionAt("@", 1)).toEqual({ start: 0, query: "" })
  expect(mentionAt("<lora:fl", 8)).toEqual({ start: 0, query: "fl" })
  expect(mentionAt("mail@home", 9)).toBeNull()
  expect(mentionAt("a knight", 8)).toBeNull()
})

test("picking a mention writes the tag and its trigger words once", () => {
  const out = insertMention("a @sm", 2, 5, "Smooth.safetensors", ["Smo0th"])
  expect(out.text).toBe("a <lora:Smooth:1> Smo0th, ")
  expect(out.caret).toBe(out.text.length)
  const again = insertMention("Smo0th @", 7, 8, "Smooth.safetensors", [
    "Smo0th",
  ])
  expect(again.text).toBe("Smo0th <lora:Smooth:1>, ")
})

test("the prompt splits into coloured parts, losing no text", () => {
  const text = "x <lora:smooth:1> Smo0th y <lora:gone> z"
  const parts = promptParts(text, FILES, ["Smooth.safetensors"], {
    "Smooth.safetensors": ["Smo0th"],
  })
  expect(parts.map((p) => p.text).join("")).toBe(text)
  expect(parts.filter((p) => p.lora).map((p) => p.text)).toEqual([
    "<lora:smooth:1>",
    "Smo0th",
  ])
  expect(parts.find((p) => p.unknown)?.text).toBe("<lora:gone>")
})

test("an example's size keeps its shape at about a megapixel", () => {
  expect(fitSize("832x1216")).toEqual([832, 1216])
  expect(fitSize("2304x4080")).toEqual([768, 1360])
  expect(fitSize("nonsense")).toEqual([])
})

test("the gallery follows the model on this Mac", () => {
  expect(civitaiBase("anima-turbo-v1.1.safetensors")).toBe("Anima")
  expect(civitaiBase("flux-2-klein-4b.safetensors")).toBe("Flux.2 Klein 4B")
  expect(civitaiBase("flux-2-klein-9b.safetensors")).toBe("Flux.2 Klein 9B")
})

test("only listed filters and Civitai-shaped cursors reach Civitai", () => {
  const q = exampleQuery(
    new URLSearchParams({
      base: "Klein&nsfw=X",
      sort: "Newest",
      period: "Day",
      cursor: "feed:633:147691806",
    })
  )
  expect(q).toEqual({
    base: "Anima",
    sort: "Newest",
    period: "Day",
    rating: "None",
    cursor: "feed:633:147691806",
  })
  expect(exampleQuery(new URLSearchParams({ rating: "Mature" })).rating).toBe(
    "Mature"
  )
  expect(exampleQuery(new URLSearchParams({ rating: "true" })).rating).toBe(
    "None"
  )
  expect(exampleQuery(new URLSearchParams({ cursor: "a&b=c" })).cursor).toBe(
    null
  )
})

test("examples keep safe, prompted images from Civitai's host", () => {
  const image = {
    id: 1,
    url: "https://image.civitai.com/x/abc/original=true/abc.jpeg",
    width: 800,
    height: 1200,
    nsfwLevel: "None",
    stats: { likeCount: 3, heartCount: 2 },
    meta: {
      prompt: "knight",
      seed: 4,
      steps: 30,
      resources: [{ type: "lora", name: "flar", weight: 0.7 }],
      comfy: JSON.stringify({
        prompt: {
          "2": { inputs: { a: { on: true, lora: "flar", strength: 0.7 } } },
        },
      }),
    },
  }
  const ex = toExample(image)!
  expect(ex.thumb).toBe("https://image.civitai.com/x/abc/width=450/abc.jpeg")
  expect(ex.reactions).toBe(5)
  expect(ex.steps).toBe(30)
  expect(ex.meta.resources).toEqual([
    { type: "lora", name: "flar", weight: 0.7 },
  ])
  expect(ex.meta).not.toHaveProperty("comfy")
  expect(toExample({ ...image, nsfwLevel: "Mature" })).toBeNull()
  expect(toExample({ ...image, nsfwLevel: "Mature" }, "Mature")?.level).toBe(
    "Mature"
  )
  expect(toExample({ ...image, nsfwLevel: "X" }, "Mature")).toBeNull()
  expect(toExample({ ...image, nsfwLevel: "X" }, "X")).not.toBeNull()
  expect(toExample(image, "Only")).toBeNull()
  expect(toExample({ ...image, nsfwLevel: "Soft" }, "Only")).not.toBeNull()
  expect(toExample({ ...image, nsfwLevel: "Blocked" }, "X")).toBeNull()
  expect(toExample({ ...image, meta: { seed: 1 } })).toBeNull()
  expect(toExample({ ...image, url: "https://evil.example/a.jpeg" })).toBeNull()
})
