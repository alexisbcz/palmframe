// 16-bit PCM WAV, mono or interleaved from channels of equal length.
export function encodeWav(channels: Float32Array[], sampleRate: number) {
  const frames = channels[0]?.length ?? 0
  const count = channels.length
  const dataSize = frames * count * 2
  const view = new DataView(new ArrayBuffer(44 + dataSize))
  const text = (at: number, value: string) => {
    for (let i = 0; i < value.length; i++)
      view.setUint8(at + i, value.charCodeAt(i))
  }
  text(0, "RIFF")
  view.setUint32(4, 36 + dataSize, true)
  text(8, "WAVE")
  text(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, count, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * count * 2, true)
  view.setUint16(32, count * 2, true)
  view.setUint16(34, 16, true)
  text(36, "data")
  view.setUint32(40, dataSize, true)
  let at = 44
  for (let frame = 0; frame < frames; frame++)
    for (let channel = 0; channel < count; channel++) {
      const sample = Math.max(-1, Math.min(1, channels[channel]![frame]!))
      view.setInt16(at, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      at += 2
    }
  return new Blob([view.buffer], { type: "audio/wav" })
}

export const baseName = (name: string) => name.replace(/\.[^.]+$/, "") || name
