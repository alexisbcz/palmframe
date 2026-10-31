import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

// Noto, because books go to languages nobody can list in advance. A full CJK
// face is 8 to 15 MB, too much to carry in a function or in the repo, so fonts
// come from a pinned jsDelivr path, checked against these hashes, and are kept
// in memory for as long as a function lives. All are SIL OFL licensed.
export type FontKey =
  | "latin"
  | "latinBold"
  | "latinItalic"
  | "jp"
  | "kr"
  | "sc"
  | "tc"
  | "arabic"
  | "hebrew"
  | "devanagari"
  | "thai"

const BASE = "https://cdn.jsdelivr.net/npm/@expo-google-fonts"

const FONTS: Record<FontKey, { path: string; file: string; sha256: string }> = {
  latin: {
    path: "noto-serif@0.4.2/400Regular",
    file: "NotoSerif_400Regular.ttf",
    sha256: "a7e8ea1ab7e7d368b001c892d6148325fffc849a46e030e55e1bdc597bbe939d",
  },
  latinItalic: {
    path: "noto-serif@0.4.2/400Regular_Italic",
    file: "NotoSerif_400Regular_Italic.ttf",
    sha256: "15d5f8050fc1f142545e7a26a50bd07a0434eca535d4d98aad9d5e8f03741e43",
  },
  latinBold: {
    path: "noto-serif@0.4.2/700Bold",
    file: "NotoSerif_700Bold.ttf",
    sha256: "1b941681106aae26ead3a24c6f15b51f994b1b26adce8742a37ce96648f0fe0a",
  },
  jp: {
    path: "noto-serif-jp@0.4.4/400Regular",
    file: "NotoSerifJP_400Regular.ttf",
    sha256: "92e9887a892942b992ee77ad60c1e747e0116575c2720492e4f2ea4dff9146e2",
  },
  kr: {
    path: "noto-serif-kr@0.4.4/400Regular",
    file: "NotoSerifKR_400Regular.ttf",
    sha256: "7faaee1ddc31789b1a688cb514d038febecb2f6ebeda6f6137ed77bbb8b36eb0",
  },
  sc: {
    path: "noto-serif-sc@0.4.4/400Regular",
    file: "NotoSerifSC_400Regular.ttf",
    sha256: "c358a69de3df5f423a8946a7b03e3126fb6ba116f1130a463455b4e39e1f0742",
  },
  tc: {
    path: "noto-serif-tc@0.4.5/400Regular",
    file: "NotoSerifTC_400Regular.ttf",
    sha256: "b0acf9799d5dc656cdeff077d36b2ee9032b762e05b3f8a7b76c81dee4eec08c",
  },
  arabic: {
    path: "noto-naskh-arabic@0.4.5/400Regular",
    file: "NotoNaskhArabic_400Regular.ttf",
    sha256: "706b4580c025f6c75ec1c06013e17f00a23ec1780091b77a5a5b339469bda94d",
  },
  hebrew: {
    path: "noto-serif-hebrew@0.4.2/400Regular",
    file: "NotoSerifHebrew_400Regular.ttf",
    sha256: "5e72a179024ad0463437b73b948f6d282da7d5b301a66e7f31efa05220c3fe02",
  },
  devanagari: {
    path: "noto-serif-devanagari@0.4.1/400Regular",
    file: "NotoSerifDevanagari_400Regular.ttf",
    sha256: "fa9dc09cbb0384c6d6e2f93e5493e3bfa58bfab78e56a05858c43f29b110a1fa",
  },
  thai: {
    path: "noto-serif-thai@0.4.2/400Regular",
    file: "NotoSerifThai_400Regular.ttf",
    sha256: "a0295a49012458c637c4986a7e9ac48022884b3eb652b63dd2ca039ed2449e8f",
  },
}

const cache = new Map<FontKey, Promise<Buffer>>()

async function fetchFont(key: FontKey) {
  const font = FONTS[key]
  // For tests and offline work: a folder with the same file names.
  const local = process.env.BOOK_FONTS_DIR
  const bytes = local
    ? await readFile(join(local, font.file))
    : await (async () => {
        const res = await fetch(`${BASE}/${font.path}/${font.file}`, {
          signal: AbortSignal.timeout(60_000),
        })
        if (!res.ok) throw new Error(`Font ${key}: HTTP ${res.status}`)
        return Buffer.from(await res.arrayBuffer())
      })()
  if (createHash("sha256").update(bytes).digest("hex") !== font.sha256)
    throw new Error(`Font ${key} doesn't match its pinned hash.`)
  return bytes
}

export function loadFont(key: FontKey) {
  let font = cache.get(key)
  if (!font) {
    font = fetchFont(key)
    font.catch(() => cache.delete(key))
    cache.set(key, font)
  }
  return font
}
