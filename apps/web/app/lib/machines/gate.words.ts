// The closed word lists behind the gate, one set per language a machine can
// write in. They stay closed on purpose: each entry is a thing plain code can
// check, and anything vaguer belongs to a reader, not a regular expression.
import type { Locale } from "@/i18n/core"

export const GATE_LANGUAGES = ["en", "fr", "es", "de", "it", "ja"] as const
export type GateLanguage = Locale

export const gateLanguage = (language: string): GateLanguage =>
  GATE_LANGUAGES.find((l) => l === language) ?? "en"

export const PERCENT = "percent"

// What a word after a number multiplies it by. The same word can mean two
// things: "billion" is 10^9 in English and 10^12 in French and German.
const E6 = 1e6
const E9 = 1e9
const E12 = 1e12
export const UNITS: Record<GateLanguage, Record<string, number | "percent">> = {
  en: {
    "%": PERCENT,
    percent: PERCENT,
    "per cent": PERCENT,
    thousand: 1e3,
    million: E6,
    millions: E6,
    billion: E9,
    billions: E9,
    trillion: E12,
    trillions: E12,
  },
  fr: {
    "%": PERCENT,
    "pour cent": PERCENT,
    mille: 1e3,
    million: E6,
    millions: E6,
    milliard: E9,
    milliards: E9,
    billion: E12,
    billions: E12,
  },
  es: {
    "%": PERCENT,
    "por ciento": PERCENT,
    mil: 1e3,
    millón: E6,
    millones: E6,
    "mil millones": E9,
    billón: E12,
    billones: E12,
  },
  de: {
    "%": PERCENT,
    prozent: PERCENT,
    tausend: 1e3,
    million: E6,
    millionen: E6,
    mio: E6,
    milliarde: E9,
    milliarden: E9,
    mrd: E9,
    billion: E12,
    billionen: E12,
  },
  it: {
    "%": PERCENT,
    "per cento": PERCENT,
    mila: 1e3,
    milione: E6,
    milioni: E6,
    miliardo: E9,
    miliardi: E9,
    bilione: E12,
    bilioni: E12,
  },
  ja: {
    "%": PERCENT,
    "％": PERCENT,
    パーセント: PERCENT,
    万: 1e4,
    百万: E6,
    億: 1e8,
    兆: E12,
  },
}

// Glued to the digits only: "5m" is a shorthand, "5 m" is usually metres.
export const SHORT_UNITS: Record<string, number> = {
  k: 1e3,
  m: E6,
  mn: E6,
  bn: E9,
  tn: E12,
}

// Numbers people spell before a unit: "three million". A spelled number with
// no unit stays with the reader, because "two of the three" is harmless.
export const NUMBER_WORDS: Record<GateLanguage, Record<string, number>> = {
  en: {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    twenty: 20,
    thirty: 30,
    forty: 40,
    fifty: 50,
    hundred: 100,
  },
  fr: {
    un: 1,
    deux: 2,
    trois: 3,
    quatre: 4,
    cinq: 5,
    six: 6,
    sept: 7,
    huit: 8,
    neuf: 9,
    dix: 10,
    onze: 11,
    douze: 12,
    vingt: 20,
    trente: 30,
    quarante: 40,
    cinquante: 50,
    cent: 100,
  },
  es: {
    un: 1,
    dos: 2,
    tres: 3,
    cuatro: 4,
    cinco: 5,
    seis: 6,
    siete: 7,
    ocho: 8,
    nueve: 9,
    diez: 10,
    once: 11,
    doce: 12,
    veinte: 20,
    treinta: 30,
    cuarenta: 40,
    cincuenta: 50,
    cien: 100,
  },
  de: {
    eine: 1,
    zwei: 2,
    drei: 3,
    vier: 4,
    fünf: 5,
    sechs: 6,
    sieben: 7,
    acht: 8,
    neun: 9,
    zehn: 10,
    elf: 11,
    zwölf: 12,
    zwanzig: 20,
    dreißig: 30,
    vierzig: 40,
    fünfzig: 50,
    hundert: 100,
  },
  it: {
    un: 1,
    due: 2,
    tre: 3,
    quattro: 4,
    cinque: 5,
    sei: 6,
    sette: 7,
    otto: 8,
    nove: 9,
    dieci: 10,
    undici: 11,
    dodici: 12,
    venti: 20,
    trenta: 30,
    quaranta: 40,
    cinquanta: 50,
    cento: 100,
  },
  ja: {},
}

// A day number beside one of these is a date, so a single digit counts.
export const MONTHS: Record<GateLanguage, string[]> = {
  en: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ],
  fr: [
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
  ],
  es: [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ],
  de: [
    "Januar",
    "Februar",
    "März",
    "April",
    "Mai",
    "Juni",
    "Juli",
    "August",
    "September",
    "Oktober",
    "November",
    "Dezember",
  ],
  it: [
    "gennaio",
    "febbraio",
    "marzo",
    "aprile",
    "maggio",
    "giugno",
    "luglio",
    "agosto",
    "settembre",
    "ottobre",
    "novembre",
    "dicembre",
  ],
  ja: [],
}

// Capitalised words that are never someone's name.
const DAYS: Partial<Record<GateLanguage, string[]>> = {
  en: [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ],
}
export const calendarWords = (language: GateLanguage) =>
  new Set(
    [...MONTHS[language], ...(DAYS[language] ?? [])].map((w) => w.toLowerCase())
  )

// Languages where a capital in mid-sentence marks a name. German capitalises
// every noun and Japanese has no capitals, so neither can use this check.
export const NAMES_BY_CAPITAL: GateLanguage[] = ["en", "fr", "es", "it"]

export interface Directions {
  up: RegExp
  down: RegExp
}

// Whole words, in any script: JavaScript's \b only knows ASCII, so "bajó" has
// no word end. A trailing * makes a stem.
const words = (...list: string[]) =>
  new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${list
      .map((w) => (w.endsWith("*") ? `${w.slice(0, -1)}\\p{L}*` : w))
      .join("|")})(?![\\p{L}\\p{N}])`,
    "iu"
  )

// "up" and "down" themselves are left out: "set up" and "shut down" aren't
// moves. Same for words with a common other meaning in each language.
export const DIRECTIONS: Record<GateLanguage, Directions> = {
  en: {
    up: words(
      "rose",
      "risen",
      "rises",
      "rising",
      "grew",
      "grown",
      "climbed",
      "jumped",
      "surged",
      "soared",
      "increased",
      "gained"
    ),
    down: words(
      "fell",
      "fallen",
      "falls",
      "falling",
      "dropped",
      "declined",
      "shrank",
      "slid",
      "plunged",
      "sank",
      "slumped",
      "decreased"
    ),
  },
  fr: {
    up: words("hausse", "augment*", "grimp*", "progress*", "bondi*"),
    down: words("baisse", "recul*", "chut*", "diminu*", "dégringol*"),
  },
  es: {
    up: words("subió", "sube", "subieron", "aument*", "creci*", "alza"),
    down: words("bajó", "bajaron", "cayó", "cayeron", "disminu*", "descens*"),
  },
  de: {
    up: words("stieg*", "gestiegen", "wuchs", "zugelegt", "anstieg"),
    down: words(
      "fiel",
      "fielen",
      "gefallen",
      "sank",
      "sanken",
      "gesunken",
      "rückgang"
    ),
  },
  it: {
    up: words("salit*", "salgono", "aument*", "cresci*", "rialz*"),
    down: words(
      "sces*",
      "scendono",
      "calat*",
      "calo",
      "diminu*",
      "crollat*",
      "ribass*"
    ),
  },
  ja: {
    up: /上昇|増加|急騰|増え/,
    down: /下落|減少|急落|低下|減っ/,
  },
}

// How to vote is the one subject where a wrong sentence does direct harm, so
// anything that reads like voting procedure waits for a person, sourced or not.
export const VOTING: Record<GateLanguage, RegExp> = {
  en: /\b(?:polls? (?:open|opens|close|closes)|polling (?:place|station|day)s?|vote by (?:text|phone|mail|post|email)|mail[- ]in ballots?|ballot (?:deadline|drop)|register to vote|voter registration|election day|voting (?:day|deadline|hours))\b/i,
  fr: /(?:bureaux? de vote|voter par (?:sms|internet|courrier|téléphone)|vote par (?:sms|internet|correspondance)|procurations?\b|listes électorales|jour du (?:vote|scrutin))/i,
  es: /(?:colegios? electorales?|mesas? electorales?|votar por (?:sms|correo|teléfono|internet)|voto por correo|día de las elecciones)/i,
  de: /(?:wahllokal\w*|briefwahl|wahltag|per sms wählen|stimmzettel)/i,
  it: /(?:\bseggi(?:o)? elettorali?|voto per (?:corrispondenza|posta)|votare (?:via|per) (?:sms|posta|internet)|giorno delle elezioni|scheda elettorale)/i,
  ja: /投票所|期日前投票|投票日|投票用紙|郵便投票/,
}
