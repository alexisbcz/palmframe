import type { BookModel, ModelCall, ModelReply, Usage } from "./ai.server"
import { findCandidates } from "./glossary"

// A stand-in for the real model, behind BOOKS_AI_FAKE=1 and in tests. It spends
// nothing and proves nothing about translation quality: it exists so that the
// pipeline around the model can run end to end. "Translating" swaps vowels, so
// the text visibly changes while numbers, tags and agreed terms survive, and
// glossary terms in the request are honoured the way a good model would.
const ACCENTS: Record<string, string> = {
  a: "á",
  e: "é",
  i: "í",
  o: "ó",
  u: "ú",
  A: "Á",
  E: "É",
  I: "Í",
  O: "Ó",
  U: "Ú",
}

const accent = (s: string) => s.replace(/[aeiouAEIOU]/g, (c) => ACCENTS[c]!)

function pseudo(text: string, terms: Map<string, string>) {
  const keep: string[] = []
  const hold = (value: string) => {
    keep.push(value)
    return `\u0001${keep.length - 1}\u0002`
  }
  let out = text
  for (const [source, target] of [...terms].sort(
    (a, b) => b[0].length - a[0].length
  ))
    out = out.replaceAll(source, () => hold(target))
  out = out.replace(/<\/?[gx]\d+\/?>|&(?:amp|lt|gt);/g, hold)
  return accent(out).replace(/\u0001(\d+)\u0002/g, (_, i) => keep[Number(i)]!)
}

const USAGE = (call: ModelCall): Usage => ({
  input: Math.ceil((call.system.length + call.user.length) / 4),
  output: Math.ceil(call.user.length / 4),
  cache_read: 0,
  cache_write: 0,
})

function glossaryOf(context = "") {
  const terms = new Map<string, string>()
  for (const m of context.matchAll(/^- "(.+?)"(?: → "(.*?)"|: keep)$/gm))
    terms.set(m[1]!, m[2] ?? m[1]!)
  return terms
}

function reply(call: ModelCall): unknown {
  switch (call.task) {
    case "translate": {
      const segments = JSON.parse(call.user) as { id: string; text: string }[]
      const terms = glossaryOf(call.context)
      return {
        segments: segments.map((s) => ({
          id: s.id,
          text: pseudo(s.text, terms),
        })),
      }
    }
    case "extract": {
      const found = findCandidates([call.user], 12)
      return {
        terms: found.map((c) => ({
          source: c.source,
          target: c.source,
          kind: c.kind,
          dnt: true,
          note: "",
        })),
        summary: "A placeholder summary from the fake model.",
        tone: "Placeholder tone.",
        characters: found.slice(0, 3).map((c) => ({
          name: c.source,
          notes: "Placeholder notes.",
        })),
      }
    }
    case "summary":
      return { summary: `Summary so far: ${call.user.slice(0, 200)}` }
    case "ocr":
      return {
        blocks: [
          {
            kind: "heading",
            text: "Chapter from a scan",
            level: 1,
            confidence: 0.94,
          },
          {
            kind: "paragraph",
            text: "This paragraph came from a scanned page through the fake model, and nothing read the image.",
            level: null,
            confidence: 0.62,
          },
          {
            kind: "footnote",
            text: "1 A footnote the fake model made up.",
            level: null,
            confidence: 0.88,
          },
        ],
      }
    case "backcheck": {
      const segments = JSON.parse(call.user) as { id: string }[]
      return {
        segments: segments.map((s, i) => ({
          id: s.id,
          score: i === 0 ? 62 : 96,
          problem: i === 0 ? "The fake check flags its first line." : "",
        })),
      }
    }
  }
}

// On the module, because every slice builds its own model.
const batches = new Map<string, { id: string; call: ModelCall }[]>()

export function fakeModel(): BookModel {
  const run = async (call: ModelCall): Promise<ModelReply> => ({
    value: reply(call),
    usage: USAGE(call),
  })
  return {
    json: run,
    batch: {
      async create(calls) {
        const id = `fake_batch_${crypto.randomUUID()}`
        batches.set(id, calls)
        return id
      },
      async results(id) {
        const calls = batches.get(id)
        if (!calls) return []
        return Promise.all(
          calls.map(async ({ id, call }) => ({
            id,
            ok: true,
            ...(await run(call)),
          }))
        )
      },
    },
  }
}
