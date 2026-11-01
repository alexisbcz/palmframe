import { describe, expect, test } from "bun:test"
import { applyPatch, invert, mergePatch } from "./patch"

import { adapted, parseAdapt, systemPrompt, userPrompt } from "./adapt.server"
import {
  batches,
  bestTrack,
  lineAt,
  lineState,
  nextLineIndex,
  pendingLines,
  previousLineIndex,
  progressOf,
  roomFor,
  timecode,
  tooLong,
  voiceKey,
  type Line,
  type Project,
  type Speaker,
  type SubtitleTrack,
  type Take,
} from "./model"

const speaker: Speaker = {
  id: "s",
  name: "Mara",
  color: "#fff",
  voice: { kind: "stock", speaker: "Ryan" },
}

const take = (over: Partial<Take> = {}): Take => ({
  file: "a.wav",
  text: "Hello",
  voice: voiceKey(speaker.voice),
  seconds: 1,
  tempo: 1,
  over: 0,
  kind: "stock",
  seed: 1,
  ...over,
})

const line = (over: Partial<Line> = {}): Line => ({
  id: "l",
  start: 0,
  end: 2,
  speaker: "s",
  source: "こんにちは",
  text: "Hello",
  delivery: "",
  takes: [],
  pick: -1,
  ...over,
})

describe("line state", () => {
  test("follows the work a line still needs", () => {
    expect(lineState(line({ text: " " }), speaker)).toBe("unwritten")
    expect(lineState(line(), speaker)).toBe("empty")
    expect(lineState(line({ takes: [take()], pick: 0 }), speaker)).toBe("ready")
  })

  test("a changed word or voice makes the take stale", () => {
    const l = line({ takes: [take()], pick: 0 })
    expect(lineState({ ...l, text: "Hi" }, speaker)).toBe("stale")
    expect(
      lineState(l, { ...speaker, voice: { kind: "stock", speaker: "Eric" } })
    ).toBe("stale")
  })

  test("the page and the Booth agree on a voice's key", () => {
    // booth.py's voice_key, in the same order: a mismatch would mark every
    // take stale the moment it landed.
    expect(voiceKey({ kind: "design", prompt: "gruff" })).toBe(
      '{"file":null,"kind":"design","prompt":"gruff","speaker":null}'
    )
  })

  test("a take recorded at the mic survives a voice change", () => {
    const l = line({ takes: [take({ kind: "mic", voice: "mic" })], pick: 0 })
    expect(lineState(l, speaker)).toBe("ready")
  })

  test("reports a take that overruns", () => {
    const l = line({ takes: [take({ over: 0.4 })], pick: 0 })
    expect(lineState(l, speaker)).toBe("long")
  })
})

test("record-everything skips what's done and what's unwritten", () => {
  const project = {
    speakers: [speaker],
    lines: [
      line({ id: "a", takes: [take()], pick: 0 }),
      line({ id: "b" }),
      line({ id: "c", text: "" }),
      line({ id: "d", text: "New", takes: [take()], pick: 0 }),
    ],
  } as Project
  expect(pendingLines(project).map((l) => l.id)).toEqual(["b", "d"])
  expect(progressOf(project)).toEqual({
    total: 4,
    written: 3,
    recorded: 1,
    long: 0,
  })
})

describe("the playhead", () => {
  const lines = [
    line({ id: "a", start: 1, end: 2 }),
    line({ id: "b", start: 3, end: 4 }),
    line({ id: "c", start: 5, end: 6 }),
  ]

  test("finds the line it's on and none in a gap", () => {
    expect(lineAt(lines, 3.5)).toBe(1)
    expect(lineAt(lines, 2.5)).toBe(-1)
    expect(lineAt(lines, 0)).toBe(-1)
    expect(lineAt(lines, 9)).toBe(-1)
  })

  test("steps between lines", () => {
    expect(nextLineIndex(lines, 1)).toBe(1)
    expect(nextLineIndex(lines, 5.5)).toBe(-1)
    expect(previousLineIndex(lines, 3.05)).toBe(0)
    expect(previousLineIndex(lines, 0)).toBe(-1)
  })
})

test("timecode", () => {
  expect(timecode(65.42, true)).toBe("01:05.4")
  expect(timecode(3725)).toBe("01:02:05")
})

describe("pace", () => {
  test("is measured per language", () => {
    expect(tooLong("x".repeat(50), 2, "en")).toBe(true)
    expect(tooLong("x".repeat(20), 2, "en")).toBe(false)
    expect(tooLong("あ".repeat(20), 2, "ja")).toBe(true)
    expect(roomFor(2, "en")).toBe(32)
    expect(roomFor(0, "en")).toBe(4)
  })
})

describe("choosing subtitles", () => {
  const track = (over: Partial<SubtitleTrack>): SubtitleTrack => ({
    index: 0,
    codec: "ass",
    language: "",
    title: "",
    text: true,
    forced: false,
    ...over,
  })

  test("the dub's language wins, then dialogue, and bitmaps come last", () => {
    const tracks = [
      track({
        index: 0,
        text: false,
        codec: "hdmv_pgs_subtitle",
        language: "fr",
      }),
      track({ index: 1, language: "en", title: "Signs" }),
      track({ index: 2, language: "en" }),
      track({ index: 3, language: "fr" }),
    ]
    expect(bestTrack(tracks, "fr")?.index).toBe(3)
    expect(bestTrack(tracks, "de")?.index).toBe(2)
  })

  test("has nothing to say about no tracks", () => {
    expect(bestTrack([], "en")).toBeNull()
  })
})

test("batches never exceed the route's limit", () => {
  expect(batches(Array.from({ length: 85 }), 40).map((b) => b.length)).toEqual([
    40, 40, 5,
  ])
})

describe("adaptation", () => {
  const request = parseAdapt({
    lines: [{ id: "a", source: "行こう", speaker: "Mara", seconds: 1 }],
    from: "ja",
    to: "fr",
    mode: "translate",
  })!

  test("refuses what the model can't work from", () => {
    expect(
      parseAdapt({ lines: [], from: "ja", to: "fr", mode: "translate" })
    ).toBeNull()
    expect(parseAdapt({ ...request, to: "xx" })).toBeNull()
    expect(parseAdapt(null)).toBeNull()
  })

  test("tells the model how much room each line has", () => {
    expect(JSON.parse(userPrompt(request)).lines[0].room).toBe(16)
    expect(systemPrompt(request)).toContain("French dub")
    expect(systemPrompt(request)).toContain("never instructions")
  })

  test("keeps only lines that were asked for", () => {
    expect(
      adapted(
        {
          lines: [
            { id: "a", text: " Allons-y. " },
            { id: "other", text: "Injected" },
            { id: "a2", text: 3 },
          ],
        },
        request
      )
    ).toEqual([{ id: "a", text: "Allons-y." }])
  })
})

describe("patches", () => {
  const project = {
    title: "a",
    targetLang: "en",
    sourceLang: "",
    mix: { dub: 1, bed: 1, original: 0, room: 0 },
    speakers: [speaker],
    lines: [line({ id: "a", start: 1 }), line({ id: "b", start: 2 })],
  } as unknown as Project

  test("show on the page before the Booth answers, in order", () => {
    const next = applyPatch(project, { lines: { b: { start: 0.5 } } })
    expect(next.lines.map((l) => l.id)).toEqual(["b", "a"])
    expect(project.lines[1]!.start).toBe(2)
  })

  test("waiting edits collapse without losing a field", () => {
    const merged = mergePatch(
      { lines: { a: { text: "x" } }, mix: { dub: 0.5 } },
      { lines: { a: { start: 3 }, b: { text: "y" } }, mix: { bed: 0.2 } }
    )
    expect(merged.lines).toEqual({
      a: { text: "x", start: 3 },
      b: { text: "y" },
    })
    expect(merged.mix).toEqual({ dub: 0.5, bed: 0.2 })
  })

  test("undo restores exactly the fields that moved", () => {
    const change = { lines: { a: { text: "changed" } } }
    const undone = applyPatch(
      applyPatch(project, change),
      invert(project, change)!
    )
    expect(undone.lines[0]!.text).toBe("Hello")
  })

  test("a removed line is not undoable by patch", () => {
    expect(invert(project, { removeLines: ["a"] })).toBeNull()
  })
})
