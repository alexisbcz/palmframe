// Why a file couldn't be read. Codes, not sentences: the dialog words them in
// the visitor's language.
export const IMPORT_ERROR_CODES = [
  "unsupported",
  "file_too_large",
  "drop_too_large",
  "too_many_files",
  "too_many_entries",
  "too_many_pages",
  "expands_too_much",
  "no_pages",
  "encrypted",
  "multi_volume",
  "corrupt",
  "page_too_large",
  "timed_out",
] as const

export type ImportErrorCode = (typeof IMPORT_ERROR_CODES)[number]

export class ImportError extends Error {
  constructor(
    readonly code: ImportErrorCode,
    message: string = code
  ) {
    super(message)
    this.name = "ImportError"
  }
}
