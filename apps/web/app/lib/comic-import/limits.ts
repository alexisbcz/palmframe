// What an uploaded comic may weigh. Everything here runs on the visitor's own
// device, so the limits protect their browser tab from a hostile or broken
// file as much as they protect us.
export const MAX_FILE_BYTES = 500 * 1024 * 1024
// A book can stay in memory as long as the dialog is open, so everything
// dropped at once shares one budget. A phone gets a far smaller one, since a
// tab that outgrows it is killed without warning.
export const MAX_DROP_BYTES = 2 * 1024 * 1024 * 1024
export const MOBILE_MAX_FILE_BYTES = 200 * 1024 * 1024
export const MOBILE_MAX_DROP_BYTES = 400 * 1024 * 1024
export const MAX_FILES = 200
// Entries of any kind in one archive: directories and junk count too.
export const MAX_ENTRIES = 10_000
// Readable pages across everything dropped at once.
export const MAX_PAGES = 2_000
export const MAX_PAGE_BYTES = 100 * 1024 * 1024
export const MAX_TOTAL_BYTES = 4 * 1024 * 1024 * 1024
// A scanned page barely compresses. Past this ratio, and past the size where
// it matters, an archive is a bomb rather than a comic.
export const MAX_EXPANSION = 50
export const EXPANSION_FLOOR_BYTES = 256 * 1024 * 1024
// Decoded size, which a tiny PNG can make enormous: 100 MP is an A3 scan at
// about 800 dpi.
export const MAX_PIXELS = 100_000_000
// A TIFF is a chain of images. A comic page needs the first; the cap and a
// check for loops keep a hostile chain away from the decoder.
export const MAX_TIFF_IFDS = 32

// How long a step may run before it counts as stuck. A worker killed for
// memory can vanish without an error, and only a clock notices that.
export const OPEN_TIMEOUT_MS = 120_000
export const READ_TIMEOUT_MS = 60_000
export const DECODE_TIMEOUT_MS = 30_000

// What a saved style keeps: pages downscaled to this, as JPEG, so nothing
// close to the original file is ever stored.
export const MAX_STYLE_PAGES = 8
export const MAX_STYLE_PAGE_BYTES = 8 * 1024 * 1024
export const STYLE_PAGE_SIDE = 1568
export const MAX_STYLE_NAME = 80
// Reference slots a style may take in one render. The rest of `MAX_REFS`
// stays with the cast, the world and the guide.
export const MAX_STYLE_SLOTS = 2
