import type {
  AssetColor,
  Asset,
  AssetKind,
  AssetPayload,
  Genre,
  Pack,
} from "./model"
import colors from "./seed-colors.json"

// The official assets. They ship with the app, so the catalog never starts
// empty and works without the database. `scripts/render-catalog.ts` draws
// their images into public/catalog, named by id.
export interface SeedAsset {
  id: string
  kind: AssetKind
  name: string
  description: string
  genres: Genre[]
  payload: AssetPayload
  // The style its picture is drawn in.
  art?: "graphic" | "color" | "retro" | "noir" | "anime"
  // What a story's picture shows.
  scene?: string
}

const adult = "adult"
const character = (
  id: string,
  name: string,
  who: "girl" | "boy" | "other",
  genres: Genre[],
  art: SeedAsset["art"],
  description: string,
  tags: string[]
): SeedAsset => ({
  id,
  kind: who === "other" ? "creature" : "character",
  name,
  description,
  genres,
  art,
  payload: {
    type: "character",
    character: who,
    tags: who === "other" ? tags : [adult, ...tags],
  },
})

const world = (
  kind: "location" | "prop",
  id: string,
  name: string,
  genres: Genre[],
  art: SeedAsset["art"],
  description: string,
  tags: string[]
): SeedAsset => ({
  id,
  kind,
  name,
  description,
  genres,
  art,
  payload: { type: "world", world: kind, tags },
})

const direction = (
  kind: "shot" | "lighting" | "pose" | "effect",
  id: string,
  name: string,
  description: string,
  tags: string[],
  prompt?: string
): SeedAsset => ({
  id,
  kind,
  name,
  description,
  genres: [],
  art: "graphic",
  payload: { type: "direction", tags, ...(prompt && { prompt }) },
})

const style = (
  id: string,
  name: string,
  genres: Genre[],
  description: string,
  base: "graphic" | "color" | "retro" | "noir" | "anime",
  palette:
    | "red"
    | "orange"
    | "yellow"
    | "green"
    | "aqua"
    | "blue"
    | "purple"
    | "pink"
    | "brown"
    | "sepia"
    | null,
  saturation: "vivid" | "balanced" | "muted",
  tags: string,
  prose: string,
  negative = ""
): SeedAsset => ({
  id,
  kind: "style",
  name,
  description,
  genres,
  art: base,
  payload: {
    type: "look",
    look: { style: base, palette, saturation },
    recipe: { name, tags, prose, negative },
  },
})

const sfx = (
  id: string,
  text: string,
  description: string,
  genres: Genre[],
  font: "bangers" | "comic" | "inter",
  color: string,
  strokeColor: string
): SeedAsset => ({
  id,
  kind: "sfx",
  name: text,
  description,
  genres,
  payload: { type: "sfx", text, font, color, strokeColor },
})

const story = (
  id: string,
  name: string,
  genres: Genre[],
  art: SeedAsset["art"],
  description: string,
  scene: string,
  brief: string,
  facts: string[] = []
): SeedAsset => ({
  id,
  kind: "story",
  name,
  description,
  genres,
  art,
  ...(scene && { scene }),
  payload: { type: "story", brief, ...(facts.length && { facts }) },
})

export const SEED: SeedAsset[] = [
  // Characters
  character(
    "vale",
    "Inspector Vale",
    "girl",
    ["crime"],
    "noir",
    "A homicide detective who has stopped believing the city can be fixed, and keeps showing up anyway.",
    [
      "woman in her forties",
      "short silver hair",
      "tired sharp eyes",
      "long belted trench coat",
      "dark turtleneck",
    ]
  ),
  character(
    "kaito",
    "Kaito Mori",
    "boy",
    ["action", "scifi"],
    "anime",
    "A courier who outruns drones on a modified bike and owes money to all the wrong people.",
    [
      "young man in his twenties",
      "messy black hair",
      "scar through left eyebrow",
      "orange courier jacket",
      "fingerless gloves",
      "goggles around neck",
    ]
  ),
  character(
    "amara",
    "Dr. Amara Osei",
    "girl",
    ["scifi", "drama"],
    "graphic",
    "Lead xenobiologist on a station that has stopped answering Earth.",
    [
      "Black woman in her thirties",
      "deep dark brown skin",
      "close-cropped natural hair",
      "round glasses",
      "white lab coat over teal jumpsuit",
    ]
  ),
  character(
    "sir-ronan",
    "Sir Ronan",
    "boy",
    ["fantasy", "historical"],
    "color",
    "An old knight on one last errand, armoured more in habit than in steel.",
    [
      "man in his sixties",
      "grey beard",
      "crooked nose",
      "dented plate armour",
      "faded red surcoat",
    ]
  ),
  character(
    "mika",
    "Mika Tanaka",
    "girl",
    ["slice", "comedy"],
    "anime",
    "A convenience-store night clerk with strong opinions about everyone who comes in at 3 a.m.",
    [
      "woman in her twenties",
      "dyed pink bob",
      "tired smile",
      "striped store uniform",
      "name tag",
    ]
  ),
  character(
    "rook",
    "Rook",
    "other",
    ["action", "crime"],
    "color",
    "A masked vigilante nobody has seen without the helmet. Possibly several people.",
    [
      "masked urban vigilante",
      "smooth round grey motorcycle helmet with one horizontal white light strip",
      "no ears on the helmet",
      "no cape",
      "weathered olive utility coat",
      "red scarf",
    ]
  ),
  character(
    "elena",
    "Elena Vasquez",
    "girl",
    ["romance", "drama"],
    "color",
    "A chef taking over the family restaurant, and everything that comes with it.",
    [
      "woman in her early thirties",
      "long dark curly hair tied back",
      "warm brown eyes",
      "white chef jacket with rolled sleeves",
    ]
  ),
  character(
    "theo",
    "Theo Laurent",
    "boy",
    ["romance", "slice"],
    "graphic",
    "A bookshop owner whose love letters are better than his timing.",
    [
      "man in his thirties",
      "wavy auburn hair",
      "stubble",
      "wearing a mustard knitted cardigan over a white shirt",
    ]
  ),
  character(
    "zhara",
    "Zhara the Unbound",
    "girl",
    ["fantasy", "action"],
    "color",
    "A desert sorceress who burned her guild's charter, and then the guild.",
    [
      "woman in her thirties",
      "bronze skin",
      "long braided white hair",
      "gold eye paint",
      "wearing heavy layered indigo blue robes",
      "glowing gold runes on bare forearms",
    ]
  ),
  character(
    "hollis",
    "Agent Hollis",
    "boy",
    ["crime", "historical"],
    "noir",
    "A 1950s government man who knows exactly which files have gone missing.",
    [
      "man in his fifties",
      "square jaw",
      "slicked grey hair",
      "dark suit",
      "fedora",
      "narrow tie",
    ]
  ),
  character(
    "june",
    "June Park",
    "girl",
    ["action", "comedy"],
    "retro",
    "A stunt double who is much tougher than the stars she stands in for.",
    [
      "woman in her late twenties",
      "high ponytail",
      "bandage on cheek",
      "red racing jacket",
      "white tank top",
    ]
  ),
  character(
    "ogun",
    "Captain Ogun",
    "boy",
    ["scifi", "action"],
    "graphic",
    "Veteran captain of a salvage freighter, and the only person who knows how it still flies.",
    [
      "man in his fifties",
      "dark skin",
      "white beard",
      "eyepatch",
      "worn navy flight coat with brass buttons",
    ]
  ),

  // Creatures
  character(
    "mothwarden",
    "The Mothwarden",
    "other",
    ["horror", "fantasy"],
    "noir",
    "It tends the lamps in the old forest. Do not let yours go out.",
    [
      "tall gaunt forest spirit",
      "antlered moth skull head",
      "tattered dust-grey wings",
      "many thin arms holding lanterns",
    ]
  ),
  character(
    "gearhound",
    "Gearhound",
    "other",
    ["scifi", "comedy"],
    "color",
    "A scrap-built robot dog, loyal to whoever last fed it batteries.",
    [
      "small robot dog",
      "mismatched scrap metal plates",
      "one glowing blue eye",
      "antenna tail",
      "exposed gears",
    ]
  ),
  character(
    "ember-drake",
    "Ember Drake",
    "other",
    ["fantasy", "action"],
    "color",
    "A cat-sized dragon with a horse-sized temper.",
    [
      "tiny dragon",
      "charcoal scales",
      "glowing orange cracks",
      "oversized wings",
      "smoke from nostrils",
    ]
  ),
  character(
    "deepwatcher",
    "Deepwatcher",
    "other",
    ["horror", "scifi"],
    "graphic",
    "Whatever answered the station's distress call.",
    [
      "huge deep sea creature",
      "translucent body",
      "bioluminescent teal veins",
      "dozens of pale eyes",
      "long drifting tendrils",
    ]
  ),

  // Outfits
  {
    id: "outfit-streetwear",
    kind: "outfit",
    name: "Neon Streetwear",
    description:
      "An oversized techwear shell, cargo straps and reflective trim.",
    genres: ["scifi", "action"],
    art: "color",
    payload: {
      type: "outfit",
      tags: [
        "oversized black techwear jacket",
        "reflective trim",
        "cargo straps",
        "chunky sneakers",
      ],
    },
  },
  {
    id: "outfit-gala",
    kind: "outfit",
    name: "Black-Tie Gala",
    description: "A sharp evening look for the scene where everyone is lying.",
    genres: ["crime", "romance"],
    art: "graphic",
    payload: {
      type: "outfit",
      tags: [
        "elegant black evening wear",
        "tailored silhouette",
        "silver cufflinks",
        "polished shoes",
      ],
    },
  },
  {
    id: "outfit-armor",
    kind: "outfit",
    name: "Wayfarer's Armour",
    description:
      "Leather and patched mail, built for walking rather than parades.",
    genres: ["fantasy", "historical"],
    art: "color",
    payload: {
      type: "outfit",
      tags: [
        "worn leather armour",
        "patched chainmail",
        "hooded travelling cloak",
        "tall boots",
      ],
    },
  },
  {
    id: "outfit-spacesuit",
    kind: "outfit",
    name: "Deep-Space EVA Suit",
    description:
      "A bulky orange work suit with scuffed plating and a mirrored visor.",
    genres: ["scifi"],
    art: "graphic",
    payload: {
      type: "outfit",
      tags: [
        "bulky orange EVA spacesuit",
        "scuffed white plating",
        "mirrored helmet visor",
        "tool harness",
      ],
    },
  },
  {
    id: "outfit-office",
    kind: "outfit",
    name: "Monday Office Wear",
    description:
      "Lanyard, creased shirt, and the quiet despair of a 9 a.m. stand-up.",
    genres: ["comedy", "slice"],
    art: "retro",
    payload: {
      type: "outfit",
      tags: [
        "creased business shirt",
        "loosened tie",
        "company lanyard",
        "grey slacks",
      ],
    },
  },

  // Locations
  world(
    "location",
    "rain-alley",
    "Neon Rain Alley",
    ["scifi", "crime"],
    "color",
    "Wet asphalt, stacked signs and steam from a noodle stall.",
    [
      "narrow neon-lit city alley at night",
      "rain-soaked asphalt reflecting pink and blue light",
      "blank glowing shop signs",
      "steam from a street food stall",
      "tangled overhead cables",
    ]
  ),
  world(
    "location",
    "precinct",
    "Precinct, 3 a.m.",
    ["crime", "drama"],
    "noir",
    "Files, stale coffee and blinds cutting the light into bars.",
    [
      "old police squad room",
      "cluttered wooden desks",
      "filing cabinets",
      "venetian blinds",
      "single desk lamp",
    ]
  ),
  world(
    "location",
    "station-bridge",
    "Salvage Ship Bridge",
    ["scifi"],
    "graphic",
    "Patched consoles, taped-up warnings, and a view of nothing at all.",
    [
      "cramped spaceship bridge",
      "patched control consoles",
      "exposed cables",
      "large viewport onto stars",
    ]
  ),
  world(
    "location",
    "castle-hall",
    "Hall of the Fallen King",
    ["fantasy", "historical"],
    "color",
    "A ruined throne room that the forest is slowly taking back.",
    [
      "ruined stone throne hall",
      "broken pillars",
      "ivy and tree roots",
      "shafts of light through collapsed roof",
    ]
  ),
  world(
    "location",
    "konbini",
    "Convenience Store",
    ["slice", "comedy"],
    "anime",
    "Fluorescent aisles, the hum of drinks fridges, a door chime.",
    [
      "japanese convenience store interior",
      "bright fluorescent aisles",
      "drinks fridges",
      "magazine rack",
      "checkout counter",
    ]
  ),
  world(
    "location",
    "rooftop",
    "Rooftop at Dusk",
    ["romance", "drama"],
    "anime",
    "Water tanks, string lights and the whole city going gold.",
    [
      "city apartment rooftop at dusk",
      "water tanks",
      "string lights",
      "golden skyline",
      "laundry lines",
    ]
  ),
  world(
    "location",
    "bistro",
    "Corner Bistro",
    ["romance", "slice"],
    "color",
    "Chalkboard menus, a zinc bar and a table for two in the window.",
    [
      "cosy corner bistro",
      "zinc bar",
      "chalkboard menu",
      "small round tables",
      "warm pendant lamps",
      "large front window",
    ]
  ),
  world(
    "location",
    "hospital",
    "Empty Hospital Ward",
    ["horror", "drama"],
    "noir",
    "Curtains on rails, one flickering light, and no staff anywhere.",
    [
      "abandoned hospital ward",
      "rows of metal beds",
      "curtains on rails",
      "one flickering ceiling light",
      "long dark corridor",
    ]
  ),
  world(
    "location",
    "desert-city",
    "City of Salt",
    ["fantasy", "action"],
    "color",
    "Terraced domes and market awnings on the edge of a white desert.",
    [
      "ancient desert city",
      "terraced sandstone domes",
      "colourful market awnings",
      "white salt flats beyond",
    ]
  ),
  world(
    "location",
    "school-hall",
    "Corridor After Hours",
    ["drama", "horror"],
    "anime",
    "Lockers, long shadows and the last of the evening sun.",
    [
      "empty building corridor at sunset",
      "rows of lockers",
      "long orange light through windows",
      "polished floor",
    ]
  ),
  world(
    "location",
    "subway",
    "Last Train",
    ["crime", "drama"],
    "graphic",
    "An almost empty carriage, swaying through the dark.",
    [
      "almost empty subway carriage at night",
      "poles and hanging straps",
      "fluorescent light",
      "dark windows",
    ]
  ),
  world(
    "location",
    "harbor-1920",
    "Harbour, 1924",
    ["historical", "crime"],
    "retro",
    "Steamers, crates and fog thick enough to hide a body in.",
    [
      "1920s harbour docks",
      "steamship",
      "stacked wooden crates",
      "cranes",
      "morning fog",
    ]
  ),

  // Backgrounds
  {
    id: "bg-speedlines",
    kind: "background",
    name: "Radial Speed Burst",
    description:
      "Pure impact: ink lines exploding from the centre of the panel.",
    genres: ["action"],
    art: "noir",
    payload: {
      type: "backdrop",
      tags: [
        "radial speed lines background",
        "black ink on white",
        "focus lines",
      ],
    },
  },
  {
    id: "bg-storm-sky",
    kind: "background",
    name: "Storm Front",
    description: "Towering clouds for reveals, arrivals and bad news.",
    genres: ["fantasy", "drama"],
    art: "color",
    payload: {
      type: "backdrop",
      tags: [
        "dramatic storm clouds",
        "lightning on the horizon",
        "towering cumulonimbus",
        "no characters",
      ],
    },
  },
  {
    id: "bg-sakura",
    kind: "background",
    name: "Falling Petals",
    description: "Soft pink drift for confessions and goodbyes.",
    genres: ["romance", "slice"],
    art: "anime",
    payload: {
      type: "backdrop",
      tags: [
        "one seamless pale pink sky filled with drifting cherry blossom petals",
        "dreamy blur",
      ],
    },
  },
  {
    id: "bg-halftone-sun",
    kind: "background",
    name: "Halftone Sunburst",
    description: "Retro pop rays, for when the moment deserves a shout.",
    genres: ["comedy", "action"],
    art: "retro",
    payload: {
      type: "backdrop",
      tags: [
        "retro sunburst rays",
        "halftone dot pattern",
        "yellow and red",
        "no characters",
      ],
    },
  },
  {
    id: "bg-starfield",
    kind: "background",
    name: "Deep Starfield",
    description: "Nebula dust and cold distance.",
    genres: ["scifi"],
    art: "graphic",
    payload: {
      type: "backdrop",
      tags: [
        "deep space starfield",
        "violet nebula dust",
        "distant galaxy",
        "no characters",
      ],
    },
  },
  {
    id: "bg-ink-wash",
    kind: "background",
    name: "Ink Wash Mist",
    description: "Sumi-e mountains that dissolve into white.",
    genres: ["historical", "fantasy"],
    art: "noir",
    payload: {
      type: "backdrop",
      tags: [
        "one seamless sumi-e ink wash landscape of misty mountains",
        "empty white paper",
      ],
    },
  },
  {
    id: "bg-static",
    kind: "background",
    name: "Dread Static",
    description:
      "Scratched black texture for the panel you can't look away from.",
    genres: ["horror"],
    art: "noir",
    payload: {
      type: "backdrop",
      tags: [
        "black scratchy ink texture",
        "chaotic hatching",
        "unsettling abstract shapes",
        "no characters",
      ],
    },
  },

  // Props
  world(
    "prop",
    "cursed-blade",
    "Sunken Blade",
    ["fantasy"],
    "color",
    "An old sword that hums when someone nearby is lying.",
    [
      "ornate ancient sword",
      "dark barnacled blade",
      "faint teal glow along the fuller",
    ]
  ),
  world(
    "prop",
    "evidence-box",
    "Box 417",
    ["crime"],
    "noir",
    "The cold case nobody was supposed to reopen.",
    [
      "plain brown cardboard archive box with no markings",
      "tied with string",
      "red wax seal",
    ]
  ),
  world(
    "prop",
    "hover-bike",
    "Courier Motorbike",
    ["scifi", "action"],
    "color",
    "Fast, illegal, and held together with cable ties.",
    ["battered orange sport motorcycle", "delivery crate on back"]
  ),
  world(
    "prop",
    "love-letter",
    "Unsent Letter",
    ["romance", "drama"],
    "anime",
    "Sealed, addressed, and carried around for six years.",
    [
      "cream envelope",
      "red wax seal",
      "worn creased corners",
      "handwriting on front",
    ]
  ),
  world(
    "prop",
    "camera",
    "Rangefinder Camera",
    ["drama", "historical"],
    "graphic",
    "The last roll of film is still in it.",
    ["vintage rangefinder camera", "worn brown leather strap", "brass details"]
  ),
  world(
    "prop",
    "lantern",
    "Warden's Lantern",
    ["horror", "fantasy"],
    "noir",
    "Its flame leans towards whoever is about to die.",
    ["old iron lantern", "pale flame", "chain handle", "cracked glass"]
  ),
  world(
    "prop",
    "phone",
    "Burner Phone",
    ["crime", "action"],
    "graphic",
    "One contact. One missed call.",
    ["cheap black flip phone", "cracked screen", "tape around the hinge"]
  ),

  // Styles
  style(
    "style-ink-noir",
    "Rain-Slick Noir",
    ["crime", "drama"],
    "Near-solid blacks, rain hatching, and light only where it hurts.",
    "noir",
    null,
    "balanced",
    "(chiaroscuro:1.3), rain, venetian blind shadows, ink wash",
    "Deep chiaroscuro, rain drawn as fine white strokes, slatted window shadows.",
    "bright, cheerful"
  ),
  style(
    "style-pop-90s",
    "90s Newsstand",
    ["action", "comedy"],
    "Loud halftones and a four-colour printing press running hot.",
    "retro",
    "red",
    "vivid",
    "(ben-day dots:1.2), misregistered print, dynamic foreshortening",
    "Visible Ben-Day dots, slightly misregistered four-colour printing, dynamic foreshortening."
  ),
  style(
    "style-shojo",
    "Soft Shōjo",
    ["romance", "slice"],
    "Airy screentones, sparkling eyes, flowers in the margins.",
    "anime",
    "pink",
    "muted",
    "shoujo manga, screentones, sparkles, soft linework, floral background",
    "Delicate shōjo manga linework, soft screentones, sparkles and floral motifs.",
    "heavy shadows"
  ),
  style(
    "style-gekiga",
    "Gekiga Grit",
    ["drama", "crime", "historical"],
    "Scratchy Japanese pen work with adult weight.",
    "noir",
    null,
    "balanced",
    "gekiga, scratchy pen lines, heavy crosshatching, realistic proportions",
    "Gekiga manga: scratchy dip-pen lines, heavy crosshatching, realistic proportions."
  ),
  style(
    "style-ligne",
    "Ligne Claire",
    ["comedy", "historical"],
    "Even outlines and clean flats in the European album tradition.",
    "color",
    "aqua",
    "balanced",
    "ligne claire, uniform line weight, clean flat color, detailed backgrounds",
    "Ligne claire: perfectly even outlines, clean flat colours, no hatching, detailed backgrounds.",
    "crosshatching, heavy shadows"
  ),
  style(
    "style-pulp",
    "Pulp Paperback",
    ["crime", "scifi"],
    "Painted covers, sweaty faces and an ominous orange sky.",
    "retro",
    "orange",
    "vivid",
    "pulp magazine cover, gouache painting, dramatic pose",
    "Mid-century pulp cover painting in gouache, dramatic composition, aged paper."
  ),
  style(
    "style-woodcut",
    "Dark Woodcut",
    ["horror", "fantasy"],
    "Carved lines and a lot of black. Feels like a warning.",
    "noir",
    null,
    "balanced",
    "woodcut print, linocut, carved lines, bold negative space",
    "Woodcut print with carved lines, bold negative space and rough ink texture."
  ),
  style(
    "style-watercolor",
    "Sketchbook Wash",
    ["slice", "romance"],
    "Loose pencil and watercolour bleeding past the edges.",
    "color",
    "sepia",
    "muted",
    "watercolor, pencil sketch, paper texture, loose linework",
    "Loose pencil sketch with watercolour washes bleeding past the lines, on textured paper.",
    "black outline"
  ),
  style(
    "style-synthwave",
    "Chrome Sunset",
    ["scifi", "action"],
    "Magenta horizon, teal shadows, glowing edges.",
    "color",
    "purple",
    "vivid",
    "synthwave, neon glow, chromatic aberration, magenta and teal",
    "Synthwave palette of magenta and teal, neon rim glow, slight chromatic aberration."
  ),

  // Shots
  direction(
    "shot",
    "shot-low-hero",
    "Low-Angle Hero",
    "Camera at the ankles. Instantly makes anyone a problem.",
    ["from below", "full body", "dramatic foreshortening"],
    "Seen from very low, towering over the viewer."
  ),
  direction(
    "shot",
    "shot-extreme-close",
    "Extreme Close-Up",
    "Just the eyes. Save it for the moment that matters.",
    ["extreme close-up", "eyes focus", "face in shadow"]
  ),
  direction(
    "shot",
    "shot-establishing",
    "Wide Establishing",
    "Place first, people second. Starts a scene.",
    ["very wide shot", "tiny figure in vast environment", "scenery focus"]
  ),
  direction(
    "shot",
    "shot-dutch",
    "Dutch Tilt",
    "The horizon slips and so does everything else.",
    ["dutch angle", "tilted horizon", "tension"]
  ),
  direction(
    "shot",
    "shot-over-shoulder",
    "Over the Shoulder",
    "Put the reader inside the conversation.",
    ["over-the-shoulder shot", "conversation", "depth of field"]
  ),
  direction(
    "shot",
    "shot-birdseye",
    "Bird's Eye",
    "From directly above: maps, chases, and lonely people.",
    ["from above", "top-down view", "dramatic perspective"]
  ),

  // Lighting
  direction(
    "lighting",
    "light-rim",
    "Neon Rim Light",
    "Coloured edges on a dark figure.",
    ["rim lighting", "neon lights", "dark background"]
  ),
  direction(
    "lighting",
    "light-golden",
    "Golden Hour",
    "Everything forgiven for twenty minutes.",
    ["golden hour", "warm sunlight", "long shadows", "lens flare"]
  ),
  direction(
    "lighting",
    "light-under",
    "Under-Lit Dread",
    "Campfire-story light from below the chin.",
    ["lit from below", "dramatic lighting", "deep shadows on face"]
  ),
  direction(
    "lighting",
    "light-blinds",
    "Venetian Blinds",
    "Bars of light across a face with something to hide.",
    ["venetian blind shadows", "striped light", "dim room"]
  ),
  direction(
    "lighting",
    "light-screen",
    "Screen Glow",
    "Blue light in a dark room at 2:14 a.m.",
    ["screen light", "blue glow on face", "dark room"]
  ),

  // Poses
  direction(
    "pose",
    "pose-superhero",
    "Three-Point Landing",
    "Fist down, one knee bent. Yes, it's a cliché, and it works.",
    ["superhero landing", "one knee down", "fist on ground", "cracked ground"],
    "Landing hard in a crouch, one fist on the ground."
  ),
  direction(
    "pose",
    "pose-standoff",
    "Standoff",
    "Two people, ten metres, no one blinking.",
    ["two characters facing each other", "standoff", "tense stance"],
    "Two figures face each other in silence, ready to move."
  ),
  direction(
    "pose",
    "pose-running",
    "Full Sprint",
    "Leaning into the run with the coat flying.",
    ["running", "dynamic pose", "motion blur", "clothes flying"],
    "Sprinting towards the camera at full speed."
  ),
  direction(
    "pose",
    "pose-collapse",
    "On Their Knees",
    "The panel after the worst news of their life.",
    ["kneeling", "head down", "hands on floor", "despair"],
    "On their knees, head bowed, everything gone."
  ),
  direction(
    "pose",
    "pose-reach",
    "Reaching Out",
    "A hand stretched towards someone just out of range.",
    ["reaching out", "outstretched arm", "foreshortening"],
    "Reaching out towards the viewer, fingers spread."
  ),

  // Effects
  direction(
    "effect",
    "fx-impact",
    "Impact Frame",
    "A black-and-white flash at the moment of the hit.",
    ["impact frame", "inverted colors", "emphasis lines", "shockwave"]
  ),
  direction(
    "effect",
    "fx-rain",
    "Hard Rain",
    "Diagonal rain, splashes and soaked clothes.",
    ["heavy rain", "wet clothes", "water splashes"]
  ),
  direction(
    "effect",
    "fx-smoke",
    "Rolling Smoke",
    "Cover for entrances and exits.",
    ["thick smoke", "drifting embers", "volumetric haze"]
  ),
  direction(
    "effect",
    "fx-glitch",
    "Signal Glitch",
    "Reality tearing into scanlines.",
    ["glitch effect", "scanlines", "chromatic aberration", "digital noise"]
  ),
  direction(
    "effect",
    "fx-sparkle",
    "Sparkle Bloom",
    "Soft flares and floating motes.",
    ["sparkles", "light particles", "soft bloom"]
  ),

  // Lettering
  sfx(
    "sfx-krak",
    "KRAK!",
    "Bone, wood or a bad decision.",
    ["action"],
    "bangers",
    "#facc15",
    "#111111"
  ),
  sfx(
    "sfx-whoosh",
    "WHOOSH",
    "Something passed. You missed it.",
    ["action", "scifi"],
    "bangers",
    "#38bdf8",
    "#0c1a2b"
  ),
  sfx(
    "sfx-doki",
    "DOKI DOKI",
    "A heartbeat you can read.",
    ["romance"],
    "comic",
    "#f472b6",
    "#ffffff"
  ),
  sfx(
    "sfx-boom",
    "BOOOM!",
    "Fill the slide. Mean it.",
    ["action", "comedy"],
    "bangers",
    "#f97316",
    "#7f1d1d"
  ),
  sfx(
    "sfx-creak",
    "creak…",
    "Small letters. Something is on the stairs.",
    ["horror"],
    "comic",
    "#e5e7eb",
    "#111111"
  ),
  sfx(
    "sfx-bzzt",
    "BZZT",
    "Failing electrics and failing plans.",
    ["scifi", "comedy"],
    "inter",
    "#a3e635",
    "#1a2e05"
  ),

  // Story templates
  story(
    "story-heist",
    "One Last Job",
    ["crime", "action"],
    "graphic",
    "A six-slide heist: the crew, the plan, the betrayal, the twist.",
    "",
    "A retired thief is pulled back for one last job. Slide 1: the offer they can't refuse. Slide 2: the crew. Slide 3: the plan, told over the image of it going right. Slide 4: it goes wrong. Slide 5: one of the crew was never on their side. Slide 6: the twist, the thief planned for that."
  ),
  story(
    "story-meet-cute",
    "Wrong Coffee",
    ["romance", "comedy"],
    "anime",
    "Five slides of near-misses that end on a phone number.",
    "two adults reaching for the same paper coffee cup on a sunny cafe counter, their hands almost touching",
    "Two strangers keep being handed each other's coffee order. Slide 1: first mix-up. Slide 2: the second, they notice. Slide 3: an awkward conversation about oat milk. Slide 4: one stops coming. Slide 5: a number written on the cup."
  ),
  story(
    "story-found-footage",
    "The Last Log",
    ["horror", "scifi"],
    "noir",
    "Told through a crew's final messages. Each one is worse.",
    "a lone adult in a spacesuit floating in a dark corridor of a derelict station, a vast shape moving behind the window",
    "The final log entries of a remote crew. Each slide is one message with a date, and each is calmer and stranger than the one before. In the last, the handwriting is not theirs.",
    ["Nothing is ever shown directly until the last slide."]
  ),
  story(
    "story-chosen",
    "The Refusal",
    ["fantasy", "comedy"],
    "color",
    "A prophecy finds the wrong person, who has plans this weekend.",
    "a tired adult baker in a flour-dusted apron facing a line of hooded robed monks kneeling in a village bakery",
    "An ancient order tells a tired baker they are the chosen one. They decline. Slide by slide, the order's offers get more desperate, until the baker agrees on one condition."
  ),
  story(
    "story-explainer",
    "Explain It in Six",
    ["slice", "comedy"],
    "retro",
    "A carousel template that teaches one idea through a running gag.",
    "an adult office worker at a whiteboard covered in tangled arrows, buried in sticky notes, looking confused",
    "Teach one idea in six slides. Slide 1: a hook posed as a question. Slides 2 to 4: a character gets it wrong in three escalating ways. Slide 5: the actual idea, in one line. Slide 6: the character applies it, and a callback joke."
  ),
  story(
    "story-revenge",
    "Seven Names",
    ["action", "drama", "historical"],
    "noir",
    "A list, a blade, and a price that goes up with every name.",
    "a lone cloaked wanderer with a sword walking a snowy mountain road at dusk, seen from behind",
    "A wanderer carries a list of seven names. The carousel follows the last name on it, and the moment the wanderer learns who wrote the list."
  ),
]

// What some pictures show, where the tags alone draw the wrong thing.
const SCENES: Record<string, string> = {
  "shot-extreme-close":
    "extreme close-up filling the whole frame with one adult woman's narrowed eyes and brow, rain on her skin, nothing else visible",
  "shot-low-hero":
    "worm's eye view from ground level looking steeply up at an adult woman in a long dark coat towering over the viewer against a night sky",
  "shot-over-shoulder":
    "view from behind a man's blurred shoulder in the foreground, looking at an adult woman in a long coat facing him in the rain",
  "shot-dutch":
    "steeply tilted camera, the whole street and horizon leaning thirty degrees, an adult woman in a long dark coat on a rainy pavement",
  "fx-impact":
    "an inverted black and white shockwave of ink lines bursting outward from the centre of a cracked concrete wall, flying debris",
  "story-heist":
    "four adult thieves in dark clothes crouched around a blueprint on a warehouse floor under one hanging lamp, silent",
}

for (const s of SEED) s.scene ??= SCENES[s.id]

// Rook is a person, whatever is under the helmet.
SEED.find((s) => s.id === "rook")!.kind = "character"

export const PACKS: Pack[] = [
  {
    id: "noir-city",
    name: "Rain City Noir",
    blurb: "A detective, a precinct and the case that won't stay closed.",
    assets: [
      "style-ink-noir",
      "vale",
      "precinct",
      "rain-alley",
      "evidence-box",
      "light-blinds",
      "fx-rain",
    ],
  },
  {
    id: "derelict",
    name: "Derelict Station",
    blurb: "Hard sci-fi horror, from the bridge to whatever is out there.",
    assets: [
      "style-synthwave",
      "ogun",
      "amara",
      "deepwatcher",
      "station-bridge",
      "bg-starfield",
      "story-found-footage",
    ],
  },
  {
    id: "corner-table",
    name: "Table for Two",
    blurb: "A soft romance kit with a bistro, a bookshop owner and bad timing.",
    assets: [
      "style-watercolor",
      "elena",
      "theo",
      "bistro",
      "rooftop",
      "love-letter",
      "light-golden",
      "story-meet-cute",
    ],
  },
  {
    id: "salt-kingdom",
    name: "Salt & Sorcery",
    blurb: "Sword-and-sorcery with a burned guild and a very small dragon.",
    assets: [
      "style-pulp",
      "zhara",
      "sir-ronan",
      "ember-drake",
      "desert-city",
      "castle-hall",
      "cursed-blade",
    ],
  },
  {
    id: "night-shift",
    name: "Night Shift Comedy",
    blurb: "Everything you need for a 3 a.m. convenience-store sitcom.",
    assets: [
      "style-ligne",
      "mika",
      "konbini",
      "light-screen",
      "sfx-bzzt",
      "story-explainer",
    ],
  },
  {
    id: "chase",
    name: "Neon Chase",
    blurb: "Bikes, rain, drones and a very expensive delivery.",
    assets: [
      "style-pop-90s",
      "kaito",
      "rain-alley",
      "hover-bike",
      "shot-low-hero",
      "pose-running",
      "sfx-whoosh",
    ],
  },
]

const IMAGELESS: AssetKind[] = ["sfx"]

export function seedImage(s: Pick<SeedAsset, "id" | "kind">) {
  return IMAGELESS.includes(s.kind) ? null : `/catalog/${s.id}.webp`
}

// The official assets as the catalog shows them. Counts come from the database.
export const OFFICIAL: Asset[] = SEED.map((s) => ({
  ...s,
  color: ((colors as Record<string, string>)[s.id] ??
    null) as AssetColor | null,
  image: seedImage(s),
  payload:
    s.payload.type === "character"
      ? { ...s.payload, sheet: `/catalog/${s.id}-sheet.webp` }
      : s.payload,
  official: true,
  keywords: s.art,
  author: null,
  saves: 0,
  uses: 0,
  createdAt: "2026-10-30T00:00:00.000Z",
}))
