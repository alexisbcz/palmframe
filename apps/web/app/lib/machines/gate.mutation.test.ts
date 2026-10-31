import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { holdReason } from "./gate"

// Takes good posts, corrupts them mechanically, and counts what the gate does.
// Free and deterministic, so it runs with every `bun test`. Catches alone would
// reward holding everything, and each false hold stalls a hands-off machine, so
// the same run counts false holds on posts that are fine.
//
// The posts are hand-written, not real approved ones, so these numbers show
// what the code can do. They don't predict a live hold rate.
interface Fixture {
  language: string
  evidence: string
  post: string
  // A word in the post, and the word with the opposite meaning.
  flip?: [string, string]
  // A name in mid-sentence, and a person who isn't in the story.
  name?: [string, string]
  // A number and its unit, as written in the post.
  figure?: string
  // Another figure the sources state, about something else.
  otherFigure?: string
  // The post with the figure's unit swapped for a magnitude.
  rebound?: string
  // The figure spelled out, wrongly.
  spelled?: string
  // An invented sentence with quotation marks around it.
  quote: string
  voting: string
}

const FIXTURES: Fixture[] = [
  {
    language: "en",
    evidence:
      "Unemployment rose to 4.3% in May, up from 4.1%. Mayor Lee opened the bridge on May 6. Labour Secretary Dana Ortiz spoke at the event.",
    post: "Unemployment rose to 4.3% in May, said Labour Secretary Dana Ortiz.",
    flip: ["rose", "fell"],
    name: ["Ortiz", "Kowalski"],
    figure: "4.3%",
    otherFigure: "4.1%",
    rebound: "Unemployment rose to 4.3 million in May.",
    quote: 'Dana Ortiz said it was "a total disgrace".',
    voting: "Polls close at noon on Friday.",
  },
  {
    language: "en",
    evidence:
      "Acme raised $3 million in a round led by Birch Capital. Sales grew 12% last year.",
    post: "Acme raised $3 million in a round led by Birch Capital.",
    flip: undefined,
    name: ["Birch", "Sequoia"],
    figure: "$3 million",
    rebound: "Acme raised $3 billion in a round led by Birch Capital.",
    spelled: "Acme raised five million dollars from Birch Capital.",
    quote: "Birch Capital called it 'the best deal ever'.",
    voting: "You can vote by text this year.",
  },
  {
    language: "fr",
    evidence:
      "Le chômage a reculé à 7,4 % au troisième trimestre, selon l'Insee. Le ministre Marc Durand a salué ces chiffres.",
    post: "Le chômage a reculé à 7,4 % selon l'Insee, salué par le ministre Marc Durand.",
    flip: ["reculé", "augmenté"],
    name: ["Durand", "Lefèvre"],
    figure: "7,4 %",
    rebound: "Le chômage a reculé à 7,4 millions selon l'Insee.",
    quote: "Marc Durand a déclaré « nous avons gagné la bataille ».",
    voting: "Les bureaux de vote ferment à midi.",
  },
  {
    language: "fr",
    evidence:
      "Airbus a livré 54 avions en juin. Le groupe prévoit 820 livraisons sur l'année, pour un chiffre d'affaires de 3 milliards d'euros.",
    post: "Airbus a livré 54 avions en juin pour 3 milliards d'euros.",
    figure: "54",
    rebound: "Airbus a livré 54 millions d'avions en juin.",
    spelled: "Airbus annonce sept milliards d'euros.",
    quote: "Le groupe parle de « record absolu pour tous ».",
    voting: "On peut voter par internet dimanche.",
  },
  {
    language: "es",
    evidence:
      "El paro bajó un 2,5% en octubre, según el ministerio. La ministra Elena Ruiz presentó los datos en Madrid.",
    post: "El paro bajó un 2,5% en octubre, explicó en Madrid la ministra Elena Ruiz.",
    flip: ["bajó", "subió"],
    name: ["Ruiz", "Moreno"],
    figure: "2,5%",
    rebound: "El paro bajó en 2,5 millones en octubre.",
    quote: 'Elena Ruiz dijo que "hemos vencido al paro".',
    voting: "Los colegios electorales cierran a las tres.",
  },
  {
    language: "es",
    evidence:
      "Inditex ganó 1.200 millones de euros en el semestre. Abrió 40 tiendas en Asia.",
    post: "Inditex ganó 1.200 millones de euros y abrió 40 tiendas en Asia.",
    figure: "1.200 millones",
    rebound: "Inditex ganó 1.200 billones de euros en el semestre.",
    spelled: "Inditex ganó cinco billones de euros.",
    quote: "La empresa habla de «un año perfecto».",
    voting: "Ya se puede votar por internet.",
  },
  {
    language: "de",
    evidence:
      "Die Inflation sank im Oktober auf 2,3 Prozent. Bundesbank-Präsident Joachim Nagel äußerte sich in Frankfurt.",
    post: "Die Inflation sank im Oktober auf 2,3 Prozent, sagte Joachim Nagel.",
    flip: ["sank", "stieg"],
    figure: "2,3 Prozent",
    rebound: "Die Inflation sank im Oktober auf 2,3 Millionen.",
    quote: 'Joachim Nagel sagte: "Wir haben alles im Griff".',
    voting: "Die Wahllokale schließen um zwölf Uhr.",
  },
  {
    language: "de",
    evidence:
      "Siemens investiert 2 Milliarden Euro in Berlin. Das Werk soll 500 Stellen schaffen.",
    post: "Siemens investiert 2 Milliarden Euro in Berlin und schafft 500 Stellen.",
    figure: "2 Milliarden",
    rebound: "Siemens investiert 2 Billionen Euro in Berlin.",
    spelled: "Siemens investiert sieben Milliarden Euro.",
    quote: "Der Konzern spricht von „einem historischen Tag“.",
    voting: "Die Briefwahl endet am Freitag.",
  },
  {
    language: "it",
    evidence:
      "L'inflazione è scesa all'1,7% in ottobre, secondo l'Istat. Il ministro Luca Bianchi ha commentato i dati a Roma.",
    post: "L'inflazione è scesa all'1,7% in ottobre, ha spiegato a Roma il ministro Luca Bianchi.",
    flip: ["scesa", "salita"],
    name: ["Bianchi", "Conti"],
    figure: "1,7%",
    rebound: "L'inflazione è scesa di 1,7 milioni in ottobre.",
    quote: 'Luca Bianchi ha detto "abbiamo battuto i prezzi".',
    voting: "I seggi elettorali chiudono a mezzogiorno.",
  },
  {
    language: "it",
    evidence:
      "Stellantis ha venduto 800 auto elettriche a Torino, per 3 milioni di euro di ricavi.",
    post: "Stellantis ha venduto 800 auto elettriche a Torino per 3 milioni di euro.",
    figure: "3 milioni",
    rebound: "Stellantis ha venduto 800 auto per 3 miliardi di euro.",
    spelled: "Stellantis incassa sette miliardi di euro.",
    quote: "L'azienda parla di «un trionfo senza precedenti».",
    voting: "Si può votare via sms domenica.",
  },
  {
    language: "ja",
    evidence:
      "消費者物価は10月に2.1%上昇した。総務省が発表した。売上高は3億円だった。",
    post: "消費者物価は10月に2.1%上昇した。",
    flip: ["上昇", "下落"],
    figure: "2.1%",
    rebound: "消費者物価は10月に2.1億円上昇した。",
    quote: "総務省は「完全に解決した」と述べた。",
    voting: "投票所は正午に閉まる。",
  },
  {
    language: "ja",
    evidence: "トヨタは3億円を投資し、工場で500人を雇用すると発表した。",
    post: "トヨタは3億円を投資し、500人を雇用する。",
    figure: "3億円",
    rebound: "トヨタは3兆円を投資し、500人を雇用する。",
    quote: "トヨタは「歴史的な一日だ」と述べた。",
    voting: "期日前投票は金曜日までです。",
  },
]

// Fine posts the first draft of a check might hold: rounded wording, harmless
// small numbers, words the sources also use, and other languages' sources.
const HARMLESS: { language: string; evidence: string; post: string }[] = [
  ...FIXTURES,
  {
    language: "en",
    evidence: "Revenue of $2,500 million grew 40% in 2026.",
    post: "Revenue reached $2.5 billion, up 40 percent.",
  },
  {
    language: "en",
    evidence: "The team shipped three features this quarter.",
    post: "Top 3 features of the quarter, in 2 lines.",
  },
  {
    language: "en",
    evidence: "The Federal Reserve held rates at 5.25%. Sales fell in Texas.",
    post: "The Fed held rates at 5.25% on Tuesday.",
  },
  {
    language: "en",
    evidence: "The company's CEO said profit fell, while sales rose 8%.",
    post: "Sales rose 8% even as profit fell.",
  },
  {
    language: "en",
    evidence: 'The report calls it "a historic shift for the sector".',
    post: 'The report describes "a historic shift for the sector".',
  },
  {
    language: "en",
    evidence: "It will cost 3,000,000 euros.",
    post: "It will cost 3 million euros.",
  },
  {
    language: "en",
    evidence: "The firm's so-called breakthrough was announced on 12 March.",
    post: 'The firm\'s "breakthrough" came on March 12.',
  },
  {
    language: "fr",
    evidence: "Revenue reached 3 billion euros, up 12 percent.",
    post: "Le chiffre d'affaires atteint 3 milliards d'euros, en hausse de 12 %.",
  },
  {
    language: "de",
    evidence: "Der Umsatz stieg um 4 Prozent auf 9 Milliarden Euro.",
    post: "Der Umsatz stieg um 4 % auf 9 Milliarden Euro.",
  },
  {
    language: "ja",
    evidence: "Sales rose 5% to 3 trillion yen.",
    post: "売上高は5%増加し、3兆円となった。",
  },
]

interface Mutant {
  kind: string
  language: string
  text: string
  evidence: string
}

const MUTATORS: Record<string, (f: Fixture) => string | undefined> = {
  flippedDirection: (f) => f.flip && f.post.replace(f.flip[0], f.flip[1]),
  swappedName: (f) => f.name && f.post.replace(f.name[0], f.name[1]),
  // A digit in the figure changes by one.
  changedDigit: (f) =>
    f.figure &&
    f.post.replace(
      f.figure,
      f.figure.replace(/\d(?=\D*$)/, (d) => String((Number(d) + 1) % 10))
    ),
  reboundUnit: (f) => f.rebound,
  spelledNumber: (f) => f.spelled,
  fabricatedQuote: (f) => f.quote,
  votingClaim: (f) => f.voting,
  misusedFigure: (f) =>
    f.figure && f.otherFigure && f.post.replace(f.figure, f.otherFigure),
}

const mutants = FIXTURES.flatMap((f) =>
  Object.entries(MUTATORS).flatMap(([kind, mutate]): Mutant[] => {
    const text = mutate(f)
    return text && text !== f.post
      ? [{ kind, language: f.language, text, evidence: f.evidence }]
      : []
  })
)

const held = (text: string, evidence: string, language: string) =>
  holdReason(text, evidence, [{}], language) !== null

describe("the gate against corrupted posts", () => {
  const score = new Map<string, { caught: number; total: number }>()
  for (const m of mutants) {
    const s = score.get(m.kind) ?? { caught: 0, total: 0 }
    s.total++
    if (held(m.text, m.evidence, m.language)) s.caught++
    score.set(m.kind, s)
  }

  // Exact on purpose: a better gate should have to update this table.
  test("each kind of corruption scores what it scores", () => {
    assert.deepEqual(Object.fromEntries(score), {
      flippedDirection: { caught: 6, total: 6 },
      swappedName: { caught: 5, total: 5 },
      changedDigit: { caught: 12, total: 12 },
      reboundUnit: { caught: 12, total: 12 },
      spelledNumber: { caught: 5, total: 5 },
      fabricatedQuote: { caught: 12, total: 12 },
      votingClaim: { caught: 12, total: 12 },
      misusedFigure: { caught: 0, total: 1 },
    })
  })

  test("no known corruption goes uncaught except the ones listed", () => {
    const escaped = mutants
      .filter((m) => !held(m.text, m.evidence, m.language))
      .map((m) => m.text)
    assert.deepEqual(escaped, [
      "Unemployment rose to 4.1% in May, said Labour Secretary Dana Ortiz.",
    ])
  })
})

// What code can't see. These need a reader, and they're pinned here so nobody
// reads the table above as a claim that facts can't change.
describe("what still gets through, until a reader exists", () => {
  const evidence =
    "Unemployment rose to 4.3% in May, up from 4.1%. Mayor Lee opened the bridge. Sales fell in June."
  const escapes: Record<string, string> = {
    "a source's figure on the wrong claim": "Unemployment rose 4.1%.",
    "an invented claim with no quotation marks":
      "Mayor Lee said it was a total disgrace.",
    "a name swapped at the start of a sentence":
      "Kim opened the bridge in May.",
    "a flip when the sources move both ways":
      "Unemployment fell to 4.3% as sales rose.",
    "a spelled number with no unit": "Five bridges opened in May.",
  }
  for (const [what, post] of Object.entries(escapes))
    test(what, () => {
      assert.equal(holdReason(post, evidence, [{}]), null)
    })
})

describe("false holds on posts that are fine", () => {
  test("none in this set", () => {
    const wrong = HARMLESS.filter((p) =>
      held(p.post, p.evidence, p.language)
    ).map((p) => p.post)
    assert.deepEqual(wrong, [])
  })

  test("the set covers every language", () => {
    assert.deepEqual([...new Set(HARMLESS.map((p) => p.language))].sort(), [
      "de",
      "en",
      "es",
      "fr",
      "it",
      "ja",
    ])
  })
})
