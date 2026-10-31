import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto"

// Credentials people give us to keep: OpenRouter keys and Discord webhooks.
// AES-256-GCM under OPENROUTER_KEY_SECRET; the stored value is iv + data + tag.
function secret() {
  const s = process.env.OPENROUTER_KEY_SECRET?.trim()
  if (!s) throw new Error("OPENROUTER_KEY_SECRET must be set.")
  return createHash("sha256").update(s).digest()
}

export const secretsAvailable = () =>
  !!process.env.OPENROUTER_KEY_SECRET?.trim() &&
  !!process.env.SUPABASE_SECRET_KEY?.trim()

export function sealSecret(value: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", secret(), iv)
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  return Buffer.concat([iv, data, cipher.getAuthTag()]).toString("base64")
}

export function openSecret(stored: string) {
  const raw = Buffer.from(stored, "base64")
  const decipher = createDecipheriv(
    "aes-256-gcm",
    secret(),
    raw.subarray(0, 12)
  )
  decipher.setAuthTag(raw.subarray(-16))
  return Buffer.concat([
    decipher.update(raw.subarray(12, -16)),
    decipher.final(),
  ]).toString("utf8")
}
