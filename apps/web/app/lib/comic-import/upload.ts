// A prepared style's way to storage: the row exists and these are its signed
// slots. The object survives a failed upload, so a retry carries on from the
// page that failed, into the same row, instead of starting a second style.
export interface PreparedUpload {
  id: string
  targets: { path: string; token: string }[]
  blobs: Blob[]
  sent: number
}

export const uploadFinished = (upload: PreparedUpload) =>
  upload.sent >= upload.targets.length

export async function sendPages(
  upload: PreparedUpload,
  put: (target: { path: string; token: string }, page: Blob) => Promise<void>,
  onPage?: (count: number, total: number) => void
) {
  const { targets, blobs } = upload
  while (!uploadFinished(upload)) {
    const i = upload.sent
    onPage?.(i + 1, targets.length)
    await put(targets[i]!, blobs[i]!)
    upload.sent = i + 1
  }
}

// A page whose upload worked but whose reply was lost comes back as a conflict
// on retry. Slots can't overwrite, so that page is there and done.
export function alreadyStored(error: unknown) {
  const { status, statusCode } = error as {
    status?: unknown
    statusCode?: unknown
  }
  return String(status ?? statusCode) === "409"
}
