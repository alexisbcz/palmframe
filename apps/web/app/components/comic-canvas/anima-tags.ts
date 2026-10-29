// Danbooru tags for Anima prompts. The model card asks for this order:
// quality/meta/year/safety, subject count, character, series, artist,
// general tags. Tags are lowercase with spaces, except score_N.

export type TagGroupId =
  | "era"
  | "count"
  | "looks"
  | "outfit"
  | "framing"
  | "angle"
  | "gaze"
  | "expression"
  | "pose"
  | "setting"
  | "lighting"
  | "effects"

export interface TagGroup {
  id: TagGroupId
  label: string
  // Only one tag of the group makes sense at a time (a shot has one framing).
  single?: boolean
  tags: string[]
}

export const TAG_GROUPS: TagGroup[] = [
  {
    id: "count",
    label: "Subject",
    tags: [
      "1girl",
      "1boy",
      "1other",
      "2girls",
      "2boys",
      "multiple girls",
      "multiple boys",
      "solo",
      "no humans",
    ],
  },
  {
    id: "framing",
    label: "Framing",
    single: true,
    tags: [
      "close-up",
      "portrait",
      "upper body",
      "cowboy shot",
      "full body",
      "wide shot",
      "very wide shot",
    ],
  },
  {
    id: "angle",
    label: "Camera angle",
    tags: [
      "from above",
      "from below",
      "from side",
      "from behind",
      "dutch angle",
      "pov",
    ],
  },
  {
    id: "gaze",
    label: "Gaze",
    single: true,
    tags: [
      "looking at viewer",
      "looking away",
      "looking down",
      "looking up",
      "looking to the side",
      "looking at another",
      "looking at phone",
      "closed eyes",
    ],
  },
  {
    id: "expression",
    label: "Expression",
    tags: [
      "smile",
      "grin",
      "smirk",
      "laughing",
      "serious",
      "frown",
      "angry",
      "clenched teeth",
      "surprised",
      "open mouth",
      "scared",
      "nervous",
      "sweatdrop",
      "sad",
      "crying",
      "tears",
      "tired",
      "expressionless",
      "blush",
    ],
  },
  {
    id: "pose",
    label: "Pose & action",
    tags: [
      "standing",
      "sitting",
      "walking",
      "running",
      "jumping",
      "leaning forward",
      "arms crossed",
      "hand on own hip",
      "head rest",
      "pointing",
      "pointing at viewer",
      "arms up",
      "waving",
      "clenched hand",
      "punching",
      "fighting stance",
      "dynamic pose",
      "typing",
      "holding phone",
      "holding cup",
      "drinking",
    ],
  },
  {
    id: "looks",
    label: "Hair & face",
    tags: [
      "short hair",
      "long hair",
      "messy hair",
      "ponytail",
      "black hair",
      "brown hair",
      "blonde hair",
      "grey hair",
      "white hair",
      "bald",
      "beard",
      "stubble",
      "glasses",
      "round eyewear",
      "dark skin",
      "old man",
      "old woman",
    ],
  },
  {
    id: "outfit",
    label: "Outfit",
    tags: [
      "hoodie",
      "t-shirt",
      "sweater",
      "jacket",
      "leather jacket",
      "suit",
      "necktie",
      "business suit",
      "lab coat",
      "trench coat",
      "turtleneck",
      "baseball cap",
      "headphones",
      "headset",
    ],
  },
  {
    id: "setting",
    label: "Setting",
    tags: [
      "indoors",
      "outdoors",
      "office",
      "desk",
      "computer",
      "monitor",
      "laptop",
      "cafe",
      "bedroom",
      "kitchen",
      "classroom",
      "stage",
      "city",
      "cityscape",
      "street",
      "alley",
      "rooftop",
      "skyscraper",
      "window",
      "night",
      "night sky",
      "snow",
      "scenery",
      "simple background",
      "white background",
    ],
  },
  {
    id: "lighting",
    label: "Lighting",
    tags: [
      "dramatic lighting",
      "screen light",
      "backlighting",
      "rim lighting",
      "silhouette",
      "moonlight",
      "neon lights",
      "sunlight",
    ],
  },
  {
    id: "effects",
    label: "Comic effects",
    tags: [
      "speed lines",
      "emphasis lines",
      "motion blur",
      "explosion",
      "smoke",
      "rain",
      "depth of field",
    ],
  },
  {
    id: "era",
    label: "Era",
    single: true,
    tags: ["newest", "recent", "mid", "early", "old"],
  },
]

// Prompt order. Artist tags (@name) sit between looks and general tags.
const ORDER: (TagGroupId | "artist" | "general")[] = [
  "era",
  "count",
  "looks",
  "outfit",
  "artist",
  "framing",
  "angle",
  "gaze",
  "expression",
  "pose",
  "setting",
  "lighting",
  "effects",
  "general",
]

const GROUP_OF = new Map(
  TAG_GROUPS.flatMap((g) => g.tags.map((t) => [t, g.id] as const))
)

export function groupOf(tag: string) {
  if (tag.startsWith("@")) return "artist"
  return GROUP_OF.get(tag) ?? "general"
}

// "Looking_At_Viewer " → "looking at viewer". Weights like (chibi:2) pass through.
export function normalizeTag(raw: string) {
  const tag = raw.trim().replace(/\s+/g, " ")
  if (/^score_\d$/i.test(tag)) return tag.toLowerCase()
  return tag.replace(/_/g, " ").toLowerCase()
}

export function sortTags(tags: string[]) {
  return [...tags].sort(
    (a, b) => ORDER.indexOf(groupOf(a)) - ORDER.indexOf(groupOf(b))
  )
}

// Adds a tag, replacing the other tag of a single-choice group.
export function addTag(tags: string[], tag: string) {
  if (!tag || tags.includes(tag)) return tags
  const group = TAG_GROUPS.find((g) => g.id === groupOf(tag))
  const kept = group?.single
    ? tags.filter((t) => !group.tags.includes(t))
    : tags
  return sortTags([...kept, tag])
}

// Groups shown as picture cards rendered by Anima itself (public/anima-refs).
export const VISUAL_GROUPS: TagGroupId[] = [
  "framing",
  "angle",
  "lighting",
  "effects",
]

export const refImage = (tag: string) =>
  `/anima-refs/${tag.replace(/\s+/g, "-")}.webp`
