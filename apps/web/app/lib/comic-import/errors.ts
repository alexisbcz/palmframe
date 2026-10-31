// Why a file couldn't be read. Codes, not sentences: the dialog words them in
// the visitor's language.
export type ImportErrorCode =
  | "unsupported"
  | "file_too_large"
  | "too_many_files"
  | "too_many_entries"
  | "too_many_pages"
  | "expands_too_much"
  | "no_pages"
  | "encrypted"
  | "multi_volume"
  | "corrupt"
  | "page_too_large"

export class ImportError extends Error {
  constructor(
    readonly code: ImportErrorCode,
    message: string = code
  ) {
    super(message)
    this.name = "ImportError"
  }
}
