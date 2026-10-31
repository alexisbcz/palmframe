import { MAX_ITEMS, https } from "./feeds"
import type { Feed, Item } from "./model"
import type { Stance } from "./stance"

// Public datasets a machine can read. Owners pick an id and nothing else: the
// address, the fields and the filters all live here, so this adds no fetch surface
// of theirs, and a licence is checked in code rather than remembered.
export const DATASET_STATUSES = ["confirmed", "terms unread"] as const
export type DatasetStatus = (typeof DATASET_STATUSES)[number]

// What people a dataset can bring in. `unproven` is an exclusion nobody has shown
// working, and it blocks the dataset whatever its licence says.
export type DatasetPeople = "none" | "screened" | "public figures" | "unproven"

export interface DatasetLicence {
  name: string
  url: string
  // When someone read the terms on the source's own page.
  checked: string
}

export interface DatasetAttribution {
  // The short credit: an item's source, and the end of its post.
  source: string
  // In the words the licence or publisher asks for, so it stays in their language
  // instead of going through the page's translations.
  statement: string
  url: string
  // The licence wants the date the data was last updated next to the credit.
  dated: boolean
}

export interface DatasetFilter {
  field: string
  // The field is exactly one of these.
  equals?: readonly string[]
  // Or it mentions one of these, in the sense of `mentions`.
  mentions?: readonly string[]
}

export interface DatasetRow {
  // What identifies the thing, across every row that describes it.
  id: string
  // Its current state. When this changes the row counts as new again.
  state: string
  title: string
  summary: string
  url: string
}

export type DatasetFields = Record<string, unknown>

export interface Dataset {
  status: DatasetStatus
  licence: DatasetLicence | null
  attribution: DatasetAttribution | null
  // What may be fetched, on every hop.
  hosts: readonly string[]
  // What an item may link to.
  linkHosts: readonly string[]
  url: string
  // The only fields a row keeps. Anything else is gone before any other code here
  // sees the row, so an address or a petitioner's name can't reach a post.
  fields: readonly string[]
  // A dataset with no new row for this long may have died without saying so.
  quietDays: number
  include: readonly DatasetFilter[]
  // Dropped when any of `in` mentions one of `terms`.
  exclude: { in: readonly string[]; terms: readonly string[] }
  // Whether the licence lets a post repeat the source's wording.
  verbatim: boolean
  people: DatasetPeople
  // Which key of the response holds the rows.
  rows: string
  // Null until someone has reason to write it.
  build: ((row: DatasetFields) => DatasetRow | null) | null
  // A last screen on a kept row, for what a term list can't say.
  screen?: (row: DatasetFields) => boolean
}

const text = (v: unknown) =>
  typeof v === "string" ? v.replace(/\s+/g, " ").trim() : ""

const fold = (s: string) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()

const escaped = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

// Whether a word in the text starts with one of the terms, ignoring case and
// accents. So "migrant" also finds "migrants" and never "transmigrant".
export function mentions(value: string, terms: readonly string[]) {
  if (!terms.length) return false
  const pattern = terms.map((t) => escaped(fold(t))).join("|")
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${pattern})`, "u").test(
    fold(value)
  )
}

// Petition titles mostly start with an order, whose capital says nothing about
// names. Any other capitalized first word might be one.
const ORDERS = new Set(
  "abolish allow ban bring build cancel change create demand end fund get give hold introduce keep let lower make open protect raise reduce remove require restore return save scrap stop take tell".split(
    " "
  )
)
const WORD = String.raw`\p{Lu}[\p{L}'’-]+`
const HONORIFIC =
  /\b(?:Mr|Mrs|Ms|Miss|Dr|Sir|Dame|Lord|Lady|Prof|Professor|Councillor|Cllr|MP|King|Queen|Prince|Princess|President|Minister|Judge)\b/
const PAIRED = new RegExp(`${WORD}\\s+(?:and|&)\\s+${WORD}`, "u")
const ADJACENT = new RegExp(`${WORD}\\s+${WORD}`, "gu")
const POSSESSIVE = new RegExp(`${WORD}['’]s\\b`, "u")

// Whether a petition's title could be about a person. Crude on purpose, and it
// errs towards dropping: a false alarm costs one joke, and a miss puts a stranger
// in front of an audience. Shouting is dropped too, since it hides every name.
export function mayNameAPerson(title: string) {
  if (!/\p{Ll}/u.test(title) || HONORIFIC.test(title)) return true
  if (PAIRED.test(title) || POSSESSIVE.test(title)) return true
  const opener = title.match(/^\p{L}+/u)?.[0].toLowerCase() ?? ""
  return [...title.matchAll(ADJACENT)].some(
    (m) => m.index > 0 || !ORDERS.has(opener)
  )
}

const REJECTED_FIELDS = [
  "id",
  "attributes.action",
  "attributes.rejection.code",
  "attributes.rejected_at",
] as const

// These topics are never funny here. The same list holds hostile petitions about
// migrants and religion, seen in the live data, and people with real griefs.
const NEVER_THE_JOKE = [
  "mosque",
  "masjid",
  "muslim",
  "islam",
  "jew",
  "judais",
  "synagogue",
  "church",
  "christian",
  "catholic",
  "cathedral",
  "hindu",
  "sikh",
  "gurdwara",
  "buddhis",
  "relig",
  "halal",
  "kosher",
  "burqa",
  "hijab",
  "sharia",
  "quran",
  "koran",
  "bible",
  "migrant",
  "immigra",
  "refugee",
  "asylum",
  "small boat",
  "foreigner",
  "deport",
  "border",
  "illegal",
  "racis",
  "race",
  "ethnic",
  "gender",
  "transgender",
  "lgbt",
  "gay",
  "lesbian",
  "disab",
  "autis",
  "rape",
  "rapist",
  "sex",
  "abuse",
  "paedo",
  "pedo",
  "groom",
  "murder",
  "kill",
  "stab",
  "suicide",
  "death",
  "dead",
  "died",
  "cemetery",
  "burial",
  "grave",
  "funeral",
  "cancer",
  "hospital",
  "child",
  "baby",
  "election",
  "vote",
  "gaza",
  "israel",
  "palestin",
  "ukrain",
  "russia",
]

// In a recall these mean someone was hurt, someone vulnerable is the customer, or
// the story is an illness and not an object.
const NOBODY_HURT = [
  "injur",
  "illness",
  "death",
  "died",
  "hospital",
  "choking",
  "laceration",
  "allerg",
  "undeclared",
  "infant",
  "baby",
  "babies",
  "toddler",
  "formula",
  "listeria",
  "salmonel",
  "botul",
  "blessure",
  "blesse",
  "deces",
  "malade",
  "hospitalis",
  "intoxication",
  "bebe",
  "nourrisson",
  "tout petits",
  "croissance",
  "lait infantile",
  // Baby food by another name, as it turned up in the live data.
  "human milk",
  "milk bank",
  "puree",
  "pouch",
  // A toxic plant, filed by RappelConso with the objects.
  "morelle",
]

// What RappelConso's `inertes` category holds when it really is an object. It also
// files process failures there, with nothing in the food to report.
const AN_OBJECT = [
  "corps etranger",
  "verre",
  "metal",
  "plastique",
  "fragment",
  "morceau",
  "caillou",
  "pierre",
  "insecte",
]

const FDA_FIELDS = [
  "event_id",
  "classification",
  "recalling_firm",
  "reason_for_recall",
  "product_description",
  "report_date",
] as const

const RAPPEL_FIELDS = [
  "id",
  "numero_version",
  "date_publication",
  "categorie_produit",
  "marque_produit",
  "libelle",
  "motif_rappel",
  "risques_encourus",
  "lien_vers_la_fiche_rappel",
] as const

const rappelQuery = new URLSearchParams({
  where: 'categorie_produit="alimentation" AND risques_encourus like "inertes"',
  order_by: "date_publication desc",
  limit: "100",
  select: RAPPEL_FIELDS.join(","),
})

const ISO_DAY = /^\d{4}-\d{2}-\d{2}/
const compactDay = (s: string) =>
  /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : ""

// Confirmed by reading the source's own page. The dates say when.
const live = {
  rejectedBin: {
    status: "confirmed",
    licence: {
      name: "Open Government Licence v3.0",
      url: "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
      checked: "2026-10-31",
    },
    attribution: {
      source: "UK Parliament",
      statement:
        "Contains public sector information licensed under the Open Government Licence v3.0.",
      url: "https://petition.parliament.uk/",
      dated: false,
    },
    hosts: ["petition.parliament.uk"],
    linkHosts: ["petition.parliament.uk"],
    url: "https://petition.parliament.uk/petitions.json?state=rejected",
    fields: REJECTED_FIELDS,
    quietDays: 14,
    include: [{ field: "attributes.rejection.code", equals: ["irrelevant"] }],
    exclude: { in: ["attributes.action"], terms: NEVER_THE_JOKE },
    verbatim: true,
    people: "screened",
    rows: "data",
    screen: (row) => !mayNameAPerson(text(row["attributes.action"])),
    build: (row) => {
      const id = String(row.id ?? "")
      const title = text(row["attributes.action"])
      const code = text(row["attributes.rejection.code"])
      const day = text(row["attributes.rejected_at"]).match(ISO_DAY)?.[0]
      if (!/^\d+$/.test(id) || !title || !day) return null
      return {
        id,
        state: code,
        title,
        summary: `A petition to the UK Parliament, rejected on ${day}. Official category: ${code}.`,
        // Its page, since `links.self` is JSON. Rows have no other address.
        url: `https://petition.parliament.uk/petitions/${id}`,
      }
    },
  },
  foreignObject: {
    status: "confirmed",
    licence: {
      name: "CC0 1.0 Universal",
      url: "https://open.fda.gov/license/",
      checked: "2026-10-31",
    },
    attribution: {
      source: "FDA",
      // Credit isn't required, but openFDA asks for it. It also doesn't endorse this.
      statement:
        "Recall data from openFDA, U.S. Food and Drug Administration. Not endorsed by the FDA.",
      url: "https://open.fda.gov/apis/food/enforcement/",
      dated: false,
    },
    hosts: ["api.fda.gov"],
    linkHosts: ["api.fda.gov"],
    url: 'https://api.fda.gov/food/enforcement.json?search=reason_for_recall:(foreign+glass+metal+plastic+rubber+insect+rodent)+AND+classification:"Class+II"&sort=report_date:desc&limit=100',
    fields: FDA_FIELDS,
    // Three recalls a month at best, and the data lags by weeks.
    quietDays: 45,
    include: [{ field: "classification", equals: ["Class II"] }],
    exclude: {
      in: ["reason_for_recall", "product_description", "recalling_firm"],
      terms: NOBODY_HURT,
    },
    verbatim: true,
    people: "none",
    rows: "results",
    build: (row) => {
      const id = text(row.event_id)
      const title = text(row.reason_for_recall)
      const firm = text(row.recalling_firm)
      const product = text(row.product_description).slice(0, 220)
      const day = compactDay(text(row.report_date))
      if (!/^\d+$/.test(id) || !title || !firm || !product || !day) return null
      return {
        // One recall takes many rows, one per product.
        id,
        state: text(row.classification),
        title,
        summary: `${firm} recalled ${product}. ${text(row.classification)}, in the FDA enforcement report of ${day}.`,
        // The search for this one event: the record itself. Rows have no page of
        // their own that could be checked from here.
        url: `https://api.fda.gov/food/enforcement.json?search=event_id:${id}`,
      }
    },
  },
  rappelConso: {
    status: "confirmed",
    licence: {
      name: "Licence Ouverte v2.0 (Etalab)",
      url: "https://www.etalab.gouv.fr/licence-ouverte-open-licence",
      checked: "2026-10-31",
    },
    attribution: {
      source: "RappelConso",
      statement: "Source : RappelConso, DGCCRF, Licence Ouverte v2.0.",
      url: "https://data.economie.gouv.fr/explore/dataset/rappelconso-v2-gtin-espaces/",
      dated: true,
    },
    hosts: ["data.economie.gouv.fr"],
    linkHosts: ["rappel.conso.gouv.fr"],
    url: `https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/rappelconso-v2-gtin-espaces/records?${rappelQuery}`,
    fields: RAPPEL_FIELDS,
    quietDays: 21,
    include: [
      { field: "categorie_produit", equals: ["alimentation"] },
      // The category for objects: glass, metal, plastic, paper, textile.
      { field: "risques_encourus", mentions: ["inertes"] },
      { field: "motif_rappel", mentions: AN_OBJECT },
    ],
    exclude: {
      in: ["motif_rappel", "libelle", "marque_produit"],
      terms: NOBODY_HURT,
    },
    verbatim: true,
    people: "none",
    rows: "results",
    build: (row) => {
      const id = String(row.id ?? "")
      const title = text(row.motif_rappel)
      const product = text(row.libelle)
      const brand = text(row.marque_produit)
      const day = text(row.date_publication).match(ISO_DAY)?.[0]
      const url = text(row.lien_vers_la_fiche_rappel)
      if (!/^\d+$/.test(id) || !title || !product || !day || !url) return null
      const branded = !brand || brand === "sans marque" ? "" : `, ${brand}`
      return {
        id,
        // A notice that gets corrected comes back as a new version.
        state: `v${String(row.numero_version ?? 1)}`,
        title,
        summary: `Rappel : ${product}${branded}. Publié le ${day} sur RappelConso.`,
        url,
      }
    },
  },
} satisfies Record<string, Dataset>

// Nobody has read these terms, so they can't be picked: see `selectable`. They're
// listed to show what comes next, with the fields already narrowed to what a post
// could use. Wikipedia's text is CC BY-SA, but what blocks it is the living-people
// exclusion, which returned 0 of 4 when tried.
const unread = (d: {
  hosts: readonly string[]
  url: string
  fields: readonly string[]
  quietDays: number
  people: DatasetPeople
  exclude?: readonly string[]
}): Dataset => ({
  status: "terms unread",
  licence: null,
  attribution: null,
  hosts: d.hosts,
  linkHosts: d.hosts,
  url: d.url,
  fields: d.fields,
  quietDays: d.quietDays,
  include: [],
  exclude: { in: d.fields, terms: d.exclude ?? [] },
  verbatim: false,
  people: d.people,
  rows: "",
  build: null,
})

const waiting = {
  sweetOdor: unread({
    hosts: ["data.cityofnewyork.us"],
    url: "https://data.cityofnewyork.us/resource/erm2-nwe9.json",
    // Never `incident_address`: a complaint leads to somebody's door.
    fields: [
      "unique_key",
      "complaint_type",
      "descriptor",
      "incident_zip",
      "created_date",
    ],
    quietDays: 14,
    people: "none",
  }),
  yardSale: unread({
    hosts: ["api.gsa.gov"],
    url: "https://api.gsa.gov/assets/gsaauctions/v2/auctions",
    fields: [
      "saleNo",
      "lotNo",
      "itemName",
      "highBidAmount",
      "biddersCount",
      "aucEndDt",
      "itemDescURL",
    ],
    quietDays: 14,
    people: "none",
  }),
  auroraTonight: unread({
    hosts: ["services.swpc.noaa.gov"],
    url: "https://services.swpc.noaa.gov/products/alerts.json",
    fields: ["product_id", "issue_datetime", "message"],
    quietDays: 30,
    people: "none",
  }),
  mpInterests: unread({
    hosts: ["interests-api.parliament.uk"],
    url: "https://interests-api.parliament.uk/api/v1/Interests",
    fields: ["id", "summary", "registrationDate"],
    quietDays: 30,
    people: "public figures",
  }),
  federalRegister: unread({
    hosts: ["www.federalregister.gov"],
    url: "https://www.federalregister.gov/api/v1/public-inspection-documents/current.json",
    fields: ["document_number", "title", "html_url", "filed_at"],
    quietDays: 7,
    people: "none",
  }),
  secFilings: unread({
    hosts: ["efts.sec.gov"],
    url: "https://efts.sec.gov/LATEST/search-index",
    fields: ["adsh", "form", "file_date", "display_names"],
    quietDays: 7,
    people: "none",
  }),
  treasuryDebt: unread({
    hosts: ["api.fiscaldata.treasury.gov"],
    url: "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny",
    fields: ["record_date", "tot_pub_debt_out_amt"],
    quietDays: 7,
    people: "none",
  }),
  wikipediaReverts: unread({
    hosts: ["en.wikipedia.org"],
    url: "https://en.wikipedia.org/w/api.php",
    fields: ["pageid", "title", "tags", "timestamp"],
    quietDays: 7,
    people: "unproven",
    exclude: ["living people"],
  }),
  blsCalendar: unread({
    hosts: ["www.bls.gov"],
    url: "https://www.bls.gov/schedule/news_release/bls.ics",
    fields: ["uid", "summary", "dtstart"],
    quietDays: 30,
    people: "none",
  }),
  dojNews: unread({
    hosts: ["www.justice.gov"],
    url: "https://www.justice.gov/news/rss",
    fields: ["guid", "title", "link", "pubDate"],
    quietDays: 7,
    people: "unproven",
  }),
  ftcNews: unread({
    hosts: ["www.ftc.gov"],
    url: "https://www.ftc.gov/feeds/press-release.xml",
    fields: ["guid", "title", "link", "pubDate"],
    quietDays: 14,
    people: "none",
  }),
}

export const DATASETS = { ...live, ...waiting } as Record<
  keyof typeof live | keyof typeof waiting,
  Dataset
>
export type DatasetId = keyof typeof DATASETS

export const DATASET_IDS = Object.keys(DATASETS) as [DatasetId, ...DatasetId[]]

// The one question that matters. An empty licence or credit, or an exclusion
// nobody proved, blocks a dataset whatever its status field says.
export function selectable(dataset: Dataset) {
  const { status, licence, attribution, build, hosts, fields, people } = dataset
  return (
    status === "confirmed" &&
    !!licence?.name &&
    !!licence.url &&
    !!licence.checked &&
    !!attribution?.source &&
    !!attribution.statement &&
    !!build &&
    hosts.length > 0 &&
    fields.length > 0 &&
    people !== "unproven"
  )
}

export const OPEN_DATASETS = DATASET_IDS.filter((id) =>
  selectable(DATASETS[id])
)
export const CLOSED_DATASETS = DATASET_IDS.filter(
  (id) => !selectable(DATASETS[id])
)

// A row with only the allowed fields, flattened to their dotted names.
export function allowed(row: unknown, fields: readonly string[]) {
  const kept: DatasetFields = {}
  for (const field of fields) {
    let value = row
    for (const part of field.split("."))
      value =
        value && typeof value === "object"
          ? (value as Record<string, unknown>)[part]
          : undefined
    if (value !== undefined) kept[field] = value
  }
  return kept
}

function admitted(dataset: Dataset, row: DatasetFields) {
  const passes = dataset.include.every(({ field, equals, mentions: terms }) => {
    const value = text(row[field])
    return (
      (!equals || equals.includes(value)) && (!terms || mentions(value, terms))
    )
  })
  if (!passes) return false
  if (
    dataset.exclude.in.some((f) =>
      mentions(text(row[f]), dataset.exclude.terms)
    )
  )
    return false
  return dataset.screen?.(row) ?? true
}

const KEY_MAX = 300

// A short, stable tag for a state of any length.
function tag(state: string) {
  let hash = 5381
  for (const unit of state) hash = (hash * 33 + unit.charCodeAt(0)) >>> 0
  return hash.toString(36)
}

// A row's identity plus its state, so a row that changes reads as new with no
// other bookkeeping, and one that doesn't is never heard twice.
export function snapshotKey(id: DatasetId, row: string, state: string) {
  const plain = /^[\w. -]{1,40}$/.test(state) ? state : tag(state)
  return `dataset:${id}:${row}@${plain}`.slice(0, KEY_MAX)
}

export const isDatasetKey = (key: string) => key.startsWith("dataset:")

// `at` is when this was first seen, since these sources lag: the source's own date
// stays in the summary, so the agent can't take an old row for a new one. Filters
// run before the cap, and one recall of many rows comes out as one item. Null when
// the response isn't the shape this dataset has.
export function parseDataset(
  id: DatasetId,
  body: unknown,
  now: number
): Item[] | null {
  const dataset = DATASETS[id]
  const rows =
    body && typeof body === "object"
      ? (body as Record<string, unknown>)[dataset.rows]
      : undefined
  const { build, attribution } = dataset
  if (!Array.isArray(rows) || !build || !attribution) return null
  const items = new Map<string, Item>()
  for (const raw of rows) {
    const row = allowed(raw, dataset.fields)
    if (!admitted(dataset, row)) continue
    const built = build(row)
    const url = built && https(built.url)
    if (!built || !url) continue
    if (!dataset.linkHosts.includes(new URL(url).hostname)) continue
    const key = snapshotKey(id, built.id, built.state)
    if (items.has(key)) continue
    items.set(key, {
      key,
      source: attribution.source,
      title: built.title.slice(0, 500),
      summary: built.summary.slice(0, 600),
      url,
      at: now,
    })
  }
  return [...items.values()].slice(0, MAX_ITEMS)
}

const CREDITS = new Map(
  OPEN_DATASETS.flatMap((id) => {
    const source = DATASETS[id].attribution?.source
    return source ? [[source, source] as const] : []
  })
)

// The short credits a post has to carry, for what it stands on.
export const creditsFor = (sources: readonly { source: string }[] = []) => [
  ...new Set(sources.flatMap((s) => CREDITS.get(s.source) ?? [])),
]

export interface SourceCredit {
  id: DatasetId
  source: string
  statement: string
  url: string
  licence: string
  licenceUrl: string
  dated: boolean
}

// What a machine's public page and feed credit, for the datasets it reads.
export function attributionsFor(feeds: readonly unknown[] = []) {
  return feeds.flatMap((feed): SourceCredit[] => {
    const { kind, preset } = feed as { kind?: string; preset?: DatasetId }
    if (kind !== "dataset" || !preset) return []
    const { attribution, licence } = DATASETS[preset] ?? {}
    return attribution && licence
      ? [
          {
            id: preset,
            source: attribution.source,
            statement: attribution.statement,
            url: attribution.url,
            licence: licence.name,
            licenceUrl: licence.url,
            dated: attribution.dated,
          },
        ]
      : []
  })
}

// Profile feeds are the posts of whoever runs the profile, and nothing says that's
// a public figure, so they're left out instead of being a way to feature a stranger.
export function isSocialProfile(raw: string) {
  try {
    const { hostname, pathname } = new URL(raw)
    const host = hostname.toLowerCase()
    return (
      host === "bsky.app" ||
      host.endsWith(".bsky.social") ||
      host === "t.me" ||
      host === "telegram.me" ||
      host === "telegram.dog" ||
      /^\/@[^/]+(?:\/[^/]+)?\.rss$/.test(pathname) ||
      /^\/users\/[^/]+\.rss$/.test(pathname)
    )
  } catch {
    return false
  }
}

export type FeedRefusal = "social_feed" | "dataset_blocked" | "rival_rules"

// What a save refuses, as codes the page words. The runner checks again, because
// owners can write their config straight through the API.
export function feedRefusal(
  feeds: readonly Feed[],
  machine: { id?: string; public: boolean; usesDesk: boolean }
): FeedRefusal | null {
  for (const feed of feeds) {
    if (feed.kind === "rss" && isSocialProfile(feed.url)) return "social_feed"
    if (feed.kind === "dataset" && !selectable(DATASETS[feed.preset]))
      return "dataset_blocked"
    if (
      feed.kind === "rival" &&
      (feed.machine === machine.id || !machine.public || !machine.usesDesk)
    )
      return "rival_rules"
  }
  return null
}

// Sources for each stance. Which stop reads what is an editorial judgment, not a
// finding, and none of it can ship: every source here has unread terms, and the
// partisan foils were never picked, so no pack can be offered yet. All are US
// sources, so the French arena has no pack at all.
export const STANCE_PACKS: Record<Stance, readonly DatasetId[]> = {
  "far-left": ["secFilings", "ftcNews", "dojNews"],
  left: ["ftcNews", "dojNews", "blsCalendar"],
  center: ["federalRegister", "blsCalendar", "treasuryDebt"],
  right: ["treasuryDebt", "federalRegister", "blsCalendar"],
  "far-right": ["treasuryDebt", "dojNews", "federalRegister"],
}

// The sources keeping a stance's pack from being offered.
export const packBlockers = (stance: Stance) =>
  STANCE_PACKS[stance].filter((id) => !selectable(DATASETS[id]))
