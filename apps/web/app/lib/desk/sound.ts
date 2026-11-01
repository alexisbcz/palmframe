// A typewriter, synthesised: no samples to load, nothing to license.

let audio: AudioContext | null = null

function noise(ctx: AudioContext, seconds: number) {
  const n = Math.floor(ctx.sampleRate * seconds)
  const buffer = ctx.createBuffer(1, n, ctx.sampleRate)
  const d = buffer.getChannelData(0)
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3
  const src = ctx.createBufferSource()
  src.buffer = buffer
  return src
}

const context = () => {
  audio ??= new AudioContext()
  if (audio.state === "suspended") void audio.resume()
  return audio
}

function burst(
  freq: number,
  q: number,
  gain: number,
  seconds: number,
  delay = 0
) {
  const ctx = context()
  const src = noise(ctx, seconds)
  const f = ctx.createBiquadFilter()
  f.type = "bandpass"
  f.frequency.value = freq
  f.Q.value = q
  const g = ctx.createGain()
  g.gain.value = gain
  src.connect(f).connect(g).connect(ctx.destination)
  src.start(ctx.currentTime + delay)
}

export function strike(key?: string) {
  try {
    const spread = 1 + (Math.random() - 0.5) * 0.3
    if (key === " ") burst(420 * spread, 0.9, 0.09, 0.05)
    else {
      burst(1900 * spread, 1.4, 0.07, 0.022)
      burst(240 * spread, 1, 0.1, 0.04, 0.004)
    }
  } catch {
    // No audio here; the page still fills.
  }
}

export function carriage() {
  try {
    const ctx = context()
    burst(700, 0.8, 0.09, 0.26)
    burst(180, 1, 0.12, 0.09, 0.2)
    const bell = ctx.createOscillator()
    bell.frequency.value = 2640
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.05, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5)
    bell.connect(g).connect(ctx.destination)
    bell.start()
    bell.stop(ctx.currentTime + 0.5)
  } catch {
    // As above.
  }
}

export function thud() {
  try {
    burst(160, 0.8, 0.22, 0.09)
    burst(1200, 1, 0.05, 0.03)
  } catch {
    // As above.
  }
}
