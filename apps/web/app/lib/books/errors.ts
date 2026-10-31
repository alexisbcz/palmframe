// Why a book can't go further. Codes, not sentences: the UI words them in the
// reader's language and the API sends them as they are.
export const BOOK_ERROR_CODES = [
  "unsupported",
  "too_large",
  "too_many_entries",
  "expands_too_much",
  "corrupt",
  "encrypted",
  "unsafe_xml",
  "empty",
  "too_many_pages",
  "too_long",
  "upload_missing",
] as const

export type BookErrorCode = (typeof BOOK_ERROR_CODES)[number]

export class BookParseError extends Error {
  constructor(
    readonly code: BookErrorCode,
    message: string = code
  ) {
    super(message)
    this.name = "BookParseError"
  }
}
