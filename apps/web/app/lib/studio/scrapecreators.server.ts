import {
  type Ad,
  type Advertiser,
  type Platform,
  type Video,
  platformOf,
} from "./model"
import {
  compact,
  fromAdvertiser,
  fromInstagramPost,
  fromMetaAd,
  fromReel,
  fromTikTok,
  fromYouTube,
} from "./normalize"

const API = "https://api.scrapecreators.com"
const TIMEOUT_MS = 45_000
const MAX_TRANSCRIPT = 8_000

export class SourceError extends Error {
  constructor(
    message: string,
    // "missing": not found or private. "busy": try later. "setup": not ours to fix there.
    readonly code: "missing" | "busy" | "setup"
  ) {
    super(message)
  }
}

export const scrapeCreatorsAvailable = () =>
  !!process.env.SCRAPECREATORS_API_KEY?.trim()

async function get(
  path: string,
  params: Record<string, string>,
  signal?: AbortSignal
) {
  const key = process.env.SCRAPECREATORS_API_KEY?.trim()
  if (!key) throw new SourceError("SCRAPECREATORS_API_KEY is not set.", "setup")
  const res = await fetch(`${API}${path}?${new URLSearchParams(params)}`, {
    headers: { "x-api-key": key },
    signal: AbortSignal.any([
      AbortSignal.timeout(TIMEOUT_MS),
      ...(signal ? [signal] : []),
    ]),
  })
  if (res.status === 404 || res.status === 403)
    throw new SourceError(`Not available (${res.status})`, "missing")
  if (res.status === 401 || res.status === 402)
    throw new SourceError(`ScrapeCreators refused (${res.status})`, "setup")
  if (!res.ok) throw new SourceError(`ScrapeCreators ${res.status}`, "busy")
  return (await res.json()) as Record<string, any>
}

export async function searchAdvertisers(
  query: string,
  signal?: AbortSignal
): Promise<Advertiser[]> {
  const d = await get(
    "/v1/facebook/adLibrary/search/companies",
    { query },
    signal
  )
  return compact<Advertiser>((d.searchResults ?? []).map(fromAdvertiser)).slice(
    0,
    12
  )
}

export async function companyAds(
  pageId: string,
  signal?: AbortSignal
): Promise<Ad[]> {
  const d = await get(
    "/v1/facebook/adLibrary/company/ads",
    { pageId, status: "ACTIVE" },
    signal
  )
  const now = Date.now() / 1000
  return compact(
    (d.results ?? []).map((a: unknown) => fromMetaAd(a as any, now))
  )
}

export async function searchVideos(
  platform: Platform,
  query: string,
  signal?: AbortSignal
): Promise<Video[]> {
  if (platform === "tiktok") {
    const d = await get("/v1/tiktok/search/keyword", { query }, signal)
    return compact(
      (d.search_item_list ?? []).map((i: any) => fromTikTok(i?.aweme_info))
    )
  }
  if (platform === "instagram") {
    const d = await get("/v2/instagram/reels/search", { query }, signal)
    return compact((d.reels ?? []).map(fromReel))
  }
  const d = await get("/v1/youtube/search", { query }, signal)
  return compact([...(d.videos ?? []), ...(d.shorts ?? [])].map(fromYouTube))
}

export async function trendingVideos(
  platform: Exclude<Platform, "tiktok">,
  signal?: AbortSignal
): Promise<Video[]> {
  if (platform === "instagram") {
    const d = await get("/v1/instagram/reels/trending", {}, signal)
    return compact((d.reels ?? []).map(fromReel))
  }
  const d = await get("/v1/youtube/shorts/trending", {}, signal)
  return compact((d.shorts ?? []).map(fromYouTube))
}

// A missing transcript is ordinary: plenty of videos have no speech.
async function transcriptOf(
  platform: Platform,
  url: string,
  signal?: AbortSignal
) {
  try {
    if (platform === "youtube") {
      const d = await get("/v1/youtube/video/transcript", { url }, signal)
      return String(d.transcript_only_text ?? "")
    }
    if (platform === "instagram") {
      const d = await get("/v2/instagram/media/transcript", { url }, signal)
      return (d.transcripts ?? []).map((t: any) => t?.text ?? "").join(" ")
    }
    const d = await get("/v1/tiktok/video/transcript", { url }, signal)
    return String(d.transcript ?? "")
  } catch (e) {
    if (e instanceof SourceError && e.code === "missing") return ""
    throw e
  }
}

export async function fetchVideo(
  url: string,
  signal?: AbortSignal
): Promise<Video> {
  const platform = platformOf(url)
  if (!platform) throw new SourceError("Unsupported link", "missing")
  const [video, transcript] = await Promise.all([
    platform === "tiktok"
      ? get("/v2/tiktok/video", { url, trim: "true" }, signal).then((d) =>
          fromTikTok(d.aweme_detail)
        )
      : platform === "instagram"
        ? get("/v1/instagram/post", { url }, signal).then((d) =>
            fromInstagramPost(d, url)
          )
        : get("/v1/youtube/video", { url }, signal).then((d) =>
            fromYouTube({ ...d, url })
          ),
    transcriptOf(platform, url, signal),
  ])
  if (!video) throw new SourceError("Nothing readable at that link", "missing")
  return { ...video, transcript: transcript.slice(0, MAX_TRANSCRIPT) }
}
