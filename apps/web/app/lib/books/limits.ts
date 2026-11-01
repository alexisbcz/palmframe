// What an uploaded book may weigh. Books run on the server, unlike comics, so
// every cap here protects a function that stops at 2 GB and 290 seconds.
export const MAX_BOOK_BYTES = 200 * 1024 * 1024
export const MAX_ARCHIVE_ENTRIES = 10_000
// One XHTML or XML part. A novel's largest chapter is a few hundred kilobytes.
export const MAX_PART_BYTES = 16 * 1024 * 1024
// Parsed nodes in one part. A node costs hundreds of bytes of heap, and a
// small file of nothing but `<a/>` is mostly nodes.
export const MAX_XML_NODES = 1_000_000
// All text parts together, after decompression.
export const MAX_TEXT_BYTES = 128 * 1024 * 1024
// Text compresses about 4:1 and markup 10:1. Past this it's a bomb.
export const MAX_EXPANSION = 100
export const EXPANSION_FLOOR_BYTES = 16 * 1024 * 1024
export const MAX_XML_DEPTH = 256
export const MAX_PDF_PAGES = 2_000
export const MAX_SEGMENTS = 60_000
export const MAX_CHAPTERS = 2_000
export const MAX_SEGMENT_CHARS = 20_000
export const MAX_WORDS = 1_500_000
export const MAX_BOOKS_PER_USER = 200
export const MAX_ACTIVE_JOBS_PER_USER = 3
// Reading and exporting cost nothing, but they do cost us.
export const MAX_ACTIVE_FREE_JOBS_PER_USER = 4
export const MAX_FREE_JOBS_PER_HOUR = 40
// Originals per person. The database holds the same number.
export const MAX_STORAGE_BYTES_PER_USER = 2 * 1024 * 1024 * 1024
// Terms times segments, for a check run inside a request. The checks after
// every translation cover larger books in a job.
export const MAX_GLOSSARY_CHECK = 2_000_000
// A slice stops here. A function stops at `MAX_DURATION_MS`, and a lease must
// outlast it, or a second slice starts beside one that's still running.
export const SLICE_MS = 235_000
export const MAX_DURATION_MS = 290_000
export const LEASE_MS = 310_000
// Claims in a row with no progress before a job counts as killing its function.
export const MAX_CLAIMS = 3
export const PDF_PARSE_MS = 180_000
export const PDF_PAGE_MS = 20_000
export const MAX_GLOSSARY_TERMS = 5_000
export const MAX_GLOSSARY_IMPORT_BYTES = 4 * 1024 * 1024
export const MAX_CHANGES = 2_000
export const MAX_MESSAGE = 4_000
export const MAX_WEBHOOKS = 10
export const SCAN_SIDE = 1568
// A page with fewer characters than this has no usable text layer.
export const MIN_PAGE_CHARS = 16
