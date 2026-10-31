import type { Reading, SourceId } from "./model"

// The public streams, behind one shape. Runs in browsers and on the server:
// nothing here needs a key, and every parser takes a stream's own JSON and
// returns a Reading or null.
export interface OpenOptions {
  // Crypto: asset symbols.
  keywords: string[]
  // Bluesky and Wikipedia can replay from here, in milliseconds.
  since?: number
  signal: AbortSignal
  onReading: (reading: Reading) => void
}

const JETSTREAM =
  "wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post"
const WIKIMEDIA = "https://stream.wikimedia.org/v2/stream/recentchange"
const COINBASE = "wss://advanced-trade-ws.coinbase.com"

const DEFAULT_ASSETS = ["BTC", "ETH", "SOL"]
const ASSET_NAMES: Record<string, string> = {
  BTC: "Bitcoin",
  ETH: "Ether",
  SOL: "Solana",
}

type Json = Record<string, any>

export function parseJetstream(m: Json): Reading | null {
  const record = m?.commit?.record
  if (
    m?.kind !== "commit" ||
    m.commit.operation !== "create" ||
    typeof record?.text !== "string" ||
    !record.text.trim()
  )
    return null
  return {
    kind: "text",
    source: "bluesky",
    subject: null,
    text: record.text,
    url: `https://bsky.app/profile/${m.did}/post/${m.commit.rkey}`,
    at: Math.floor(m.time_us / 1000),
    ...(record.langs?.[0] && { lang: String(record.langs[0]).slice(0, 2) }),
  }
}

// Human edits to articles, on any language's Wikipedia.
export function parseWikipedia(m: Json): Reading | null {
  if (
    m?.type !== "edit" ||
    m.bot ||
    m.namespace !== 0 ||
    typeof m.wiki !== "string" ||
    !/^[a-z]{2}wiki$/.test(m.wiki)
  )
    return null
  return {
    kind: "text",
    source: "wikipedia",
    subject: m.title,
    text: `${m.title} ${m.comment ?? ""}`.trim(),
    url: m.title_url,
    at: m.timestamp * 1000,
    lang: m.wiki.slice(0, 2),
  }
}

export function parseCoinbase(m: Json): Reading[] {
  if (m?.channel !== "market_trades" || !Array.isArray(m.events)) return []
  // Trades come oldest last; one per asset per message is plenty.
  const latest = new Map<string, Json>()
  for (const event of m.events)
    for (const trade of event?.trades ?? [])
      if (!latest.has(trade.product_id)) latest.set(trade.product_id, trade)
  return [...latest.values()].flatMap((trade): Reading[] => {
    const value = Number(trade.price)
    const at = Date.parse(trade.time)
    if (!(value > 0) || !Number.isFinite(at)) return []
    const asset = String(trade.product_id).split("-")[0]!
    return [
      {
        kind: "level",
        source: "crypto",
        subject: trade.product_id,
        label: ASSET_NAMES[asset] ?? asset,
        value,
        url: `https://www.coinbase.com/price/${(ASSET_NAMES[asset] ?? asset).toLowerCase()}`,
        at,
      },
    ]
  })
}

// Resolves when the socket closes or `signal` aborts; rejects if it never opened.
function socket(
  url: string,
  o: {
    signal: AbortSignal
    onOpen?: (ws: WebSocket) => void
    onMessage: (data: unknown) => void
  }
) {
  return new Promise<void>((resolve, reject) => {
    if (o.signal.aborted) return resolve()
    const ws = new WebSocket(url)
    let opened = false
    const stop = () => ws.close()
    const finish = () => {
      o.signal.removeEventListener("abort", stop)
    }
    o.signal.addEventListener("abort", stop)
    ws.onopen = () => {
      opened = true
      o.onOpen?.(ws)
    }
    ws.onmessage = (e) => {
      try {
        o.onMessage(JSON.parse(String(e.data)))
      } catch {
        // One unreadable message isn't worth losing the stream.
      }
    }
    ws.onerror = () => {
      if (!opened) {
        finish()
        reject(new Error(`Could not reach ${new URL(url).host}`))
      }
    }
    ws.onclose = () => {
      finish()
      if (opened || o.signal.aborted) resolve()
      else reject(new Error(`Could not reach ${new URL(url).host}`))
    }
  })
}

// Server-sent events through fetch, which unlike EventSource can name itself.
async function events(
  url: string,
  o: { signal: AbortSignal; onMessage: (data: unknown) => void }
) {
  let res: Response
  try {
    res = await fetch(url, {
      signal: o.signal,
      // Browsers would turn a custom user agent into a blocked preflight.
      ...(typeof window === "undefined" && {
        headers: { "user-agent": "Palmframe (https://www.palmframe.com)" },
      }),
    })
  } catch (e) {
    if (o.signal.aborted) return
    throw e
  }
  if (!res.ok || !res.body)
    throw new Error(`${new URL(url).host} answered ${res.status}`)
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ""
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) return
      buffer += value
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        if (!line.startsWith("data:")) continue
        try {
          o.onMessage(JSON.parse(line.slice(5)))
        } catch {
          // Same as sockets: skip it and keep listening.
        }
      }
    }
  } catch (e) {
    if (!o.signal.aborted) throw e
  }
}

export const coinbaseProducts = (keywords: string[]) => {
  const assets = keywords
    .map((k) => k.trim().toUpperCase())
    .filter((k) => /^[A-Z0-9]{2,10}$/.test(k))
  return (assets.length ? assets : DEFAULT_ASSETS).map((a) => `${a}-USD`)
}

export function openSource(source: SourceId, o: OpenOptions): Promise<void> {
  const emit = (r: Reading | null) => {
    if (r) o.onReading(r)
  }
  switch (source) {
    case "bluesky":
      return socket(
        o.since ? `${JETSTREAM}&cursor=${o.since * 1000}` : JETSTREAM,
        { signal: o.signal, onMessage: (m) => emit(parseJetstream(m as Json)) }
      )
    case "wikipedia":
      return events(
        o.since
          ? `${WIKIMEDIA}?since=${new Date(o.since).toISOString()}`
          : WIKIMEDIA,
        { signal: o.signal, onMessage: (m) => emit(parseWikipedia(m as Json)) }
      )
    case "crypto":
      return socket(COINBASE, {
        signal: o.signal,
        onOpen: (ws) =>
          ws.send(
            JSON.stringify({
              type: "subscribe",
              product_ids: coinbaseProducts(o.keywords),
              channel: "market_trades",
            })
          ),
        onMessage: (m) => parseCoinbase(m as Json).forEach(o.onReading),
      })
  }
}
