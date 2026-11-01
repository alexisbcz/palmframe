import { describe, expect, test } from "bun:test"

import { directedShot, mergeCast } from "./director"
import {
  AUTO_SETUP,
  DEFAULT_SETTINGS,
  cleanLines,
  clipCost,
  estimate,
  fitToModel,
  keyframePrompt,
  outputSize,
  timeline,
  toSrt,
  videoPrompt,
  wrapCaption,
  type VideoModel,
} from "./model"
import { readPoll, toVideoModels, videoBody } from "./provider.server"
import { plan, cleanSettings } from "./service.server"
import type { ShotRow } from "./database"

const model = (over: Partial<VideoModel> = {}): VideoModel => ({
  id: "m",
  name: "M",
  durations: [3, 5, 10],
  resolutions: ["720p"],
  aspects: ["16:9"],
  audio: true,
  skus: { duration_seconds: "0.084", duration_seconds_with_audio: "0.126" },
  ...over,
})

const shot = (over: Partial<ShotRow> = {}) =>
  ({
    id: "s",
    dialogue: [],
    keyframe_status: "none",
    voice_status: "none",
    video_status: "none",
    ...over,
  }) as ShotRow

describe("pricing", () => {
  test("reads Kling's per-second skus, with and without audio", () => {
    expect(clipCost(model(), "720p", 5, true)).toBeCloseTo(0.63)
    expect(clipCost(model(), "720p", 5, false)).toBeCloseTo(0.42)
  })
  test("reads cents per second by resolution", () => {
    const m = model({ skus: { cents_per_video_output_second_720p: "3" } })
    expect(clipCost(m, "720p", 10, false)).toBeCloseTo(0.3)
  })
  test("works out Seedance's tokens", () => {
    const m = model({ skus: { video_tokens: "0.000007" } })
    expect(clipCost(m, "720p", 5, true)).toBeCloseTo(0.756, 2)
  })
  test("an unreadable price is unknown, never free", () => {
    const m = model({ skus: { something_new: "1" } })
    expect(clipCost(m, "720p", 5, true)).toBeNull()
    expect(estimate(m, DEFAULT_SETTINGS, [5, 5])).toEqual({
      usd: 0,
      unknown: 2,
    })
  })
  test("no model counts every clip as unknown", () => {
    expect(estimate(undefined, DEFAULT_SETTINGS, [5])).toEqual({
      usd: 0,
      unknown: 1,
    })
  })
})

describe("fitting a shot to a model", () => {
  test("snaps to a duration the model has", () => {
    expect(fitToModel(model(), DEFAULT_SETTINGS, 7).duration).toBe(5)
    expect(fitToModel(model(), DEFAULT_SETTINGS, 9).duration).toBe(10)
  })
  test("falls back to a resolution the model has", () => {
    const m = model({ resolutions: ["480p"] })
    expect(fitToModel(m, DEFAULT_SETTINGS, 5).resolution).toBe("480p")
  })
  test("no audio when silent or unsupported", () => {
    expect(fitToModel(model({ audio: false }), DEFAULT_SETTINGS, 5).audio).toBe(
      false
    )
    expect(
      fitToModel(model(), { ...DEFAULT_SETTINGS, sound: "silent" }, 5).audio
    ).toBe(false)
  })
})

describe("prompts", () => {
  test("a keyframe is told to drop all lettering and to match anchors", () => {
    const p = keyframePrompt(
      { action: "She turns.", camera: AUTO_SETUP },
      DEFAULT_SETTINGS,
      [{ name: "Mara", description: "red coat", voice: "Kore" }],
      2
    )
    expect(p).toContain("speech balloon")
    expect(p).toContain("next 2 images")
    expect(p).toContain("Mara: red coat")
  })
  test("voiced episodes ask the video model for no speech", () => {
    const p = videoPrompt(
      {
        action: "Rain falls.",
        camera: { ...AUTO_SETUP, movement: "push" },
        dialogue: [{ speaker: "Mara", text: "Go.", delivery: "" }],
      },
      DEFAULT_SETTINGS
    )
    expect(p).toContain("nobody speaks")
    expect(p).toContain("push-in")
    expect(p).not.toContain("Go.")
  })
  test("model sound carries the lines into the prompt", () => {
    const p = videoPrompt(
      {
        action: "",
        camera: AUTO_SETUP,
        dialogue: [{ speaker: "Mara", text: "Go.", delivery: "" }],
      },
      { ...DEFAULT_SETTINGS, sound: "model" }
    )
    expect(p).toContain('Mara: "Go."')
  })
})

describe("timeline", () => {
  const clips = [
    {
      id: "a",
      duration: 4,
      lines: [
        { speaker: "A", text: "1234", delivery: "" },
        { speaker: "Narrator", text: "1234", delivery: "" },
      ],
    },
    { id: "b", duration: 2, lines: [] },
  ]
  test("places shots after the title and shares time by line length", () => {
    const t = timeline(clips, true)
    expect(t.duration).toBe(8.5)
    expect(t.shots[1]).toEqual({ id: "b", start: 6.5, end: 8.5 })
    expect(t.captions[1]!.start).toBeCloseTo(4.5)
  })
  test("writes SRT, with no speaker tag for the narrator", () => {
    const srt = toSrt(timeline(clips, false).captions)
    expect(srt).toContain("00:00:00,000 --> 00:00:02,000\nA: 1234")
    expect(srt).toContain("00:00:02,000 --> 00:00:04,000\n1234")
  })
  test("wraps captions and keeps an overlong word whole", () => {
    expect(wrapCaption("aa bb cc", (l) => l.length <= 5)).toEqual([
      "aa bb",
      "cc",
    ])
    expect(wrapCaption("toolongword x", (l) => l.length <= 5)).toEqual([
      "toolongword",
      "x",
    ])
  })
  test("output sides are even and capped at 1080p", () => {
    expect(outputSize("16:9", "4K")).toEqual({ width: 1920, height: 1080 })
    expect(outputSize("9:16", "720p")).toEqual({ width: 720, height: 1280 })
  })
})

describe("OpenRouter's shapes", () => {
  test("sends the first frame the way the API documents", () => {
    const body = videoBody({
      model: "m",
      prompt: "p",
      firstFrame: "https://x/y.png",
      duration: 5,
      resolution: "720p",
      aspect: "16:9",
      audio: true,
      seed: 1,
    })
    expect(body.frame_images[0]).toEqual({
      type: "image_url",
      image_url: { url: "https://x/y.png" },
      frame_type: "first_frame",
    })
    expect(body.generate_audio).toBe(true)
    expect(body.aspect_ratio).toBe("16:9")
  })
  test("keeps only models that start from an image", () => {
    const list = toVideoModels([
      {
        id: "a",
        supported_frame_images: ["first_frame"],
        generate_audio: true,
      },
      { id: "b", supported_frame_images: null },
      { id: "c", supported_frame_images: ["last_frame"] },
    ])
    expect(list.map((m) => m.id)).toEqual(["a"])
    expect(list[0]!.audio).toBe(true)
  })
  test("reads every status a job can end in", () => {
    expect(readPoll({ status: "in_progress" }).status).toBe("working")
    expect(readPoll({ status: "completed", usage: { cost: 0.5 } })).toEqual({
      status: "done",
      cost: 0.5,
    })
    expect(readPoll({ status: "failed", error: "no" }).status).toBe("failed")
    expect(readPoll({ status: "expired" }).status).toBe("failed")
    expect(readPoll({ status: "cancelled" }).status).toBe("failed")
  })
})

describe("planning work", () => {
  test("shooting a clip also queues what it depends on", () => {
    const p = plan(
      shot({ dialogue: [{ speaker: "A", text: "x", delivery: "" }] }),
      "videos",
      false,
      true
    )
    expect(p.video_status).toBe("queued")
    expect(p.keyframe_status).toBe("queued")
    expect(p.voice_status).toBe("queued")
  })
  test("a batch leaves finished clips alone", () => {
    expect(
      plan(
        shot({ video_status: "ready", keyframe_status: "ready" }),
        "videos",
        false,
        false
      )
    ).toEqual({})
  })
  test("asking for one shot again redoes it but keeps its frame", () => {
    const p = plan(
      shot({ video_status: "ready", keyframe_status: "ready" }),
      "videos",
      true,
      false
    )
    expect(p.video_status).toBe("queued")
    expect(p.keyframe_status).toBeUndefined()
  })
  test("a shot already at the provider is never sent twice", () => {
    for (const video_status of ["queued", "submitting", "rendering"] as const)
      expect(plan(shot({ video_status }), "videos", true, false)).toEqual({})
  })
  test("no voice is queued without lines or when the sound isn't voices", () => {
    expect(plan(shot(), "voices", false, true)).toEqual({})
    const lines = [{ speaker: "A", text: "x", delivery: "" }]
    expect(plan(shot({ dialogue: lines }), "voices", false, false)).toEqual({})
  })
})

describe("cleaning input", () => {
  test("a model's reply becomes a safe shot", () => {
    const d = directedShot({
      index: 0,
      skip: false,
      action: "x",
      duration: 99,
      movement: "nope",
      light: "neon",
      lines: [
        { speaker: "A", text: "  hi ", delivery: "" },
        { speaker: "B", text: " ", delivery: "" },
      ],
    })
    expect(d.duration).toBe(10)
    expect(d.camera.movement).toBe("auto")
    expect(d.camera.light).toBe("neon")
    expect(d.dialogue).toEqual([{ speaker: "A", text: "hi", delivery: "" }])
  })
  test("a panel the model skipped gets a neutral shot", () => {
    expect(directedShot(undefined).duration).toBe(5)
  })
  test("the cast keeps its first description and one voice each", () => {
    const first = mergeCast(
      [],
      [{ name: "Mara", description: "red coat", voice: "Kore" }]
    )
    const next = mergeCast(first, [
      { name: "mara", description: "changed", voice: "Puck" },
      { name: "Tom", description: "old", voice: "Bogus" },
    ])
    expect(next).toHaveLength(2)
    expect(next[0]!.description).toBe("red coat")
    expect(next[1]!.voice).toBe("Puck")
  })
  test("lines drop junk", () => {
    expect(cleanLines("nope")).toEqual([])
    expect(cleanLines([{ text: 4 }, null])).toEqual([])
  })
  test("settings refuse unknown values and odd model ids", () => {
    const s = cleanSettings({
      look: "bad" as never,
      videoModel: "x y<script>",
      subtitles: false,
    })
    expect(s.look).toBe(DEFAULT_SETTINGS.look)
    expect(s.videoModel).toBe(DEFAULT_SETTINGS.videoModel)
    expect(s.subtitles).toBe(false)
  })
})
