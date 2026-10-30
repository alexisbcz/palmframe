import type { PublishAs } from "./instagram.server"

// Instagram's limits as our posting path meets them, checked in the Post
// dialog and on the server. They change: every message names the number.
export const INSTAGRAM_LIMITS = {
  // Zernio, which posts for us, takes 10; Instagram's own API now takes 20.
  slides: 10,
  imageBytes: 8 * 1024 * 1024,
  // Feed images, as width / height: 4:5 to 1.91:1.
  minAspect: 4 / 5,
  maxAspect: 1.91,
  // Stories fill the screen at 9:16.
  storyAspect: 9 / 16,
  caption: 2200,
  hashtags: 30,
  // Instagram's own cap since December 2025; its API still documents 30.
  suggestedHashtags: 5,
  mentions: 20,
}

export type CheckId =
  "slides" | "aspect" | "size" | "caption" | "hashtags" | "mentions"

export interface PublishCheck {
  id: CheckId
  level: "ok" | "warn" | "block"
  // The key of what to say about it, when it isn't ok.
  message: CheckId | "storyAspect" | "suggestedHashtags"
  value: number
  limit: number
  // The heaviest slide, for "size".
  slide?: number
}

export interface PublishFacts {
  as: PublishAs
  slides: number
  width: number
  height: number
  // Each slide's file, as far as they've been rendered.
  bytes: number[]
  caption: string
}

export const countHashtags = (caption: string) =>
  caption.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0

const countMentions = (caption: string) =>
  caption.match(/(?<![\p{L}\p{N}_])@[\p{L}\p{N}_.]+/gu)?.length ?? 0

export function aspectFits(width: number, height: number) {
  const ratio = width / height
  return (
    ratio >= INSTAGRAM_LIMITS.minAspect - 0.001 &&
    ratio <= INSTAGRAM_LIMITS.maxAspect + 0.001
  )
}

const over = (value: number, limit: number) =>
  value > limit ? ("block" as const) : ("ok" as const)

// Stories go out one image at a time, with no caption, so only the files and
// their shape matter there.
export function checkPublish(f: PublishFacts): PublishCheck[] {
  const l = INSTAGRAM_LIMITS
  const checks: PublishCheck[] = []
  if (f.bytes.length) {
    const value = Math.max(...f.bytes)
    checks.push({
      id: "size",
      message: "size",
      level: over(value, l.imageBytes),
      value,
      limit: l.imageBytes,
      slide: f.bytes.indexOf(value) + 1,
    })
  }
  if (f.as === "story") {
    const ratio = f.width / f.height
    if (Math.abs(ratio - l.storyAspect) > 0.01)
      checks.push({
        id: "aspect",
        message: "storyAspect",
        level: "warn",
        value: ratio,
        limit: l.storyAspect,
      })
    return checks
  }
  const hashtags = countHashtags(f.caption)
  const mentions = countMentions(f.caption)
  checks.push(
    {
      id: "slides",
      message: "slides",
      level: over(f.slides, l.slides),
      value: f.slides,
      limit: l.slides,
    },
    {
      id: "aspect",
      message: "aspect",
      level: aspectFits(f.width, f.height) ? "ok" : "warn",
      value: f.width / f.height,
      limit: l.minAspect,
    },
    {
      id: "caption",
      message: "caption",
      level: over(f.caption.length, l.caption),
      value: f.caption.length,
      limit: l.caption,
    },
    hashtags > l.suggestedHashtags && hashtags <= l.hashtags
      ? {
          id: "hashtags",
          message: "suggestedHashtags",
          level: "warn",
          value: hashtags,
          limit: l.suggestedHashtags,
        }
      : {
          id: "hashtags",
          message: "hashtags",
          level: over(hashtags, l.hashtags),
          value: hashtags,
          limit: l.hashtags,
        },
    {
      id: "mentions",
      message: "mentions",
      level: over(mentions, l.mentions),
      value: mentions,
      limit: l.mentions,
    }
  )
  return checks
}
