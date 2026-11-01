import type { BoothStatus, Job, Patch, Project, Shelf, Take } from "./model"

// The page's side of the Booth, the process on the person's own computer. The
// token never reaches our servers: it arrives in the URL fragment and stays in
// this browser.
const ADDRESS = "http://127.0.0.1:7847"
const KEY = "palmframe-booth-token"

export class BoothError extends Error {
  constructor(
    public code: string,
    public status: number
  ) {
    super(code)
  }
}

export function readToken() {
  try {
    return localStorage.getItem(KEY) ?? ""
  } catch {
    return ""
  }
}

export function saveToken(token: string) {
  try {
    localStorage.setItem(KEY, token)
  } catch {
    // Private windows: it holds for this page through the variable below.
  }
  memory = token
}

let memory = ""
const token = () => memory || readToken()

// Takes the pairing link's fragment and clears it from the address bar, so it
// doesn't sit in history or get pasted into a chat.
export function claimPairing() {
  const match = /^#booth=([\w-]{32,})$/.exec(window.location.hash)
  if (!match) return false
  saveToken(match[1]!)
  history.replaceState(null, "", window.location.pathname)
  return true
}

async function call<T>(
  method: string,
  path: string,
  body?: unknown,
  init?: RequestInit
): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${ADDRESS}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token()}`,
        ...(body !== undefined && { "content-type": "application/json" }),
        ...init?.headers,
      },
      body:
        init?.body ?? (body !== undefined ? JSON.stringify(body) : undefined),
    })
  } catch {
    throw new BoothError("offline", 0)
  }
  const json = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new BoothError(json.error ?? "failed", res.status)
  return json as T
}

export const booth = {
  hello: () => call<{ version: string }>("GET", "/hello"),
  status: () => call<BoothStatus>("GET", "/status"),
  shelf: () => call<Shelf[]>("GET", "/projects"),
  project: (id: string, rev?: number) =>
    call<{ project?: Project; same?: boolean; jobs: Job[] }>(
      "GET",
      `/projects/${id}${rev === undefined ? "" : `?rev=${rev}`}`
    ),
  patch: (id: string, patch: Patch) =>
    call<{ rev: number }>("PATCH", `/projects/${id}`, patch),
  remove: (id: string) => call("DELETE", `/projects/${id}`),
  cancel: (job: string) => call("POST", `/jobs/${job}/cancel`),
  script: (id: string, body: object) =>
    call<Job>("POST", `/projects/${id}/script`, body),
  separate: (id: string) => call<Job>("POST", `/projects/${id}/separate`, {}),
  takes: (id: string, lines: string[]) =>
    call<Job>("POST", `/projects/${id}/takes`, { lines }),
  audition: (id: string, speaker: string, text: string) =>
    call<Job>("POST", `/projects/${id}/audition`, { speaker, text }),
  referenceFromFilm: (
    id: string,
    speaker: string,
    start: number,
    end: number
  ) =>
    call<Job>("POST", `/projects/${id}/reference`, {
      speaker,
      start,
      end,
      consent: true,
    }),
  referenceFromFile: (
    id: string,
    speaker: string,
    file: Blob,
    origin: "file" | "mic"
  ) =>
    call<Job>(
      "POST",
      `/projects/${id}/reference-upload?speaker=${speaker}&origin=${origin}&consent=1`,
      undefined,
      { body: file }
    ),
  takeFromMic: (id: string, line: string, file: Blob) =>
    call<Take>("POST", `/projects/${id}/take-upload?line=${line}`, undefined, {
      body: file,
    }),
  render: (id: string, container: "mkv" | "mp4") =>
    call<Job>("POST", `/projects/${id}/render`, { container }),
  reveal: (id: string, file: string) =>
    call("POST", `/projects/${id}/reveal`, { file }),
  sidecar: (id: string, file: File) =>
    call<Job>("POST", `/projects/${id}/sidecar`, undefined, {
      body: file,
      headers: { "x-file-name": encodeURIComponent(file.name) },
    }),
  // XHR rather than fetch, because fetch reports no upload progress.
  upload(file: File, onProgress: (share: number) => void) {
    return new Promise<Project>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open("POST", `${ADDRESS}/projects`)
      xhr.setRequestHeader("authorization", `Bearer ${token()}`)
      xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name))
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded / e.total)
      }
      xhr.onerror = () => reject(new BoothError("offline", 0))
      xhr.onload = () => {
        let body: { error?: string } = {}
        try {
          body = JSON.parse(xhr.responseText) as { error?: string }
        } catch {
          // Reported below by its status.
        }
        if (xhr.status >= 300)
          reject(new BoothError(body.error ?? "failed", xhr.status))
        else resolve(body as Project)
      }
      xhr.send(file)
    })
  },
}

export const mediaUrl = (id: string, path: string) =>
  `${ADDRESS}/projects/${id}/media/${path}?t=${encodeURIComponent(token())}`

export async function adapt(body: {
  lines: {
    id: string
    source: string
    current: string
    speaker: string
    seconds: number
  }[]
  from: string
  to: string
  mode: "translate" | "tighten"
}) {
  const res = await fetch("/api/dub", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as {
    lines?: { id: string; text: string }[]
    code?: string
    error?: string
  }
  if (!res.ok)
    throw new BoothError(json.code ?? json.error ?? "failed", res.status)
  return json.lines ?? []
}
