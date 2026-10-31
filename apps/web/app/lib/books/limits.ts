// What an uploaded book may weigh. Books run on the server, unlike comics, so
// every cap here protects a function that stops at 2 GB and 290 seconds.
export const MAX_BOOK_BYTES = 200 * 1024 * 1024
export const MAX_ARCHIVE_ENTRIES = 10_000
// One XHTML or XML part. A novel's largest chapter is a few hundred kilobytes.
export const MAX_PART_BYTES = 32 * 1024 * 1024
// All text parts together, after decompression.
export const MAX_TEXT_BYTES = 256 * 1024 * 1024
// Text compresses about 4:1 and markup 10:1. Past this it's a bomb.
export const MAX_EXPANSION = 100
export const EXPANSION_FLOOR_BYTES = 16 * 1024 * 1024
export const MAX_XML_DEPTH = 256
export const MAX_PDF_PAGES = 2_000
export const MAX_SEGMENTS = 60_000
export const MAX_SEGMENT_CHARS = 20_000
export const MAX_WORDS = 1_500_000
export const MAX_BOOKS_PER_USER = 200
export const MAX_ACTIVE_JOBS_PER_USER = 3
export const MAX_GLOSSARY_TERMS = 5_000
export const MAX_GLOSSARY_IMPORT_BYTES = 4 * 1024 * 1024
export const MAX_CHANGES = 2_000
export const MAX_MESSAGE = 4_000
export const MAX_WEBHOOKS = 10
export const SCAN_SIDE = 1568
// A page with fewer characters than this has no usable text layer.
export const MIN_PAGE_CHARS = 16
