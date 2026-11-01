export type Word = { text: string; start: number; end: number }
export type Cue = { start: number; end: number; text: string }

const MAX_CHARS = 42
const MAX_SECONDS = 6
const MAX_GAP = 1

// One cue per line of speech: a new cue on a long pause, at a sentence end once
// the line has some length, or when the line is full.
export function toCues(words: Word[]): Cue[] {
  const cues: Cue[] = []
  for (const word of words) {
    const text = word.text.trim()
    if (!text) continue
    const last = cues.at(-1)
    const line = last ? `${last.text} ${text}` : text
    const split =
      !last ||
      line.length > MAX_CHARS ||
      word.end - last.start > MAX_SECONDS ||
      word.start - last.end > MAX_GAP ||
      (/[.!?…。！？]$/.test(last.text) && last.text.length > 20)
    if (split) cues.push({ start: word.start, end: word.end, text })
    else {
      last.end = word.end
      last.text = line
    }
  }
  return cues
}

function stamp(seconds: number, separator: "," | ".") {
  const ms = Math.round(Math.max(0, seconds) * 1000)
  const pad = (n: number, size = 2) => String(n).padStart(size, "0")
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor(ms / 60_000) % 60
  const s = Math.floor(ms / 1000) % 60
  return `${pad(h)}:${pad(m)}:${pad(s)}${separator}${pad(ms % 1000, 3)}`
}

export const toSrt = (cues: Cue[]) =>
  cues
    .map(
      (c, i) =>
        `${i + 1}\n${stamp(c.start, ",")} --> ${stamp(c.end, ",")}\n${c.text}\n`
    )
    .join("\n")

export const toVtt = (cues: Cue[]) =>
  `WEBVTT\n\n${cues
    .map((c) => `${stamp(c.start, ".")} --> ${stamp(c.end, ".")}\n${c.text}\n`)
    .join("\n")}`
