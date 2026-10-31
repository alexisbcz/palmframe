import { brotliDecompressSync } from "node:zlib"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { describe, expect, test } from "bun:test"

import type { AssetSpec, Story } from "@/lib/media/model"

import { altText } from "./alt"
import wasm from "./data/resvg.gen"
import { formatValue, waterfallSteps } from "./format"
import {
  ASSET_SIZES,
  renderAsset,
  renderToPng,
  renderToSvg,
  validateAsset,
} from "./index"
import { SAMPLES } from "./samples"
import { clean, esc, measure, unsupportedChars, wrap } from "./text"
import type { AssetSize } from "./theme"

const sizes = Object.keys(ASSET_SIZES) as AssetSize[]
const sourceUrl = "https://example.com/report"
const figure = (
  chart: Extract<AssetSpec, { kind: "figure" }>["chart"],
  series: { label: string; value: number; estimate?: boolean }[],
  unit?: string
): AssetSpec => ({ kind: "figure", chart, title: "T", unit, sourceUrl, series })

const pngSize = (png: Uint8Array) => {
  const view = new DataView(png.buffer, png.byteOffset)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

describe("every sample renders in every size", () => {
  for (const [name, spec] of Object.entries(SAMPLES))
    test(name, async () => {
      for (const size of sizes) {
        const svg = await renderToSvg(spec, size)
        expect(svg).toStartWith("<svg")
        expect(svg).not.toContain("NaN")
        expect(svg).not.toContain("undefined")
        expect(svg).not.toContain("Infinity")
        const png = await renderToPng(spec, size)
        expect(pngSize(png)).toEqual({
          width: ASSET_SIZES[size].width,
          height: ASSET_SIZES[size].height,
        })
      }
    })
})

describe("figures", () => {
  test("labels cannot break out of the markup", async () => {
    const svg = await renderToSvg(SAMPLES.xml!, "article")
    expect(svg).not.toContain("<script")
    expect(svg).not.toContain("<b>")
    expect(svg).toContain("&lt;script&gt;")
    expect(svg).toContain("A &amp; B &lt;b&gt;")
    expect(svg).not.toContain("\u0007")
    expect(svg).not.toContain("‮")
  })

  test("an estimate is marked in the drawing and the key", async () => {
    const svg = await renderToSvg(
      figure("bar", [
        { label: "Known", value: 10 },
        { label: "Guess", value: 20, estimate: true },
      ]),
      "article"
    )
    expect(svg).toContain('fill="url(#hatch)"')
    expect(svg).toContain("≈20")
    expect(svg).toContain("Hatched = estimate")
  })

  test("a chart without estimates shows no hatching or key", async () => {
    const svg = await renderToSvg(
      figure("bar", [{ label: "Known", value: 10 }]),
      "article"
    )
    expect(svg).not.toContain('fill="url(#hatch)"')
    expect(svg).not.toContain("estimate")
  })

  test("estimates on a line are dashed, and the key says dashed", async () => {
    const svg = await renderToSvg(
      figure("line", [
        { label: "a", value: 1 },
        { label: "b", value: 2 },
        { label: "c", value: 3, estimate: true },
      ]),
      "article"
    )
    expect(svg).toContain("stroke-dasharray")
    expect(svg).toContain("Dashed = estimate")
  })

  test("a stat estimate says so in words", async () => {
    const svg = await renderToSvg(
      figure("stat", [{ label: "Cost", value: 5, estimate: true }]),
      "carousel"
    )
    expect(svg).toContain("ESTIMATE")
  })

  test("every value of a dense chart reaches the alt text", async () => {
    const spec = SAMPLES.fifty as Extract<AssetSpec, { kind: "figure" }>
    const alt = altText(spec)
    for (const d of spec.series) expect(alt).toContain(`${d.label}: ${d.value}`)
    expect(alt).toContain("(estimate)")
  })

  test("non-finite values are refused, not drawn", async () => {
    await expect(
      renderToSvg(figure("bar", [{ label: "x", value: NaN }]), "article")
    ).rejects.toThrow()
    await expect(renderToSvg(figure("bar", []), "article")).rejects.toThrow()
  })
})

describe("values", () => {
  test("prints the value without rounding it", () => {
    expect(formatValue(123456789.12)).toBe("123,456,789.12")
    expect(formatValue(0.1 + 0.2)).toBe("0.3")
    expect(formatValue(-40, "$M")).toBe("−$40M")
    expect(formatValue(12, "%")).toBe("12%")
    expect(formatValue(5, "GW")).toBe("5 GW")
    expect(formatValue(5, "EUR")).toBe("EUR 5")
    expect(formatValue(5, "$", true)).toBe("≈$5")
    expect(formatValue(1e21)).toBe("1e+21")
  })

  test("a waterfall computes its total", () => {
    const steps = waterfallSteps([
      { label: "a", value: 20 },
      { label: "b", value: -5 },
    ])
    expect(steps.at(-1)).toMatchObject({
      label: "Total",
      value: 15,
      total: true,
    })
    expect(steps[1]).toMatchObject({ from: 20, to: 15 })
  })

  test("a waterfall that already ends in its total keeps that label", () => {
    const steps = waterfallSteps([
      { label: "a", value: 20 },
      { label: "b", value: -5 },
      { label: "Profit", value: 15 },
    ])
    expect(steps).toHaveLength(3)
    expect(steps.at(-1)).toMatchObject({ label: "Profit", from: 0, to: 15 })
  })

  test("a total built on an estimate is an estimate", () => {
    const steps = waterfallSteps([
      { label: "a", value: 20 },
      { label: "b", value: -5, estimate: true },
    ])
    expect(steps.at(-1)!.estimate).toBe(true)
  })
})

describe("text", () => {
  test("strips what XML and bidi abuse rely on", () => {
    expect(clean("a\u0000b‮c\n d")).toBe("a b c d".replace("b c", "bc"))
    expect(clean("\uD800x")).toBe("�x")
    expect(esc(`<&>"'`)).toBe("&lt;&amp;&gt;&quot;&#39;")
  })

  test("wrapping stays inside its box and within its lines", () => {
    const long = "word ".repeat(80) + "x".repeat(200)
    const lines = wrap(long, "text", 20, 300, 3)
    expect(lines.length).toBeLessThanOrEqual(3)
    for (const line of lines)
      expect(measure(line, "text", 20)).toBeLessThanOrEqual(300)
    expect(lines.at(-1)).toEndWith("…")
  })

  test("Japanese breaks between characters", () => {
    const lines = wrap("日本の半導体投資は過去最高に", "text", 20, 100, 3)
    expect(lines.length).toBeGreaterThan(1)
  })

  test("reports what no font can draw", () => {
    expect(unsupportedChars("Hello 日本 مرحبا שלום Привет")).toEqual([])
    expect(unsupportedChars("ok 🚀")).toEqual(["🚀"])
  })
})

describe("rasterizing", () => {
  test("Japanese draws real glyphs, not repeated notdef boxes", async () => {
    const stat = (label: string) => figure("stat", [{ label, value: 1 }])
    const one = await renderToPng(stat("日本語文字"), "article")
    const other = await renderToPng(stat("東京大阪市"), "article")
    expect(Buffer.from(one).equals(Buffer.from(other))).toBe(false)
  })

  test("Arabic and Hebrew draw real glyphs too", async () => {
    const stat = (label: string) => figure("stat", [{ label, value: 1 }])
    for (const [a, b] of [
      ["النفط", "الغاز"],
      ["דירות", "מחירי"],
    ]) {
      const one = await renderToPng(stat(a!), "article")
      const other = await renderToPng(stat(b!), "article")
      expect(Buffer.from(one).equals(Buffer.from(other))).toBe(false)
    }
  })

  test("the embedded wasm is the installed resvg version", () => {
    const installed = readFileSync(
      createRequire(import.meta.url).resolve("@resvg/resvg-wasm/index_bg.wasm")
    )
    const embedded = brotliDecompressSync(Buffer.from(wasm, "base64"))
    expect(embedded.equals(installed)).toBe(true)
  })
})

describe("maps", () => {
  test("every place appears, on the map or in the key", async () => {
    const svg = await renderToSvg(SAMPLES.mapDense!, "article")
    const spec = SAMPLES.mapDense as Extract<AssetSpec, { kind: "map" }>
    for (const p of spec.places) expect(svg).toContain(p.name)
  })

  test("places far apart in longitude stay on the canvas", async () => {
    const svg = await renderToSvg(SAMPLES.mapPacific!, "article")
    const circles = [...svg.matchAll(/<circle cx="([-\d.]+)" cy="([-\d.]+)"/g)]
    expect(circles.length).toBeGreaterThan(0)
    for (const m of circles) {
      expect(Number(m[1])).toBeGreaterThan(0)
      expect(Number(m[1])).toBeLessThan(1200)
    }
  })

  test("one place and the poles still fit", async () => {
    for (const lat of [90, -90, 0])
      await renderToSvg(
        {
          kind: "map",
          title: "T",
          sourceUrl,
          places: [{ name: "P", lat, lng: 180 }],
        },
        "video"
      )
  })

  test("impossible coordinates are refused", async () => {
    await expect(
      renderToSvg(
        {
          kind: "map",
          title: "T",
          sourceUrl,
          places: [{ name: "P", lat: 91, lng: 0 }],
        },
        "article"
      )
    ).rejects.toThrow()
  })

  test("alt text names the places and their values", () => {
    const alt = altText(SAMPLES.mapEurope!)
    expect(alt).toContain("Dresden ($11bn)")
    expect(alt).toContain("Catania")
  })
})

const story: Story = {
  id: "s",
  lead: "https://example.com",
  title: "Chips come to Dresden",
  dek: "A plant in Saxony",
  article: {
    title: "Chips come to Dresden",
    dek: "A plant in Saxony",
    body: "The plant in Dresden opens beside the Elbe. Grenoble and Nice follow.",
  },
  facts: [
    {
      claim: "TSMC will spend $11bn on the Dresden plant",
      url: sourceUrl,
      quote: "an investment of 11 billion dollars by TSMC",
    },
    {
      claim: "Infineon employs 3,500 people in Dresden",
      url: "https://other.example/jobs",
      quote: "about 3,500 staff at Infineon",
    },
    {
      claim: "Margin rose to 45% at STMicro",
      url: sourceUrl,
      quote: "45 percent",
    },
  ],
  sources: [
    {
      url: sourceUrl,
      title: "Report",
      text: `${"Filler text. ".repeat(40)}Bosch said it had invested 1.2 million euros last year. ${"Filler text. ".repeat(40)}The unrelated number 777 is here alone.`,
    },
  ],
}

const bar = (
  label: string,
  value: number,
  unit?: string,
  estimate?: boolean
): AssetSpec =>
  ({
    ...(figure("bar", [{ label, value, estimate }], unit) as object),
    title: "Chips",
  }) as AssetSpec

describe("validateAsset", () => {
  test("accepts a value stated in a fact", () => {
    expect(validateAsset(bar("TSMC", 11, "$bn"), story)).toEqual({
      ok: true,
      problems: [],
    })
  })

  test("matches across scales", () => {
    expect(validateAsset(bar("TSMC", 11_000_000_000, "$"), story).ok).toBe(true)
    expect(validateAsset(bar("Bosch", 1.2, "million"), story).ok).toBe(true)
    expect(validateAsset(bar("Bosch", 1_200_000), story).ok).toBe(true)
  })

  test("reads grouped digits and percentages", () => {
    expect(validateAsset(bar("Infineon staff", 3500), story).ok).toBe(true)
    expect(validateAsset(bar("STMicro margin", 45, "%"), story).ok).toBe(true)
  })

  test("refuses a number that is nowhere", () => {
    const check = validateAsset(bar("TSMC", 12, "$bn"), story)
    expect(check.ok).toBe(false)
    expect(check.problems[0]).toContain("TSMC = 12")
  })

  test("refuses a real number attached to the wrong thing", () => {
    expect(validateAsset(bar("Samsung", 11, "$bn"), story).ok).toBe(false)
    expect(validateAsset(bar("Bosch", 777), story).ok).toBe(false)
  })

  test("lets an estimate through", () => {
    expect(validateAsset(bar("Samsung", 99, "$bn", true), story).ok).toBe(true)
  })

  test("a waterfall's own total needs no source", () => {
    const spec = figure("waterfall", [
      { label: "TSMC", value: 11 },
      { label: "Bosch", value: 1.2 },
      { label: "Combined", value: 12.2 },
    ])
    expect(validateAsset(spec, story).ok).toBe(true)
  })

  test("refuses bad numbers, empty charts and foreign sources", () => {
    expect(validateAsset(bar("TSMC", NaN), story).ok).toBe(false)
    expect(validateAsset(figure("bar", []), story).ok).toBe(false)
    const foreign = {
      ...bar("TSMC", 11, "$bn"),
      sourceUrl: "https://evil.example/",
    } as AssetSpec
    expect(validateAsset(foreign, story).problems[0]).toContain("not one of")
  })

  test("refuses a title that states an untraced number", () => {
    const spec = {
      ...bar("TSMC", 11, "$bn"),
      title: "A $99bn bet",
    } as AssetSpec
    expect(validateAsset(spec, story).ok).toBe(false)
  })

  test("refuses characters no font can draw", () => {
    const spec = { ...bar("TSMC", 11, "$bn"), title: "Chips 🚀" } as AssetSpec
    expect(validateAsset(spec, story).problems[0]).toContain("🚀")
  })

  const map = (
    places: Extract<AssetSpec, { kind: "map" }>["places"]
  ): AssetSpec => ({
    kind: "map",
    title: "Plants",
    sourceUrl,
    places,
  })

  test("accepts places the Story names, ignoring case and accents", () => {
    expect(
      validateAsset(
        map([
          { name: "Dresden", lat: 51, lng: 13.7, value: "$11bn" },
          { name: "GRENOBLE", lat: 45.2, lng: 5.7 },
        ]),
        story
      ).ok
    ).toBe(true)
  })

  test("refuses a place the Story doesn't name", () => {
    expect(
      validateAsset(map([{ name: "Lyon", lat: 45.7, lng: 4.8 }]), story).ok
    ).toBe(false)
  })

  test("a place name must be a whole word", () => {
    expect(
      validateAsset(map([{ name: "Niger", lat: 17, lng: 8 }]), story).ok
    ).toBe(false)
    expect(
      validateAsset(map([{ name: "Den", lat: 1, lng: 1 }]), story).ok
    ).toBe(false)
  })

  test("refuses invalid coordinates and a failed geocode", () => {
    expect(
      validateAsset(map([{ name: "Dresden", lat: 95, lng: 13 }]), story).ok
    ).toBe(false)
    expect(
      validateAsset(map([{ name: "Dresden", lat: 50, lng: 200 }]), story).ok
    ).toBe(false)
    expect(
      validateAsset(map([{ name: "Dresden", lat: NaN, lng: 13 }]), story).ok
    ).toBe(false)
    expect(
      validateAsset(map([{ name: "Dresden", lat: 0, lng: 0 }]), story).ok
    ).toBe(false)
  })

  test("refuses an untraced value on a place", () => {
    const spec = map([{ name: "Dresden", lat: 51, lng: 13.7, value: "$40bn" }])
    expect(validateAsset(spec, story).ok).toBe(false)
  })
})

describe("renderAsset", () => {
  const stubbed = () => {
    const calls: { path: string; size: number }[] = []
    return {
      calls,
      upload: async (path: string, png: Uint8Array) => {
        calls.push({ path, size: png.length })
        return `https://cdn.test/${path}`
      },
    }
  }

  test("uploads a PNG and returns dimensions and alt", async () => {
    const { calls, upload } = stubbed()
    const spec = SAMPLES.bar!
    const out = await renderAsset(spec, "carousel", "user1/chart-1", { upload })
    expect(calls[0]!.path).toBe("user1/chart-1-carousel.png")
    expect(out).toMatchObject({
      url: "https://cdn.test/user1/chart-1-carousel.png",
      width: 1080,
      height: 1350,
    })
    expect(out.alt).toContain("Amazon: $125bn")
    expect(out.alt).toContain("Meta: $72bn (estimate)")
  })

  test("refuses a key that could escape the user's folder", async () => {
    const { upload } = stubbed()
    await expect(
      renderAsset(SAMPLES.bar!, "article", "../other/x", { upload })
    ).rejects.toThrow()
    await expect(
      renderAsset(SAMPLES.bar!, "article", "nouser", { upload })
    ).rejects.toThrow()
  })

  test("crops an illustration to the requested format", async () => {
    const { calls, upload } = stubbed()
    const source = await renderToPng(SAMPLES.stat!, "article")
    const dataUrl = `data:image/png;base64,${Buffer.from(source).toString("base64")}`
    let seen = ""
    const out = await renderAsset(
      { kind: "illustration", scene: "A harbour", alt: "A harbour at dusk" },
      "carousel",
      "user1/art",
      {
        upload,
        draw: async (user, key, scene) => {
          seen = `${user}|${key}|${scene}`
          return dataUrl
        },
      }
    )
    expect(seen).toBe("user1|art-source|A harbour")
    expect(out).toMatchObject({
      alt: "A harbour at dusk",
      width: 1080,
      height: 1350,
    })
    expect(calls[0]!.size).toBeGreaterThan(1000)
  })
})
