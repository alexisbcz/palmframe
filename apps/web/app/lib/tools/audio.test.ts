import { expect, test } from "bun:test"

import { baseName, encodeWav } from "./audio"

test("encodes a readable PCM header and clamps samples", async () => {
  const blob = encodeWav([new Float32Array([0, 1, -1, 2])], 48_000)
  const view = new DataView(await blob.arrayBuffer())
  expect(blob.size).toBe(44 + 8)
  expect(view.getUint32(24, true)).toBe(48_000)
  expect(view.getUint16(22, true)).toBe(1)
  expect(view.getInt16(46, true)).toBe(32767)
  expect(view.getInt16(48, true)).toBe(-32768)
  expect(view.getInt16(50, true)).toBe(32767)
})

test("interleaves two channels", async () => {
  const blob = encodeWav(
    [new Float32Array([1, 1]), new Float32Array([-1, -1])],
    44_100
  )
  const view = new DataView(await blob.arrayBuffer())
  expect(view.getUint16(22, true)).toBe(2)
  expect(view.getInt16(44, true)).toBe(32767)
  expect(view.getInt16(46, true)).toBe(-32768)
})

test("baseName drops only the extension", () => {
  expect(baseName("my.take.mp3")).toBe("my.take")
  expect(baseName("take")).toBe("take")
})
