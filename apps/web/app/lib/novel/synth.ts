import type { MusicMode, Recipe } from "./model"

// Music and sound with no model and no file: a recipe is a few numbers, and the
// browser renders it offline into a buffer. Seeded, so a recipe always sounds
// the same, in the editor and for every reader.

type Ctx = OfflineAudioContext

const SCALES: Record<MusicMode, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  pentatonic: [0, 3, 5, 7, 10, 12, 15],
}

// Degrees of the scale. Each row is four bars of harmony.
const PROGRESSIONS = [
  [0, 5, 3, 4],
  [0, 3, 5, 4],
  [5, 3, 0, 4],
  [0, 4, 5, 3],
  [0, 2, 5, 4],
  [3, 4, 0, 5],
]

export function random(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

function noiseBuffer(ctx: Ctx, seconds: number, seed: number) {
  const length = Math.max(1, Math.floor(seconds * ctx.sampleRate))
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  const rand = random(seed)
  for (let i = 0; i < length; i++) data[i] = rand() * 2 - 1
  return buffer
}

function impulse(ctx: Ctx, seconds: number, seed: number) {
  const length = Math.floor(seconds * ctx.sampleRate)
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate)
  const rand = random(seed)
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < length; i++)
      data[i] = (rand() * 2 - 1) * (1 - i / length) ** 3
  }
  return buffer
}

function tone(
  ctx: Ctx,
  dest: AudioNode,
  o: {
    type: OscillatorType
    midi: number
    at: number
    dur: number
    vol: number
    attack: number
    release: number
    detune?: number
    pan?: number
  }
) {
  const osc = ctx.createOscillator()
  osc.type = o.type
  osc.frequency.value = freq(o.midi)
  osc.detune.value = o.detune ?? 0
  const gain = ctx.createGain()
  const end = o.at + o.dur
  gain.gain.setValueAtTime(0, o.at)
  gain.gain.linearRampToValueAtTime(o.vol, o.at + o.attack)
  gain.gain.setValueAtTime(o.vol, Math.max(o.at + o.attack, end - o.release))
  gain.gain.linearRampToValueAtTime(0, end)
  osc.connect(gain)
  if (o.pan) {
    const pan = ctx.createStereoPanner()
    pan.pan.value = o.pan
    gain.connect(pan).connect(dest)
  } else gain.connect(dest)
  osc.start(o.at)
  osc.stop(end + 0.02)
}

function burst(
  ctx: Ctx,
  dest: AudioNode,
  noise: AudioBuffer,
  o: {
    at: number
    dur: number
    vol: number
    type: BiquadFilterType
    hz: number
    q?: number
    sweep?: number
  }
) {
  const src = ctx.createBufferSource()
  src.buffer = noise
  src.loop = true
  const filter = ctx.createBiquadFilter()
  filter.type = o.type
  filter.frequency.setValueAtTime(o.hz, o.at)
  if (o.sweep)
    filter.frequency.exponentialRampToValueAtTime(o.sweep, o.at + o.dur)
  filter.Q.value = o.q ?? 1
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(o.vol, o.at)
  gain.gain.exponentialRampToValueAtTime(0.0001, o.at + o.dur)
  src.connect(filter).connect(gain).connect(dest)
  src.start(o.at, (o.at * 7.31) % 1)
  src.stop(o.at + o.dur + 0.02)
}

function scoreLength(r: Extract<Recipe, { type: "score" }>) {
  return (r.bars * 4 * 60) / r.bpm
}

function renderScore(ctx: Ctx, r: Extract<Recipe, { type: "score" }>) {
  const rand = random(r.seed)
  const master = ctx.createGain()
  master.gain.value = 0.8
  const low = ctx.createBiquadFilter()
  low.type = "lowpass"
  low.frequency.value = 1200 + (1 - r.warmth) * 9000
  const compressor = ctx.createDynamicsCompressor()
  low.connect(compressor).connect(master).connect(ctx.destination)
  const dry = ctx.createGain()
  dry.connect(low)
  const wet = ctx.createGain()
  wet.gain.value = r.space * 0.7
  const verb = ctx.createConvolver()
  verb.buffer = impulse(ctx, 1 + r.space * 3, r.seed + 1)
  wet.connect(verb).connect(low)
  const bus = ctx.createGain()
  bus.connect(dry)
  bus.connect(wet)

  if (r.tape > 0) {
    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuffer(ctx, 2, r.seed + 2)
    noise.loop = true
    const hiss = ctx.createBiquadFilter()
    hiss.type = "highpass"
    hiss.frequency.value = 3500
    const g = ctx.createGain()
    g.gain.value = r.tape * 0.012
    noise.connect(hiss).connect(g).connect(master)
    noise.start()
  }

  const scale = SCALES[r.mode]
  const base = 48 + r.root
  const degree = (d: number, oct = 0) => {
    const i = ((d % 7) + 7) % 7
    return base + scale[i]! + 12 * (oct + Math.floor(d / 7))
  }
  const beat = 60 / r.bpm
  const prog = PROGRESSIONS[r.seed % PROGRESSIONS.length]!
  const drift = () => (r.tape ? (rand() - 0.5) * r.tape * 16 : 0)
  const noise = noiseBuffer(ctx, 1, r.seed + 3)
  const pluckPattern = [0, 2, 4, 7, 4, 2, 4, 2].map(
    (d) => d + (rand() > 0.8 ? 1 : 0)
  )
  let lastMelody = 7

  for (let bar = 0; bar < r.bars; bar++) {
    const t = bar * 4 * beat
    const root = prog[bar % prog.length]!
    const chord = [root, root + 2, root + 4, root + 6]
    if (r.pad > 0)
      for (const [i, d] of chord.slice(0, 3).entries())
        for (const detune of [-6, 6])
          tone(ctx, bus, {
            type: "sawtooth",
            midi: degree(d),
            at: t,
            dur: 4 * beat * 1.05,
            vol: r.pad * 0.035,
            attack: beat * 1.2,
            release: beat * 1.2,
            detune: detune + drift(),
            pan: (i - 1) * 0.5,
          })
    if (r.bass > 0) {
      for (const n of [0, 2.5]) {
        tone(ctx, bus, {
          type: "triangle",
          midi: degree(root, -1),
          at: t + n * beat,
          dur: beat * 1.4,
          vol: r.bass * 0.3,
          attack: 0.01,
          release: 0.15,
        })
      }
    }
    if (r.keys > 0) {
      const hits = [0, 1.5, 3]
      for (const [i, n] of hits.entries())
        for (const d of chord)
          tone(ctx, bus, {
            type: "triangle",
            midi: degree(d, 1),
            at: t + n * beat + (i % 2 ? r.swing * beat * 0.16 : 0),
            dur: beat * 1.8,
            vol: r.keys * 0.05 * (i === 0 ? 1 : 0.7),
            attack: 0.006,
            release: beat * 1.2,
            detune: drift(),
          })
    }
    if (r.pluck > 0)
      for (let i = 0; i < 8; i++) {
        const swing = i % 2 ? r.swing * beat * 0.17 : 0
        tone(ctx, bus, {
          type: "square",
          midi: degree(root + pluckPattern[i]!, 1),
          at: t + (i * beat) / 2 + swing,
          dur: beat * 0.5,
          vol: r.pluck * 0.035 * (i % 4 === 0 ? 1 : 0.65),
          attack: 0.004,
          release: beat * 0.42,
          pan: i % 2 ? 0.25 : -0.25,
        })
      }
    if (r.bell > 0)
      for (let n = 0; n < 4; n++) {
        if (rand() > 0.55) continue
        lastMelody += Math.floor(rand() * 5) - 2
        lastMelody = Math.max(4, Math.min(14, lastMelody))
        const midi = degree(lastMelody, 1)
        const at = t + n * beat
        tone(ctx, bus, {
          type: "sine",
          midi,
          at,
          dur: beat * 3,
          vol: r.bell * 0.13,
          attack: 0.004,
          release: beat * 2.8,
        })
        tone(ctx, bus, {
          type: "sine",
          midi: midi + 19,
          at,
          dur: beat,
          vol: r.bell * 0.03,
          attack: 0.002,
          release: beat * 0.9,
        })
      }
    if (r.drums > 0)
      for (let i = 0; i < 16; i++) {
        const at = t + (i * beat) / 4 + (i % 2 ? r.swing * beat * 0.09 : 0)
        if (i % 8 === 0) {
          const osc = ctx.createOscillator()
          const g = ctx.createGain()
          osc.frequency.setValueAtTime(120, at)
          osc.frequency.exponentialRampToValueAtTime(45, at + 0.12)
          g.gain.setValueAtTime(r.drums * 0.5, at)
          g.gain.exponentialRampToValueAtTime(0.001, at + 0.22)
          osc.connect(g).connect(bus)
          osc.start(at)
          osc.stop(at + 0.24)
        }
        if (i % 8 === 4)
          burst(ctx, bus, noise, {
            at,
            dur: 0.16,
            vol: r.drums * 0.22,
            type: "bandpass",
            hz: 1800,
            q: 0.7,
          })
        if (i % 2 === 0 || rand() > 0.7)
          burst(ctx, bus, noise, {
            at,
            dur: 0.04,
            vol: r.drums * 0.07,
            type: "highpass",
            hz: 7000,
          })
      }
  }
}

const NOISE_SECONDS = 12

function renderNoise(ctx: Ctx, r: Extract<Recipe, { type: "noise" }>) {
  const rand = random(r.seed)
  const noise = ctx.createBufferSource()
  noise.buffer = noiseBuffer(ctx, NOISE_SECONDS + 1, r.seed)
  noise.loop = true
  const master = ctx.createGain()
  master.connect(ctx.destination)
  const filter = ctx.createBiquadFilter()
  const sway = (min: number, max: number, count: number) => {
    filter.frequency.setValueAtTime((min + max) / 2, 0)
    for (let i = 1; i <= count; i++)
      filter.frequency.linearRampToValueAtTime(
        i === count ? (min + max) / 2 : min + rand() * (max - min),
        (i / count) * NOISE_SECONDS
      )
  }
  const t = r.tone
  const raw = noiseBuffer(ctx, 1, r.seed + 9)
  switch (r.kind) {
    case "rain":
      filter.type = "highpass"
      filter.frequency.value = 900 + t * 2600
      master.gain.value = 0.28
      for (let i = 0; i < 90; i++)
        burst(ctx, master, raw, {
          at: rand() * NOISE_SECONDS,
          dur: 0.05,
          vol: 0.05 + rand() * 0.12,
          type: "bandpass",
          hz: 1500 + rand() * 3000,
          q: 3,
        })
      break
    case "wind":
      filter.type = "bandpass"
      filter.Q.value = 1.4
      sway(200 + t * 300, 700 + t * 1100, 4 + Math.round(r.drift * 8))
      master.gain.value = 0.55
      break
    case "sea": {
      filter.type = "lowpass"
      filter.frequency.value = 500 + t * 1200
      master.gain.setValueAtTime(0.1, 0)
      const waves = 3
      for (let i = 0; i < waves; i++) {
        const at = (i / waves) * NOISE_SECONDS
        master.gain.linearRampToValueAtTime(
          0.65,
          at + NOISE_SECONDS / waves / 2
        )
        master.gain.linearRampToValueAtTime(0.1, at + NOISE_SECONDS / waves)
      }
      break
    }
    case "fire":
      filter.type = "lowpass"
      filter.frequency.value = 260 + t * 500
      master.gain.value = 0.7
      for (let i = 0; i < 140; i++)
        burst(ctx, ctx.destination, raw, {
          at: rand() * NOISE_SECONDS,
          dur: 0.012 + rand() * 0.03,
          vol: rand() * 0.4,
          type: "highpass",
          hz: 1200 + rand() * 4000,
        })
      break
    case "night": {
      filter.type = "lowpass"
      filter.frequency.value = 350
      master.gain.value = 0.06
      for (let n = 0; n < 34; n++) {
        const at = rand() * (NOISE_SECONDS - 0.5)
        for (let i = 0; i < 4; i++)
          tone(ctx, ctx.destination, {
            type: "sine",
            midi: 100 + t * 8,
            at: at + i * 0.045,
            dur: 0.03,
            vol: 0.022,
            attack: 0.004,
            release: 0.02,
            pan: rand() - 0.5,
          })
      }
      break
    }
    case "city":
      filter.type = "lowpass"
      sway(160 + t * 200, 420 + t * 400, 5)
      master.gain.value = 0.7
      for (let n = 0; n < 2; n++)
        burst(ctx, ctx.destination, raw, {
          at: rand() * NOISE_SECONDS,
          dur: 3,
          vol: 0.05,
          type: "bandpass",
          hz: 300,
          sweep: 900,
          q: 2,
        })
      break
    case "crowd":
      filter.type = "bandpass"
      filter.Q.value = 0.8
      sway(500, 1100 + t * 700, 10)
      master.gain.value = 0.55
      for (let n = 0; n < 60; n++)
        burst(ctx, ctx.destination, raw, {
          at: rand() * NOISE_SECONDS,
          dur: 0.1 + rand() * 0.2,
          vol: 0.04,
          type: "bandpass",
          hz: 600 + rand() * 1500,
          q: 7,
        })
      break
    case "room":
      filter.type = "lowpass"
      filter.frequency.value = 140 + t * 200
      master.gain.value = 0.5
      tone(ctx, ctx.destination, {
        type: "sine",
        midi: 31,
        at: 0,
        dur: NOISE_SECONDS,
        vol: 0.05,
        attack: 0.1,
        release: 0.1,
      })
      break
  }
  noise.connect(filter).connect(master)
  noise.start()
}

function sfxLength(r: Extract<Recipe, { type: "sfx" }>) {
  return (
    {
      thunder: 4,
      bell: 3,
      chime: 2.5,
      phone: 2.4,
      steps: 2,
      heart: 1.8,
      knock: 1.1,
      door: 1.2,
    }[r.kind as "thunder"] ?? 1
  )
}

function renderSfx(ctx: Ctx, r: Extract<Recipe, { type: "sfx" }>) {
  const out = ctx.destination
  const n = noiseBuffer(ctx, 1, r.seed)
  const p = 2 ** ((r.pitch - 0.5) * 2)
  const thump = (at: number, hz: number, vol: number, dur = 0.12) => {
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.frequency.setValueAtTime(hz * p * 1.8, at)
    osc.frequency.exponentialRampToValueAtTime(hz * p, at + dur)
    g.gain.setValueAtTime(vol, at)
    g.gain.exponentialRampToValueAtTime(0.001, at + dur * 1.6)
    osc.connect(g).connect(out)
    osc.start(at)
    osc.stop(at + dur * 1.7)
  }
  const bell = (at: number, midi: number, vol: number, dur: number) => {
    for (const [ratio, v] of [
      [1, 1],
      [2.76, 0.5],
      [5.4, 0.25],
    ] as const) {
      const f = freq(midi) * ratio * p
      const osc = ctx.createOscillator()
      osc.frequency.value = f
      const g = ctx.createGain()
      g.gain.setValueAtTime(vol * v, at)
      g.gain.exponentialRampToValueAtTime(0.0008, at + dur / ratio)
      osc.connect(g).connect(out)
      osc.start(at)
      osc.stop(at + dur)
    }
  }
  switch (r.kind) {
    case "knock":
      for (const at of [0.03, 0.27, 0.51]) {
        thump(at, 170, 0.8, 0.06)
        burst(ctx, out, n, {
          at,
          dur: 0.03,
          vol: 0.3,
          type: "bandpass",
          hz: 1500 * p,
        })
      }
      break
    case "door":
      burst(ctx, out, n, {
        at: 0,
        dur: 0.5,
        vol: 0.05,
        type: "bandpass",
        hz: 900 * p,
        sweep: 1700 * p,
        q: 9,
      })
      thump(0.55, 70, 0.9, 0.2)
      burst(ctx, out, n, {
        at: 0.55,
        dur: 0.12,
        vol: 0.4,
        type: "lowpass",
        hz: 800,
      })
      break
    case "steps":
      for (let i = 0; i < 4; i++) {
        const at = 0.05 + i * 0.46
        thump(at, 90, 0.5, 0.06)
        burst(ctx, out, n, {
          at,
          dur: 0.05,
          vol: 0.14,
          type: "highpass",
          hz: 2400,
        })
      }
      break
    case "heart":
      for (const beat of [0.05, 0.95]) {
        thump(beat, 50, 1, 0.14)
        thump(beat + 0.27, 42, 0.7, 0.14)
      }
      break
    case "thunder":
      burst(ctx, out, n, {
        at: 0,
        dur: 0.25,
        vol: 0.8,
        type: "highpass",
        hz: 1200,
      })
      burst(ctx, out, n, {
        at: 0.08,
        dur: 3.8,
        vol: 1,
        type: "lowpass",
        hz: 260 * p,
        sweep: 40,
      })
      burst(ctx, out, n, {
        at: 1,
        dur: 2.5,
        vol: 0.5,
        type: "lowpass",
        hz: 120,
        sweep: 40,
      })
      break
    case "bell":
      bell(0, 76, 0.4, 3)
      break
    case "glass":
      for (let i = 0; i < 12; i++) {
        const at = i * 0.022 + ((i * 37) % 7) * 0.012
        bell(at, 96 + ((i * 5) % 14), 0.09, 0.5)
      }
      burst(ctx, out, n, {
        at: 0,
        dur: 0.3,
        vol: 0.5,
        type: "highpass",
        hz: 3500,
      })
      break
    case "phone":
      for (const at of [0, 0.32, 1.3, 1.62])
        for (let i = 0; i < 6; i++)
          tone(ctx, out, {
            type: "square",
            midi: 84 + (i % 2) * 4,
            at: at + i * 0.04,
            dur: 0.04,
            vol: 0.09,
            attack: 0.002,
            release: 0.005,
          })
      break
    case "page":
      burst(ctx, out, n, {
        at: 0,
        dur: 0.32,
        vol: 0.28,
        type: "bandpass",
        hz: 2000 * p,
        sweep: 6000 * p,
        q: 1.4,
      })
      break
    case "whoosh":
      burst(ctx, out, n, {
        at: 0.02,
        dur: 0.75,
        vol: 0.5,
        type: "bandpass",
        hz: 300 * p,
        sweep: 3400 * p,
        q: 2,
      })
      break
    case "chime":
      for (const [i, m] of [84, 88, 91, 96].entries())
        bell(i * 0.13, m, 0.13, 2)
      break
    case "hit":
      thump(0, 65, 1, 0.22)
      burst(ctx, out, n, {
        at: 0,
        dur: 0.1,
        vol: 0.5,
        type: "lowpass",
        hz: 2400,
      })
      break
  }
}

export function recipeLength(r: Recipe) {
  if (r.type === "score") return scoreLength(r)
  if (r.type === "noise") return NOISE_SECONDS
  return sfxLength(r)
}

const SAMPLE_RATE = 32_000

// Mixes what rings past the end back over the start, so a loop has no seam.
function wrapTail(buffer: AudioBuffer, length: number) {
  const out = new OfflineAudioContext(
    2,
    length,
    buffer.sampleRate
  ).createBuffer(2, length, buffer.sampleRate)
  for (let c = 0; c < 2; c++) {
    const from = buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1))
    const to = out.getChannelData(c)
    to.set(from.subarray(0, length))
    for (let i = length; i < from.length; i++) to[i - length]! += from[i]!
  }
  return out
}

const cache = new Map<string, Promise<AudioBuffer>>()

export function renderRecipe(r: Recipe): Promise<AudioBuffer> {
  const key = JSON.stringify(r)
  let pending = cache.get(key)
  if (!pending) {
    pending = (async () => {
      const seconds = recipeLength(r)
      const tail = r.type === "score" ? 4 : 0
      const ctx = new OfflineAudioContext(
        2,
        Math.ceil((seconds + tail) * SAMPLE_RATE),
        SAMPLE_RATE
      )
      if (r.type === "score") renderScore(ctx, r)
      else if (r.type === "noise") renderNoise(ctx, r)
      else renderSfx(ctx, r)
      const buffer = await ctx.startRendering()
      return r.type === "sfx"
        ? buffer
        : wrapTail(buffer, Math.ceil(seconds * SAMPLE_RATE))
    })()
    pending.catch(() => cache.delete(key))
    cache.set(key, pending)
  }
  return pending
}

// 16-bit WAV, for the Ren'Py export.
export function toWav(buffer: AudioBuffer) {
  const channels = buffer.numberOfChannels
  const frames = buffer.length
  const bytes = 44 + frames * channels * 2
  const view = new DataView(new ArrayBuffer(bytes))
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i))
  }
  text(0, "RIFF")
  view.setUint32(4, bytes - 8, true)
  text(8, "WAVEfmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, buffer.sampleRate, true)
  view.setUint32(28, buffer.sampleRate * channels * 2, true)
  view.setUint16(32, channels * 2, true)
  view.setUint16(34, 16, true)
  text(36, "data")
  view.setUint32(40, frames * channels * 2, true)
  const data = Array.from({ length: channels }, (_, c) =>
    buffer.getChannelData(c)
  )
  let at = 44
  for (let i = 0; i < frames; i++)
    for (let c = 0; c < channels; c++) {
      const s = Math.max(-1, Math.min(1, data[c]![i]!))
      view.setInt16(at, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      at += 2
    }
  return new Uint8Array(view.buffer)
}

// A place to start for each mood; every dial stays adjustable.
export const SCORE_PRESETS = {
  tender: {
    mode: "major",
    bpm: 72,
    pad: 0.6,
    keys: 0.7,
    pluck: 0,
    bass: 0.3,
    drums: 0,
    bell: 0.4,
    warmth: 0.7,
    space: 0.6,
    tape: 0.3,
    swing: 0,
  },
  melancholy: {
    mode: "minor",
    bpm: 62,
    pad: 0.7,
    keys: 0.6,
    pluck: 0,
    bass: 0.2,
    drums: 0,
    bell: 0.3,
    warmth: 0.8,
    space: 0.8,
    tape: 0.5,
    swing: 0,
  },
  everyday: {
    mode: "major",
    bpm: 104,
    pad: 0.2,
    keys: 0.5,
    pluck: 0.5,
    bass: 0.5,
    drums: 0.4,
    bell: 0,
    warmth: 0.5,
    space: 0.3,
    tape: 0.2,
    swing: 0.5,
  },
  mystery: {
    mode: "phrygian",
    bpm: 78,
    pad: 0.7,
    keys: 0,
    pluck: 0.4,
    bass: 0.5,
    drums: 0.15,
    bell: 0.3,
    warmth: 0.6,
    space: 0.8,
    tape: 0.3,
    swing: 0,
  },
  tension: {
    mode: "minor",
    bpm: 122,
    pad: 0.5,
    keys: 0,
    pluck: 0.7,
    bass: 0.8,
    drums: 0.7,
    bell: 0,
    warmth: 0.4,
    space: 0.3,
    tape: 0.1,
    swing: 0,
  },
  dream: {
    mode: "lydian",
    bpm: 66,
    pad: 0.8,
    keys: 0.2,
    pluck: 0,
    bass: 0.1,
    drums: 0,
    bell: 0.7,
    warmth: 0.5,
    space: 1,
    tape: 0.4,
    swing: 0,
  },
  folk: {
    mode: "dorian",
    bpm: 92,
    pad: 0.2,
    keys: 0,
    pluck: 0.8,
    bass: 0.5,
    drums: 0.2,
    bell: 0.2,
    warmth: 0.7,
    space: 0.4,
    tape: 0.5,
    swing: 0.3,
  },
  lofi: {
    mode: "dorian",
    bpm: 80,
    pad: 0.4,
    keys: 0.8,
    pluck: 0,
    bass: 0.6,
    drums: 0.5,
    bell: 0,
    warmth: 0.9,
    space: 0.3,
    tape: 0.9,
    swing: 0.8,
  },
} as const

export type ScorePreset = keyof typeof SCORE_PRESETS
export const SCORE_PRESET_NAMES = Object.keys(SCORE_PRESETS) as ScorePreset[]

export function scoreRecipe(
  preset: ScorePreset,
  seed: number,
  root = 0,
  bars = 16
): Recipe {
  return { type: "score", seed, root, bars, ...SCORE_PRESETS[preset] }
}
