import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { messages } from "@/routes/machines.messages"

import { editorFor, inboxBrief, toFiled } from "./agent.logic"
import {
  CLOSED_DATASETS,
  DATASETS,
  DATASET_IDS,
  OPEN_DATASETS,
  STANCE_PACKS,
  allowed,
  attributionsFor,
  creditsFor,
  feedRefusal,
  isSocialProfile,
  mayNameAPerson,
  mentions,
  packBlockers,
  parseDataset,
  selectable,
  snapshotKey,
} from "./datasets"
import { compose, takeRoom } from "./gate"
import {
  type Item,
  PRESETS,
  feedSchema,
  isReadable,
  machineConfig,
  machineInput,
} from "./model"
import { signOff } from "./signature"
import {
  MAX_SEEN,
  afterRead,
  feedHealth,
  feedKey,
  unseen,
} from "./source-state"
import { STANCES } from "./stance"

const NOW = Date.UTC(2026, 10, 1)

// Trimmed from responses fetched on 2026-10-31, with what a filter has to see left
// in, including the fields no post may ever use.
const petition = (
  id: number,
  action: string,
  code = "irrelevant",
  rejected = "2026-10-26T11:26:44.137Z"
) => ({
  type: "petition",
  id,
  links: { self: `https://petition.parliament.uk/petitions/${id}.json` },
  attributes: {
    action,
    background: "Everyone would be called Dennis.",
    additional_details: "Written by a member of the public.",
    state: "rejected",
    signature_count: 7,
    rejected_at: rejected,
    creator_name: "A Private Person",
    rejection: { code, details: "Not something Parliament can do." },
  },
})

const recall = (o: Record<string, string> = {}) => ({
  status: "Ongoing",
  city: "Saratoga Springs",
  classification: "Class II",
  event_id: "100041",
  recalling_firm: "Stewart's Shops Corp.",
  address_1: "461 Church St",
  postal_code: "12866-8649",
  recall_number: "H-0094-2027",
  product_description: "Stewarts Shops Vanilla Heavenly Medley 1/2 Gallon",
  product_quantity: "10,392 units",
  reason_for_recall: "Foreign object: May contain pieces of metal",
  report_date: "20261021",
  ...o,
})

const rappel = (o: Record<string, unknown> = {}) => ({
  id: 23963,
  numero_version: 1,
  date_publication: "2026-10-30T16:15:49+00:00",
  categorie_produit: "alimentation",
  marque_produit: "arla protein",
  libelle: "arla protein pudding chocolat",
  motif_rappel: "risque potentiel de présence de fragments de bris de verre.",
  risques_encourus: "inertes (verre, métal, plastique, papier, textile…)",
  numero_contact: "0471493081",
  distributeurs: "boutique de la coop",
  lien_vers_la_fiche_rappel:
    "https://rappel.conso.gouv.fr/fiche-rappel/23963/interne",
  ...o,
})

const titles = (items: Item[] | null) => items?.map((i) => i.title)

describe("the registry", () => {
  test("only the three confirmed sources can be picked", () => {
    assert.deepEqual(OPEN_DATASETS, [
      "rejectedBin",
      "foreignObject",
      "rappelConso",
    ])
  })

  test("everything else is closed, says why, and has nothing to credit", () => {
    assert.equal(CLOSED_DATASETS.length, 11)
    for (const id of CLOSED_DATASETS) {
      const dataset = DATASETS[id]
      assert.equal(dataset.status, "terms unread", id)
      assert.equal(dataset.licence, null, id)
      assert.equal(dataset.build, null, id)
    }
  })

  test("every open dataset carries what its licence needs", () => {
    for (const id of OPEN_DATASETS) {
      const { licence, attribution, hosts, fields, url } = DATASETS[id]
      assert.ok(licence?.checked, id)
      assert.ok(attribution?.statement, id)
      assert.ok(hosts.includes(new URL(url).hostname), id)
      assert.ok(fields.length, id)
    }
  })

  test("an empty licence, a missing credit or an unproven filter blocks one", () => {
    const open = DATASETS.rejectedBin
    assert.equal(selectable(open), true)
    assert.equal(selectable({ ...open, licence: null }), false)
    assert.equal(
      selectable({
        ...open,
        licence: { name: "", url: "https://e.com", checked: "2026-10-31" },
      }),
      false
    )
    assert.equal(selectable({ ...open, attribution: null }), false)
    assert.equal(selectable({ ...open, status: "terms unread" }), false)
    assert.equal(selectable({ ...open, people: "unproven" }), false)
  })

  test("the living-people exclusion can't be opened by reading its terms alone", () => {
    const open = DATASETS.rejectedBin
    assert.equal(DATASETS.wikipediaReverts.people, "unproven")
    assert.equal(
      selectable({
        ...DATASETS.wikipediaReverts,
        status: "confirmed",
        licence: open.licence,
        attribution: open.attribution,
        build: open.build,
      }),
      false
    )
  })

  test("no social profile source is listed", () => {
    for (const id of DATASET_IDS)
      assert.equal(isSocialProfile(DATASETS[id].url), false, id)
  })

  test("a complaint's address is never in its allowed fields", () => {
    assert.equal(DATASETS.sweetOdor.fields.includes("incident_address"), false)
  })

  test("every name is translated, in all six languages", () => {
    for (const [locale, words] of Object.entries(messages)) {
      const names = words.datasets as Record<string, string>
      for (const id of DATASET_IDS) assert.ok(names[id], `${locale} ${id}`)
      const presets = words.presets as Record<string, string>
      for (const p of PRESETS) assert.ok(presets[p.id], `${locale} ${p.id}`)
    }
  })
})

describe("allowed fields", () => {
  test("anything not listed is gone, however deep", () => {
    assert.deepEqual(allowed({ a: { b: 1, c: 2 }, d: 3 }, ["a.b"]), {
      "a.b": 1,
    })
  })

  test("a petitioner's name and the free text never reach an item", () => {
    const items = parseDataset(
      "rejectedBin",
      { data: [petition(785450, "Make “Dennis” the national UK name")] },
      NOW
    )
    const all = JSON.stringify(items)
    assert.equal(items?.length, 1)
    assert.doesNotMatch(all, /A Private Person/)
    assert.doesNotMatch(all, /member of the public/)
    assert.doesNotMatch(all, /called Dennis/)
  })

  test("a firm's address and a shop's phone number never reach an item", () => {
    const fda = parseDataset("foreignObject", { results: [recall()] }, NOW)
    assert.doesNotMatch(JSON.stringify(fda), /Church St|12866|Saratoga/)
    const fr = parseDataset("rappelConso", { results: [rappel()] }, NOW)
    assert.doesNotMatch(JSON.stringify(fr), /0471493081|boutique/)
  })
})

describe("The Rejected Bin", () => {
  const read = (...rows: unknown[]) =>
    titles(parseDataset("rejectedBin", { data: rows }, NOW))

  test("keeps the gems from the live list", () => {
    const gems = [
      "Make “Dennis” the national UK name",
      "Build a taco bell in harlow town centre, essex",
      "Make Wetherspoons available for takeaway",
      "Dovecotes for Bristol",
      "Tell fishies to sell more sports tickets in southampton",
      "get tesco to change their chocolate brioche package back to the old one",
    ]
    assert.deepEqual(read(...gems.map((g, i) => petition(i + 1, g))), gems)
  })

  test("drops the live rows the research flagged", () => {
    const rows = [
      "Fofana and Gusto to leave Chelsea Football Club",
      "Protect & Prioritise Redbridge Cemetery Space for Redbridge Residents",
      "Take over Hendon Jame masjid by local council",
      "Gosport says NO to illegal small boat migrant landings.",
      "PROTECT TOMMY PARKY FROM ILLEGAL MIGRANTS",
      "Demand longer imprisonment for rapists and sexual offenders",
    ]
    assert.deepEqual(read(...rows.map((r, i) => petition(i + 1, r))), [])
  })

  test("takes only the irrelevant category", () => {
    assert.deepEqual(
      read(
        petition(1, "Old pound coins", "no-action"),
        petition(2, "Keep the youth parliament", "duplicate"),
        petition(3, "Reopen the spa pond", "local")
      ),
      []
    )
  })

  test("links the petition's page and keeps the source's own date", () => {
    const [item] =
      parseDataset(
        "rejectedBin",
        { data: [petition(785450, "Dovecotes for Bristol")] },
        NOW
      ) ?? []
    assert.equal(item?.url, "https://petition.parliament.uk/petitions/785450")
    assert.match(item?.summary ?? "", /2026-10-26.*irrelevant/)
    assert.equal(item?.at, NOW)
    assert.equal(item?.source, "UK Parliament")
  })

  test("names err towards being dropped", () => {
    for (const title of [
      "Keir Starmer must resign",
      "Sack Mr Jones",
      "Tommy's law",
      "Bring back Ant and Dec",
    ])
      assert.equal(mayNameAPerson(title), true, title)
    assert.equal(mayNameAPerson("Make Wetherspoons do takeaway"), false)
  })
})

describe("Foreign Object", () => {
  const read = (...rows: unknown[]) =>
    parseDataset("foreignObject", { results: rows }, NOW)

  test("one recall of many rows is one item", () => {
    const items = read(
      recall({ recall_number: "H-1" }),
      recall({ recall_number: "H-2", product_description: "Other flavour" })
    )
    assert.equal(items?.length, 1)
    assert.equal(items?.[0]?.key, "dataset:foreignObject:100041@Class II")
  })

  test("takes Class II only", () => {
    assert.deepEqual(read(recall({ classification: "Class I" })), [])
    assert.deepEqual(read(recall({ classification: "Class III" })), [])
  })

  test("drops anything where someone was hurt or a baby is the customer", () => {
    const hurt: Record<string, string>[] = [
      { reason_for_recall: "Foreign object: metal. Two reported injuries." },
      { reason_for_recall: "Glass; consumer illness reported" },
      { product_description: "Organic infant cereal" },
      { reason_for_recall: "Undeclared milk and metal pieces" },
      // These three came through on the live data.
      { product_description: "Peter Rabbit Organics fruit puree, 4oz pouch" },
      { product_description: "Standard Pasteurized Donor Human Milk" },
      { recalling_firm: "University of California Health Milk Bank" },
    ]
    for (const o of hurt)
      assert.deepEqual(read(recall(o)), [], JSON.stringify(o))
  })

  test("states the date of the report, which lags what it first saw", () => {
    const item = read(recall())?.[0]
    assert.match(item?.summary ?? "", /2026-10-21/)
    assert.equal(item?.at, NOW)
  })

  test("runs its filters before the cap", () => {
    const filler = Array.from({ length: 40 }, (_, i) =>
      recall({ event_id: String(i), classification: "Class I" })
    )
    assert.equal(read(...filler, recall())?.length, 1)
  })
})

describe("RappelConso", () => {
  const read = (...rows: unknown[]) =>
    parseDataset("rappelConso", { results: rows }, NOW)

  test("keeps a glass recall, in its own language", () => {
    const item = read(rappel())?.[0]
    assert.match(item?.title ?? "", /bris de verre/)
    assert.match(item?.summary ?? "", /2026-10-30/)
    assert.equal(
      item?.url,
      "https://rappel.conso.gouv.fr/fiche-rappel/23963/interne"
    )
  })

  test("drops germs, allergens and baby food", () => {
    for (const o of [
      { risques_encourus: "listeria monocytogenes" },
      { motif_rappel: "présence de listeria monocytogenes" },
      { motif_rappel: "corps étranger, allergène non déclaré" },
      { libelle: "croissance nature bébé" },
      { categorie_produit: "bébés-enfants" },
      // Both filed under objects on the live data, and neither is one.
      { motif_rappel: "risque de présence de morelle dans le produit" },
      { motif_rappel: "absence de contrôle d'un moyen de maîtrise (filtre)" },
    ])
      assert.deepEqual(read(rappel(o)), [], JSON.stringify(o))
  })

  test("doesn't print 'sans marque' as a brand", () => {
    const item = read(rappel({ marque_produit: "sans marque" }))?.[0]
    assert.doesNotMatch(item?.summary ?? "", /sans marque/)
  })

  test("a corrected notice is a new item", () => {
    const [one] = read(rappel()) ?? []
    const [two] = read(rappel({ numero_version: 2 })) ?? []
    assert.notEqual(one?.key, two?.key)
  })

  test("refuses a link off its allowed hosts", () => {
    assert.deepEqual(
      read(rappel({ lien_vers_la_fiche_rappel: "https://evil.example/x" })),
      []
    )
  })
})

describe("parsing", () => {
  test("a response of the wrong shape says so, instead of looking quiet", () => {
    assert.equal(parseDataset("foreignObject", { error: "gone" }, NOW), null)
    assert.equal(parseDataset("rejectedBin", null, NOW), null)
    assert.deepEqual(parseDataset("rejectedBin", { data: [] }, NOW), [])
  })

  test("a closed dataset can't be parsed at all", () => {
    assert.equal(parseDataset("sweetOdor", { "": [] }, NOW), null)
  })

  test("word matching ignores accents and stays at the start of words", () => {
    assert.equal(mentions("Présence de bébé", ["bebe"]), true)
    assert.equal(mentions("transmigrants", ["migrant"]), false)
    assert.equal(mentions("two migrants", ["migrant"]), true)
    assert.equal(mentions("anything", []), false)
  })
})

describe("snapshot keys", () => {
  test("the same state keeps its key, and a new one changes it", () => {
    const key = snapshotKey("rappelConso", "1", "v1")
    assert.equal(key, snapshotKey("rappelConso", "1", "v1"))
    assert.notEqual(key, snapshotKey("rappelConso", "1", "v2"))
  })

  test("a state of any length fits the column", () => {
    const long = "x".repeat(5000)
    const key = snapshotKey("rappelConso", "1", long)
    assert.ok(key.length <= 300)
    assert.notEqual(key, snapshotKey("rappelConso", "1", `${long}y`))
  })
})

describe("feed state", () => {
  const item = (key: string) => ({
    key,
    title: key,
    summary: "",
    source: "s",
    url: "https://e.com",
    at: 1,
  })

  test("a first read yields nothing and remembers everything", () => {
    const { fresh, seen } = unseen([item("a"), item("b")], null)
    assert.deepEqual(fresh, [])
    assert.deepEqual(seen, ["a", "b"])
  })

  test("a failed first read doesn't turn the backlog into news", () => {
    const failed = afterRead(null, "failed", [], null, NOW)
    const state = {
      ...failed,
      machine_id: "m",
      user_id: "u",
      feed_key: "k",
      updated_at: "",
    }
    assert.deepEqual(unseen([item("a")], state).fresh, [])
  })

  test("later reads yield only what's new, and the list is bounded", () => {
    const state = { seen: ["a"], last_ok_at: "2026-10-01" }
    assert.deepEqual(
      unseen([item("b"), item("a")], state).fresh.map((i) => i.key),
      ["b"]
    )
    const many = Array.from({ length: 800 }, (_, i) => item(String(i)))
    assert.equal(unseen(many, state).seen.length, MAX_SEEN)
  })

  test("a dead source keeps its last good dates", () => {
    const state = {
      ...afterRead(null, "ok", [], [], NOW),
      machine_id: "m",
      user_id: "u",
      feed_key: "k",
      updated_at: "",
    }
    const later = afterRead(state, "failed", [], null, NOW + 1000)
    assert.equal(later.failures, 1)
    assert.equal(later.last_ok_at, state.last_ok_at)
    assert.equal(later.last_item_at, state.last_item_at)
  })

  test("a busy source isn't a failing one", () => {
    assert.equal(afterRead(null, "busy", [], null, NOW).failures, 0)
  })

  test("a dataset gone quiet too long shows, and a young one doesn't", () => {
    const at = (days: number) => new Date(NOW - days * 86_400_000).toISOString()
    const state = (days: number, failures = 0) => ({
      failures,
      last_read_at: at(0),
      last_item_at: at(days),
    })
    assert.equal(feedHealth(undefined, 14, NOW), "waiting")
    assert.equal(feedHealth(state(3), 14, NOW), "ok")
    assert.equal(feedHealth(state(30), 14, NOW), "quiet")
    assert.equal(feedHealth(state(3, 3), 14, NOW), "failing")
    assert.equal(feedHealth(state(300), null, NOW), "ok")
  })

  test("every kind of feed has a stable key of its own", () => {
    assert.equal(
      feedKey({ kind: "dataset", preset: "rejectedBin" }),
      "dataset:rejectedBin"
    )
    assert.equal(feedKey({ kind: "hackernews" }), "hackernews")
    assert.equal(feedKey({ kind: "news", query: "x" }), "news:x")
  })
})

describe("what a save refuses", () => {
  const opts = { public: true, usesDesk: true }
  test("profile feeds of all three networks", () => {
    for (const url of [
      "https://bsky.app/profile/someone/rss",
      "https://mastodon.social/@someone.rss",
      "https://mastodon.social/users/someone.rss",
      "https://t.me/s/channel",
    ]) {
      assert.equal(isSocialProfile(url), true, url)
      assert.equal(feedRefusal([{ kind: "rss", url }], opts), "social_feed")
    }
  })

  test("ordinary feeds still pass", () => {
    assert.equal(
      feedRefusal([{ kind: "rss", url: "https://example.com/feed.xml" }], opts),
      null
    )
  })

  test("a dataset that isn't open", () => {
    assert.equal(
      feedRefusal([{ kind: "dataset", preset: "sweetOdor" }], opts),
      "dataset_blocked"
    )
    assert.equal(
      feedRefusal([{ kind: "dataset", preset: "rejectedBin" }], opts),
      null
    )
  })

  test("a rival without two disclosures to carry it", () => {
    const rival = { kind: "rival" as const, machine: "m2" }
    assert.equal(feedRefusal([rival], { ...opts, id: "m1" }), null)
    assert.equal(feedRefusal([rival], { ...opts, id: "m2" }), "rival_rules")
    assert.equal(
      feedRefusal([rival], { ...opts, public: false }),
      "rival_rules"
    )
    assert.equal(
      feedRefusal([rival], { ...opts, usesDesk: false }),
      "rival_rules"
    )
  })

  test("a closed dataset stored earlier still parses", () => {
    assert.equal(
      feedSchema.safeParse({ kind: "dataset", preset: "sweetOdor" }).success,
      true
    )
    assert.equal(
      feedSchema.safeParse({ kind: "dataset", preset: "made-up" }).success,
      false
    )
    assert.equal(
      feedSchema.safeParse({ kind: "dataset", preset: "x", url: "https://e" })
        .success,
      false
    )
  })

  test("the feed can't carry an address of its own", () => {
    const parsed = feedSchema.parse({
      kind: "dataset",
      preset: "rejectedBin",
      url: "https://internal.example",
    })
    assert.equal("url" in parsed, false)
  })
})

describe("the launch presets", () => {
  const desks = PRESETS.filter((p) =>
    p.config.feeds.some((f) => f.kind === "dataset")
  )

  test("are the three confirmed sources, and only those", () => {
    assert.deepEqual(
      desks.map((p) => p.id),
      ["rejectedBin", "foreignObject", "rappelConso"]
    )
    for (const p of desks)
      assert.equal(
        feedRefusal(p.config.feeds, { public: false, usesDesk: true }),
        null
      )
  })

  test("save through the same schema, and start in review", () => {
    for (const p of desks) {
      const saved = machineInput.parse({
        name: "x",
        source: p.source,
        config: p.config,
      })
      assert.equal(saved.publish_mode, "review")
      assert.equal(saved.config.style, "deadpan")
      assert.equal(saved.config.line, null)
      assert.equal(saved.config.dailyCap, 1)
      assert.equal(saved.config.listen, false)
      assert.equal(machineConfig.safeParse(p.config).success, true)
    }
  })

  test("the French preset writes in French", () => {
    assert.equal(
      PRESETS.find((p) => p.id === "rappelConso")?.config.language,
      "fr"
    )
  })
})

describe("attribution", () => {
  test("a post from a dataset ends with its credit", () => {
    assert.equal(
      signOff("en", [{ source: "UK Parliament" }]),
      "AI-written · UK Parliament"
    )
    assert.equal(signOff("en", [{ source: "example.com" }]), "AI-written")
  })

  test("one source is credited once", () => {
    assert.deepEqual(
      creditsFor([{ source: "FDA" }, { source: "FDA" }, { source: "x" }]),
      ["FDA"]
    )
  })

  test("no length of post can cut it, on any platform", () => {
    const long = "word ".repeat(400)
    const credit = signOff("en", [{ source: "RappelConso" }])
    for (const platform of ["bluesky", "twitter", "threads"] as const)
      assert.ok(
        compose(
          long,
          "https://rappel.conso.gouv.fr/x",
          platform,
          credit
        ).includes(credit),
        platform
      )
  })

  test("a credit makes room in the take's budget too", () => {
    const outputs = [{ platform: "twitter" as const }]
    const link = "https://e.com/a"
    const plain = takeRoom(outputs, link, signOff("en", []))
    const credited = takeRoom(
      outputs,
      link,
      "AI-written · a much longer credit than this one, on and on and on and on and on"
    )
    assert.ok(credited <= plain)
  })

  test("the page and the feed credit each dataset a machine reads", () => {
    const credits = attributionsFor([
      { kind: "dataset", preset: "rejectedBin" },
      { kind: "dataset", preset: "rappelConso" },
      { kind: "news", query: "x" },
    ])
    assert.deepEqual(
      credits.map((c) => c.id),
      ["rejectedBin", "rappelConso"]
    )
    assert.match(credits[0]!.statement, /Open Government Licence v3\.0/)
    assert.equal(credits[1]!.dated, true)
  })

  test("a machine with an old config has nothing to credit", () => {
    assert.deepEqual(attributionsFor(undefined), [])
  })
})

describe("what the agent may open", () => {
  const item: Item = {
    key: "dataset:rejectedBin:1@irrelevant",
    source: "UK Parliament",
    title: "t",
    summary: "",
    url: "https://petition.parliament.uk/petitions/1",
    at: 1,
  }

  test("not a dataset's page, which holds what the allowlist dropped", () => {
    assert.equal(isReadable(item), false)
  })

  test("not a foil, since what it reads counts as evidence", () => {
    assert.equal(isReadable({ key: "rival:x:1", role: "foil" }), false)
  })

  test("any other item, as before", () => {
    assert.equal(isReadable({ key: "hn:1" }), true)
  })
})

describe("foils", () => {
  const fact: Item = {
    key: "a",
    source: "s",
    title: "t",
    summary: "",
    url: "https://e.com/fact",
    at: 1,
  }
  const foil: Item = {
    ...fact,
    key: "b",
    url: "https://p.com/m/x",
    role: "foil",
  }

  test("are marked in the inbox, and nothing else is", () => {
    const brief = JSON.parse(inboxBrief([fact, foil])) as {
      inbox: { role?: string }[]
    }
    assert.equal(brief.inbox[0]!.role, undefined)
    assert.equal(brief.inbox[1]!.role, "foil")
  })

  test("are never what a post links to", () => {
    const filed = toFiled(
      { text: "x", item_ids: [1, 0] },
      [fact, foil],
      "",
      "p"
    )
    assert.equal(filed?.link, fact.url)
    const alone = toFiled({ text: "x", item_ids: [1] }, [fact, foil], "", "p")
    assert.equal(alone?.link, null)
  })
})

describe("the editor's brief", () => {
  const config = machineConfig.parse({
    threshold: 1,
    windowMinutes: 1,
    cooldownMinutes: 1,
    dailyCap: 1,
    style: "deadpan",
  })
  const machine = { name: "Desk", config }

  test("explains foils only to a machine that reads a rival", () => {
    assert.doesNotMatch(editorFor(machine, "").system, /foil/)
    const feeds = [
      {
        kind: "rival" as const,
        machine: "00000000-0000-4000-8000-000000000002",
      },
    ]
    const rivalling = { ...machine, config: { ...config, feeds } }
    assert.match(editorFor(rivalling, "").system, /role "foil"/)
  })
})

describe("stance packs", () => {
  test("every stop is blocked, by a named source", () => {
    for (const stance of STANCES)
      assert.ok(packBlockers(stance).length > 0, stance)
  })

  test("no confirmed source is presented as a stance's own", () => {
    for (const stance of STANCES)
      for (const id of STANCE_PACKS[stance])
        assert.equal(OPEN_DATASETS.includes(id), false, id)
  })
})
