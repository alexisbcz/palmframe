import { createHash } from "node:crypto"

// Same arrangement as the book translator's fonts: pinned, hashed, fetched from
// jsDelivr once per function instance, and kept out of the bundle. OFL licensed.
const BASE = "https://cdn.jsdelivr.net/npm/@expo-google-fonts"

const FONTS = {
  "garamond-Regular": [
    "eb-garamond@0.4.1/400Regular/EBGaramond_400Regular.ttf",
    "ba0e6b4fbea9f133d38928d7d7728c07a9dc7c2af20a757a2c5658e1afaf651d",
  ],
  "garamond-Italic": [
    "eb-garamond@0.4.1/400Regular_Italic/EBGaramond_400Regular_Italic.ttf",
    "4e51b6546107f6b5c096b55b44b90dc9f7e6e50e4dc39193f26fefe1ecc596fe",
  ],
  "garamond-Bold": [
    "eb-garamond@0.4.1/700Bold/EBGaramond_700Bold.ttf",
    "392e8b40f7af6ff352adf3c128501bacb286c58bd5e3e0e5adccda5d78583f75",
  ],
  "garamond-BoldItalic": [
    "eb-garamond@0.4.1/700Bold_Italic/EBGaramond_700Bold_Italic.ttf",
    "1256ebada767eeec05702dd1a0c39b1502983353d807dc3da321ba4b8ff0bd51",
  ],
  "courier-Regular": [
    "courier-prime@0.4.1/400Regular/CourierPrime_400Regular.ttf",
    "b4da920fa50d874bce2cab0517e4732384a6eef8fe7e1e653d2befcb8aac1aa6",
  ],
  "courier-Italic": [
    "courier-prime@0.4.1/400Regular_Italic/CourierPrime_400Regular_Italic.ttf",
    "a3d9cde252cabc9102d92e0c54c774563ffc613401b190584012f0d5212daab4",
  ],
  "courier-Bold": [
    "courier-prime@0.4.1/700Bold/CourierPrime_700Bold.ttf",
    "1170ca4279b38da20d390544636462ff1c76d744b15fe5db43568424d5690f8f",
  ],
  "courier-BoldItalic": [
    "courier-prime@0.4.1/700Bold_Italic/CourierPrime_700Bold_Italic.ttf",
    "88c2d60089ef6a8cd60c816a90d2c5b83dc38adc27aa0b19e02682f01c697a29",
  ],
} as const

const cache = new Map<string, Promise<ArrayBuffer>>()

async function fetchFont(key: keyof typeof FONTS) {
  const [path, sha256] = FONTS[key]
  const res = await fetch(`${BASE}/${path}`)
  if (!res.ok) throw new Error(`Font ${key}: ${res.status}`)
  const bytes = await res.arrayBuffer()
  const hash = createHash("sha256").update(Buffer.from(bytes)).digest("hex")
  if (hash !== sha256) throw new Error(`Font ${key} failed its hash check`)
  return bytes
}

export function deskFont(
  family: "garamond" | "courier",
  style: "Regular" | "Italic" | "Bold" | "BoldItalic"
) {
  const key = `${family}-${style}` as keyof typeof FONTS
  let font = cache.get(key)
  if (!font) {
    font = fetchFont(key).catch((e) => {
      cache.delete(key)
      throw e
    })
    cache.set(key, font)
  }
  return font
}
