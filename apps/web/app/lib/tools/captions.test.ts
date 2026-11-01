import { expect, test } from "bun:test"

import { toCues, toSrt, toVtt, type Word } from "./captions"

const w = (text: string, start: number, end = start + 0.2): Word => ({
  text,
  start,
  end,
})

test("joins words into one cue", () => {
  expect(toCues([w("hello", 0), w("there", 0.3)])).toEqual([
    { start: 0, end: 0.5, text: "hello there" },
  ])
})

test("splits on a long pause and skips empty words", () => {
  const cues = toCues([w("one", 0), w(" ", 0.2), w("two", 3)])
  expect(cues.map((c) => c.text)).toEqual(["one", "two"])
})

test("keeps lines short", () => {
  const words = Array.from({ length: 30 }, (_, i) => w("wordy", i * 0.1))
  for (const cue of toCues(words))
    expect(cue.text.length).toBeLessThanOrEqual(42)
})

test("splits at a sentence end once the line has some length", () => {
  const cues = toCues([w("this sentence is long enough.", 0), w("Next", 0.3)])
  expect(cues).toHaveLength(2)
})

test("formats SRT and VTT timestamps", () => {
  const cues = [{ start: 3661.5, end: 3662, text: "hi" }]
  expect(toSrt(cues)).toBe("1\n01:01:01,500 --> 01:01:02,000\nhi\n")
  expect(toVtt(cues)).toBe("WEBVTT\n\n01:01:01.500 --> 01:01:02.000\nhi\n")
})
