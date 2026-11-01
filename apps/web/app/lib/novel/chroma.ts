// Lifts a character off a flat key colour, which is how sprites are drawn when
// a model can't give transparency. Works from the outside in, so green on the
// character's own clothes survives unless it touches the background.

const distance = (d: Uint8ClampedArray, i: number, k: number[]) => {
  const r = d[i]! - k[0]!
  const g = d[i + 1]! - k[1]!
  const b = d[i + 2]! - k[2]!
  return Math.sqrt(r * r + g * g + b * b)
}

export function cornerColor(data: Uint8ClampedArray, w: number, h: number) {
  const at = (x: number, y: number) => (y * w + x) * 4
  const corners = [at(2, 2), at(w - 3, 2), at(2, h - 3), at(w - 3, h - 3)]
  return [0, 1, 2].map((c) =>
    Math.round(corners.reduce((sum, i) => sum + data[i + c]!, 0) / 4)
  )
}

export function keyPixels(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  tolerance = 70
) {
  const key = cornerColor(data, w, h)
  const seen = new Uint8Array(w * h)
  const stack: number[] = []
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const p = y * w + x
    if (seen[p]) return
    if (distance(data, p * 4, key) > tolerance) return
    seen[p] = 1
    stack.push(p)
  }
  for (let x = 0; x < w; x++) {
    push(x, 0)
    push(x, h - 1)
  }
  for (let y = 0; y < h; y++) {
    push(0, y)
    push(w - 1, y)
  }
  while (stack.length) {
    const p = stack.pop()!
    data[p * 4 + 3] = 0
    const x = p % w
    const y = (p - x) / w
    push(x + 1, y)
    push(x - 1, y)
    push(x, y + 1)
    push(x, y - 1)
  }
  // Soften the edge and take the key's colour out of the fringe.
  const dominant = key.indexOf(Math.max(...key))
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x
      if (seen[p]) continue
      const touching = seen[p - 1]! + seen[p + 1]! + seen[p - w]! + seen[p + w]!
      if (!touching) continue
      const i = p * 4
      data[i + 3] = Math.round(data[i + 3]! * (1 - touching * 0.18))
      const others = [0, 1, 2].filter((c) => c !== dominant)
      const cap = Math.max(data[i + others[0]!]!, data[i + others[1]!]!)
      if (data[i + dominant]! > cap) data[i + dominant] = cap
    }
  return data
}

// Crops transparent margins, feet staying at the bottom edge.
export function opaqueBounds(data: Uint8ClampedArray, w: number, h: number) {
  let left = w
  let right = 0
  let top = h
  let bottom = 0
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (data[(y * w + x) * 4 + 3]! > 16) {
        left = Math.min(left, x)
        right = Math.max(right, x)
        top = Math.min(top, y)
        bottom = Math.max(bottom, y)
      }
  return right < left ? null : { left, top, right, bottom }
}
