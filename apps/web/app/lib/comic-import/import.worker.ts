/// <reference lib="webworker" />
import unrarUrl from "node-unrar-js/esm/js/unrar.wasm?url"
import sevenZipUrl from "7z-wasm/7zz.wasm?url"

import {
  fileSource,
  openRar,
  openSevenZip,
  openTar,
  openZip,
  owned,
  type Book,
  type Wasm,
} from "./archives"
import { ImportError } from "./errors"
import type { BookKind } from "./sniff"

// Archives open here so a big one can't freeze the page, and so closing the
// dialog can stop one by ending the worker. ZIP and tar stay on disk; RAR and
// 7z formats need their whole file here for as long as the book is open.
export type WorkerRequest =
  | { id: number; type: "open"; file: File; kind: BookKind }
  | { id: number; type: "read"; book: number; name: string }

export type WorkerResponse =
  | {
      id: number
      ok: true
      book?: number
      pages?: Book["pages"]
      bytes?: Uint8Array
    }
  | { id: number; ok: false; code: ImportError["code"] }

const wasm: Wasm = {
  unrar: async () => (await fetch(unrarUrl)).arrayBuffer(),
  sevenZip: { locateFile: () => sevenZipUrl },
}

const books = new Map<number, Book>()
let nextBook = 1

async function open(file: File, kind: BookKind) {
  const source = fileSource(file)
  if (kind === "zip") return openZip(source)
  if (kind === "tar") return openTar(source)
  if (kind === "rar") return openRar(source, wasm)
  if (kind === "7z") return openSevenZip(source, wasm)
  throw new ImportError("unsupported")
}

const scope = self as unknown as DedicatedWorkerGlobalScope

scope.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  const { id } = data
  try {
    if (data.type === "open") {
      const book = await open(data.file, data.kind)
      const handle = nextBook++
      books.set(handle, book)
      scope.postMessage({
        id,
        ok: true,
        book: handle,
        pages: book.pages,
      } satisfies WorkerResponse)
      return
    }
    const book = books.get(data.book)
    if (!book) throw new ImportError("corrupt")
    // A page can be a view of a larger buffer, which the transfer would take
    // with it.
    const bytes = owned(await book.read(data.name))
    scope.postMessage({ id, ok: true, bytes } satisfies WorkerResponse, [
      bytes.buffer,
    ])
  } catch (e) {
    scope.postMessage({
      id,
      ok: false,
      code: e instanceof ImportError ? e.code : "corrupt",
    } satisfies WorkerResponse)
  }
}
