import { defineMessages, isLocale, translate } from "@/i18n/core"

import { LIMITS, compose, fitSigned } from "./gate"

// Discord is a route to a person. A post lands in a channel with links that open a
// compose window, and somebody decides whether to press send. Everything here is
// plain text work, so it can be tested without a network.
export const DISCORD_HOSTS = ["discord.com", "discordapp.com"] as const

// The whole string, so there's no room for a user, port, query, fragment, encoded
// dot or tab that `new URL` would quietly tidy away.
const WEBHOOK =
  /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/(\d{17,20})\/([\w-]{30,100})\/?$/

export interface Webhook {
  id: string
  url: string
  hint: string
}

export function parseWebhook(raw: string): Webhook | null {
  const match = WEBHOOK.exec(raw.trim())
  if (!match) return null
  const [, host, id, token] = match
  return {
    id: id!,
    url: `https://${host}/api/webhooks/${id}/${token}`,
    hint: id!.slice(-4),
  }
}

// Longest compose link worth offering. Browsers and these sites take more, but a
// message has to carry several.
export const MAX_COMPOSE_URL = 2000
// What Discord takes in one embed's description, and across a message's embeds.
const EMBED_TEXT = 4096
const MESSAGE_TEXT = 6000
const EMBED_TITLE = 256
const POST_TEXT = 700
const REDDIT_TITLE = 300
const X_LINK = 23

// `encodeURIComponent` leaves these alone, and a `)` ends a Discord link. A lone
// surrogate would make it throw.
export const encodeQuery = (value: string) =>
  encodeURIComponent(value.replace(/\p{Surrogate}/gu, "�")).replace(
    /[!'()*~]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  )

// X counts links as 23 and most characters outside Latin as two, CJK among them.
export function xWeight(text: string) {
  let weight = 0
  for (const char of text.replace(/https?:\/\/\S+/g, "x".repeat(X_LINK))) {
    const c = char.codePointAt(0)!
    const light =
      c <= 4351 ||
      (c >= 8192 && c <= 8205) ||
      (c >= 8208 && c <= 8223) ||
      (c >= 8242 && c <= 8247)
    weight += light ? 1 : 2
  }
  return weight
}

// The most of the post that `write` can turn into something `fits`. It's the
// words that give way, so `write` keeps the signature in every attempt, and
// when no words are short enough there's no link at all.
function shortened(
  text: string,
  write: (words: string) => string,
  fits: (written: string) => boolean
) {
  let words = [...new Intl.Segmenter().segment(text.trim())].map(
    (s) => s.segment
  )
  let written = write(text)
  while (!fits(written)) {
    if (words.length < 2) return null
    words = words.slice(0, -Math.max(1, Math.ceil(words.length / 20)))
    written = write(`${words.join("").trimEnd()}…`)
  }
  return written
}

export interface ComposePost {
  text: string
  link: string | null
  signature: string
}

export type ComposeTarget = "x" | "bluesky" | "threads" | "linkedin" | "reddit"

export interface ComposeLink {
  target: ComposeTarget
  url: string
}

const httpsLink = (link: string | null) => {
  try {
    const url = new URL(link ?? "")
    return url.protocol === "https:" ? url.href : null
  } catch {
    return null
  }
}

// One link per place this post can go, each opening a compose window with the post
// already in it, signature included. LinkedIn takes a link and no text, so it's
// only offered when there's a link to share.
export function composeLinks(post: ComposePost): ComposeLink[] {
  const { text, signature } = post
  const link = httpsLink(post.link)
  const short = (url: string) => url.length <= MAX_COMPOSE_URL
  const prefilled = (
    target: ComposeTarget,
    base: string,
    platform: "twitter" | "bluesky" | "threads"
  ): ComposeLink | null => {
    const url = shortened(
      text,
      (words) =>
        `${base}${encodeQuery(compose(words, link, platform, signature))}`,
      (u) =>
        short(u) &&
        (platform !== "twitter" ||
          xWeight(decodeURIComponent(u.slice(base.length))) <= LIMITS.twitter)
    )
    return url ? { target, url } : null
  }
  // A Reddit title is one line, so the sign-off takes the line break's place.
  const title = (words: string) =>
    fitSigned(words.replace(/\s+/g, " "), REDDIT_TITLE - 1, signature).replace(
      "\n\n",
      " · "
    )
  const reddit = shortened(
    text,
    (words) =>
      `https://www.reddit.com/submit?${
        link ? `url=${encodeQuery(link)}` : "selftext=true"
      }&title=${encodeQuery(title(words))}`,
    short
  )
  return [
    prefilled("x", "https://x.com/intent/post?text=", "twitter"),
    prefilled("bluesky", "https://bsky.app/intent/compose?text=", "bluesky"),
    prefilled(
      "threads",
      "https://www.threads.net/intent/post?text=",
      "threads"
    ),
    link
      ? {
          target: "linkedin" as const,
          url: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeQuery(link)}`,
        }
      : null,
    reddit ? { target: "reddit" as const, url: reddit } : null,
  ].filter((l) => l !== null)
}

const NAMES: Record<ComposeTarget, string> = {
  x: "X",
  bluesky: "Bluesky",
  threads: "Threads",
  linkedin: "LinkedIn",
  reddit: "Reddit",
}

const messages = defineMessages({
  en: {
    source: "Source",
    open: "Each link opens a compose window. Nothing posts until you do.",
    linkedin:
      "LinkedIn takes only the link: add the post and its AI-written line yourself.",
    test: "Test message from {name}. New posts will land in this channel.",
  },
  fr: {
    source: "Source",
    open: "Chaque lien ouvre une fenêtre de rédaction. Rien n'est publié tant que vous ne le faites pas.",
    linkedin:
      "LinkedIn ne prend que le lien : ajoutez vous-même le post et sa mention d'écriture par IA.",
    test: "Message de test de {name}. Les nouveaux posts arriveront dans ce salon.",
  },
  es: {
    source: "Fuente",
    open: "Cada enlace abre una ventana de redacción. No se publica nada hasta que lo hagas tú.",
    linkedin:
      "LinkedIn solo admite el enlace: añade tú la publicación y su aviso de escritura por IA.",
    test: "Mensaje de prueba de {name}. Las nuevas publicaciones llegarán a este canal.",
  },
  de: {
    source: "Quelle",
    open: "Jeder Link öffnet ein Fenster zum Verfassen. Nichts wird gepostet, bis du es tust.",
    linkedin:
      "LinkedIn nimmt nur den Link: Füge den Beitrag und seinen KI-Hinweis selbst hinzu.",
    test: "Testnachricht von {name}. Neue Beiträge landen in diesem Kanal.",
  },
  it: {
    source: "Fonte",
    open: "Ogni link apre una finestra di scrittura. Non viene pubblicato nulla finché non lo fai tu.",
    linkedin:
      "LinkedIn accetta solo il link: aggiungi tu il post e la sua nota di scrittura con IA.",
    test: "Messaggio di prova da {name}. I nuovi post arriveranno in questo canale.",
  },
  ja: {
    source: "出典",
    open: "各リンクは投稿画面を開きます。あなたが投稿するまで何も公開されません。",
    linkedin:
      "LinkedInはリンクのみ対応しています。投稿文とAI執筆の表記はご自身で追加してください。",
    test: "{name} からのテストメッセージです。新しい投稿はこのチャンネルに届きます。",
  },
})

const localeOf = (language: string) => (isLocale(language) ? language : "en")

// The agent read strangers' text, so its words show as written and can't turn into
// a masked link, a heading or a spoiler. Mentions are switched off separately.
export const escapeMarkdown = (text: string) =>
  text.replace(/[\\`*_~|>#[\]()<]/g, "\\$&")

const NO_PINGS = { parse: [] as string[] }

// Links are dropped longest first, so a tight message loses as few as it can.
function packLinks(lines: string[], room: number) {
  const kept = [...lines]
  const total = () => kept.reduce((n, l) => n + l.length + 1, 0)
  while (kept.length && total() > room) {
    const longest = kept.reduce((a, b) => (b.length > a.length ? b : a))
    kept.splice(kept.indexOf(longest), 1)
  }
  const embeds: string[] = []
  for (const line of kept) {
    const last = embeds.at(-1)
    if (last !== undefined && last.length + 1 + line.length <= EMBED_TEXT)
      embeds[embeds.length - 1] = `${last}\n${line}`
    else embeds.push(line)
  }
  return embeds
}

export function discordMessage(
  post: ComposePost & { machine: string; language: string }
) {
  const locale = localeOf(post.language)
  const links = composeLinks(post)
  const source = httpsLink(post.link)
  const title = escapeMarkdown(post.machine).slice(0, EMBED_TITLE)
  const body = escapeMarkdown(fitSigned(post.text, POST_TEXT, post.signature))
  const description = source
    ? `${body}\n\n[${translate(messages, locale, "source")}](${source.replace(/[()]/g, encodeQuery)})`
    : body
  const notes = [
    translate(messages, locale, "open"),
    ...(links.some((l) => l.target === "linkedin")
      ? [translate(messages, locale, "linkedin")]
      : []),
  ].join(" ")
  const lines = links.map((l) => `[${NAMES[l.target]}](${l.url})`)
  const used = title.length + description.length + notes.length
  return {
    allowed_mentions: NO_PINGS,
    embeds: [
      { title, description, footer: { text: notes } },
      ...packLinks(lines, MESSAGE_TEXT - used).map((d) => ({ description: d })),
    ],
  }
}

export const testMessage = (machine: string, language: string) => ({
  allowed_mentions: NO_PINGS,
  content: translate(messages, localeOf(language), "test", {
    name: escapeMarkdown(machine),
  }),
})

export type DiscordOutcome =
  | { kind: "sent"; messageId: string | null }
  | { kind: "wait"; ms: number; global: boolean }
  // The webhook is gone or no longer ours, so trying again can't help.
  | { kind: "gone" }
  // Asked to remove a message that isn't there, which is as good as removed.
  | { kind: "no_message" }
  // Discord read this message and won't take it. The next one may be fine.
  | { kind: "refused" }
  | { kind: "retry" }

const UNKNOWN_MESSAGE = 10008
const DEFAULT_WAIT_MS = 60_000
const MAX_WAIT_MS = 3_600_000

// Seconds, from the header or failing that the body. A wait nobody can read gets
// the default, and a huge one can't park a post past its use.
function waitMs(retryAfter: string | null, body: unknown) {
  const header = Number(retryAfter ?? NaN)
  const inBody = Number((body as { retry_after?: unknown })?.retry_after ?? NaN)
  const seconds = [header, inBody].find((s) => Number.isFinite(s) && s >= 0)
  if (seconds === undefined) return DEFAULT_WAIT_MS
  return Math.min(MAX_WAIT_MS, Math.max(1_000, Math.ceil(seconds * 1_000)))
}

const parsed = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export function readOutcome(res: {
  status: number
  retryAfter: string | null
  global: boolean
  text: string
}): DiscordOutcome {
  const { status } = res
  if (status >= 200 && status < 300) {
    const id = (parsed(res.text) as { id?: unknown } | null)?.id
    return {
      kind: "sent",
      messageId: typeof id === "string" && /^\d{1,32}$/.test(id) ? id : null,
    }
  }
  if (status === 429)
    return {
      kind: "wait",
      ms: waitMs(res.retryAfter, parsed(res.text)),
      global: res.global,
    }
  const code = (parsed(res.text) as { code?: unknown } | null)?.code
  if (status === 404 && code === UNKNOWN_MESSAGE) return { kind: "no_message" }
  if (status === 401 || status === 403 || status === 404)
    return { kind: "gone" }
  return status >= 500 ? { kind: "retry" } : { kind: "refused" }
}

// Five minutes, then ten, twenty and forty.
export const MAX_DISCORD_ATTEMPTS = 5
export const retryDelay = (attempts: number) =>
  5 * 60_000 * 2 ** Math.max(0, attempts - 1)
