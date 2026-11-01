import type { Blip, Novel, Track } from "./model"
import { renderRecipe } from "./synth"

// The sound desk behind a running novel: two looping channels that crossfade,
// plus one-shots. It decodes everything to buffers, so a recipe and an uploaded
// file play exactly the same way.

interface Playing {
  id: string
  src: AudioBufferSourceNode
  gain: GainNode
}

export type Bus = "music" | "ambience"

const decoded = new Map<string, Promise<AudioBuffer>>()

export class NovelAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private musicBus: GainNode | null = null
  private sfxBus: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private meter: Uint8Array<ArrayBuffer> | null = null
  private playing: Partial<Record<Bus, Playing>> = {}
  private wanted: Partial<Record<Bus, string | null>> = {}
  private levels = { music: 0.8, sfx: 0.9, blips: 0.5 }

  // Must first run inside a click or a key press: browsers insist.
  unlock() {
    if (typeof window === "undefined") return null
    if (!this.ctx) {
      const ctx = new AudioContext()
      this.master = ctx.createGain()
      this.analyser = ctx.createAnalyser()
      this.analyser.fftSize = 512
      this.meter = new Uint8Array(new ArrayBuffer(this.analyser.fftSize))
      this.master.connect(this.analyser).connect(ctx.destination)
      this.musicBus = ctx.createGain()
      this.sfxBus = ctx.createGain()
      this.musicBus.gain.value = this.levels.music
      this.sfxBus.gain.value = this.levels.sfx
      this.musicBus.connect(this.master)
      this.sfxBus.connect(this.master)
      this.ctx = ctx
    }
    if (this.ctx.state === "suspended") void this.ctx.resume()
    return this.ctx
  }

  setLevels(levels: Partial<typeof this.levels>) {
    Object.assign(this.levels, levels)
    if (this.ctx) {
      const t = this.ctx.currentTime
      this.musicBus?.gain.setTargetAtTime(this.levels.music, t, 0.03)
      this.sfxBus?.gain.setTargetAtTime(this.levels.sfx, t, 0.03)
    }
  }

  private async buffer(track: Track) {
    const ctx = this.unlock()
    if (!ctx) return null
    if (track.recipe) return renderRecipe(track.recipe)
    if (!track.url) return null
    let pending = decoded.get(track.url)
    if (!pending) {
      pending = fetch(track.url)
        .then((r) => r.arrayBuffer())
        .then((b) => ctx.decodeAudioData(b))
      pending.catch(() => decoded.delete(track.url!))
      decoded.set(track.url, pending)
    }
    return pending
  }

  // Renders or fetches ahead of time, so a scene change doesn't wait on it.
  preload(track: Track | undefined) {
    if (track) void this.buffer(track).catch(() => {})
  }

  async set(bus: Bus, track: Track | undefined, volume: number, fade: number) {
    const id = track?.id ?? null
    const now = this.playing[bus]
    if (now?.id === id && id) {
      const ctx = this.ctx!
      now.gain.gain.setTargetAtTime(
        volume,
        ctx.currentTime,
        Math.max(0.02, fade / 4)
      )
      return
    }
    if (!id && !now) return
    this.wanted[bus] = id
    const out = this.playing[bus]
    if (out && this.ctx) {
      const t = this.ctx.currentTime
      out.gain.gain.cancelScheduledValues(t)
      out.gain.gain.setValueAtTime(out.gain.gain.value, t)
      out.gain.gain.linearRampToValueAtTime(0, t + Math.max(0.02, fade))
      out.src.stop(t + Math.max(0.02, fade) + 0.05)
      delete this.playing[bus]
    }
    if (!track) return
    const buffer = await this.buffer(track).catch(() => null)
    // Something else was asked for while this one was loading.
    if (!buffer || this.wanted[bus] !== id || !this.ctx) return
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.loop = track.loop
    const gain = ctx.createGain()
    const t = ctx.currentTime
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(volume, t + Math.max(0.02, fade))
    src.connect(gain).connect(this.musicBus!)
    src.start()
    this.playing[bus] = { id: track.id, src, gain }
  }

  async shot(track: Track | undefined, volume: number) {
    if (!track) return
    const buffer = await this.buffer(track).catch(() => null)
    if (!buffer || !this.ctx) return
    const src = this.ctx.createBufferSource()
    src.buffer = buffer
    const gain = this.ctx.createGain()
    gain.gain.value = volume
    src.connect(gain).connect(this.sfxBus!)
    src.start()
  }

  // The little voice of typed text.
  blip(kind: Blip) {
    const ctx = this.ctx
    if (!ctx || kind === "none" || !this.levels.blips) return
    const hz = { soft: 260, bright: 620, low: 140 }[kind]
    const osc = ctx.createOscillator()
    osc.type = kind === "bright" ? "square" : "triangle"
    osc.frequency.value = hz * (0.94 + Math.random() * 0.12)
    const gain = ctx.createGain()
    const t = ctx.currentTime
    gain.gain.setValueAtTime(0.09 * this.levels.blips, t)
    gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.05)
    osc.connect(gain).connect(this.master!)
    osc.start(t)
    osc.stop(t + 0.06)
  }

  // 0..1, for a VU needle.
  level = () => {
    if (!this.analyser || !this.meter) return 0
    this.analyser.getByteTimeDomainData(this.meter)
    let sum = 0
    for (const v of this.meter) sum += ((v - 128) / 128) ** 2
    return Math.min(1, Math.sqrt(sum / this.meter.length) * 3.2)
  }

  stopAll(fade = 0.3) {
    void this.set("music", undefined, 0, fade)
    void this.set("ambience", undefined, 0, fade)
  }

  dispose() {
    this.stopAll(0)
    void this.ctx?.close().catch(() => {})
    this.ctx = null
    this.playing = {}
  }
}

export const trackOf = (novel: Novel, id: string | null | undefined) =>
  novel.tracks.find((t) => t.id === id)
