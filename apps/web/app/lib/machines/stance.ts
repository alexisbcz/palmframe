import { z } from "zod"

// A declared political line. The owner picks one of five stops and the arena it
// speaks to; everything the stop means lives in a card below that nobody can
// edit. A machine with no line is the plain outlet it always was.
export const STANCES = [
  "far-left",
  "left",
  "center",
  "right",
  "far-right",
] as const
export type Stance = (typeof STANCES)[number]

// These two never publish by themselves, whatever the machine says.
export const FAR_STANCES: readonly Stance[] = ["far-left", "far-right"]

// Which public a line speaks to, and whose election calendar it obeys. Provisional
// until the owner picks the two launch arenas.
export const ARENAS = ["fr", "us"] as const
export type Arena = (typeof ARENAS)[number]

// A reviewed list, never free text: a free-text target is a harassment tool.
// These rank what the agent looks at and permit nothing.
export const SCRUTINY = [
  "government",
  "regulators",
  "large_employers",
  "banks",
  "large_landlords",
  "public_spending",
  "tech_platforms",
] as const
export type Scrutiny = (typeof SCRUTINY)[number]
export const MAX_SCRUTINY = 3

// How the take sounds. `plain` with no line is the news flash machines always
// wrote. The two others are the funny machines: the post stays a flat fact and
// the joke lives in the take, where it can be dropped.
export const STYLES = ["plain", "deadpan", "wry"] as const
export type Style = (typeof STYLES)[number]

export const STANCE_COOLDOWN_DAYS = 30
// Posts a line machine has to go through review before it may run by itself.
// Far stops never do. A starting number, also in the guard trigger.
export const LINE_REVIEW_POSTS = 20

export const lineSchema = z.object({
  stance: z.enum(STANCES),
  arena: z.enum(ARENAS),
  // Who answers for this outlet. Shown on its public page and in its feed.
  publisher: z.string().trim().min(2).max(120),
  contact: z.union([
    z.email().max(200),
    z.url().startsWith("https://").max(200),
  ]),
  scrutiny: z.array(z.enum(SCRUTINY)).max(MAX_SCRUTINY).default([]),
})
export type Line = z.infer<typeof lineSchema>

export interface LineCard {
  values: string
  story: string
  protagonist: string
  // What the outlet doesn't argue for, because it starts from it.
  given: string
  vocabulary: string
  // How much it trusts the institutions it covers.
  system: string
  // What this frame tends to miss. Reviewers read this; the writer never does,
  // because telling it reads as permission to leave those things out.
  omissionRisk: string
}

// Editorial judgment, not research output. In English: the agent finds the words
// in the post's language. Stops differ by institutions and policy, never by who
// people are.
export const LINE_CARDS: Record<Stance, LineCard> = {
  "far-left": {
    values: "Equality and care for people who work for a living.",
    story: "Each event is one instance of how ownership is organised.",
    protagonist:
      "Workers and collectives, set against concentrated capital as an institution: funds, owners of large firms, the rules that favour them.",
    given: "Profit taken from work is a choice the system makes, not a law.",
    vocabulary: "solidarity, ownership, class, public control",
    system:
      "Overhaul: the harm comes from how the system is built, not from one bad actor.",
    omissionRisk: "Individual agency, and the costs of public ownership.",
  },
  left: {
    values: "Care and fairness as equality.",
    story: "Who was harmed, and which rule failed them.",
    protagonist: "Affected people and the public services they depend on.",
    given: "Markets need rules, and public services are worth paying for.",
    vocabulary: "fair share, protections, accountable, public good",
    system: "Reform: the institutions can work if they are fixed and funded.",
    omissionRisk: "Compliance costs, and trade-offs against growth.",
  },
  center: {
    values: "Competence, evidence and proportion.",
    story: "What changed, and what the trade-off is.",
    protagonist: "The informed citizen, and the institution doing its job.",
    given: "Institutions mostly work, and most disputes have two real sides.",
    vocabulary: "trade-off, evidence, cost, open question",
    system: "Trust: the system needs maintenance, not replacement.",
    omissionRisk:
      "The moral stakes, and any critique of the system itself. The center is also a frame.",
  },
  right: {
    values: "Liberty, order, responsibility and fairness as proportion.",
    story: "Who earned it, who pays, and where the state reached too far.",
    protagonist: "Taxpayers, families and people who run small businesses.",
    given: "Ownership is legitimate, and effort should be rewarded.",
    vocabulary: "taxpayer, responsibility, red tape, overreach",
    system: "Reform: the state should do less and do it better.",
    omissionRisk: "Structural causes, and market failure.",
  },
  "far-right": {
    values: "Loyalty, authority and national continuity.",
    story: "Where a national interest was given up, and who decided that.",
    protagonist:
      "Citizens and their towns, set against unaccountable institutions: supranational bodies, foreign states and foreign funds, never a people or a group.",
    given: "Sovereignty comes first, and decisions belong close to voters.",
    vocabulary: "sovereignty, our towns, control, accountability",
    system:
      "Overhaul: the institutions have stopped answering to the people they serve.",
    omissionRisk: "The benefits of openness and interdependence.",
  },
}

const ARENA_NAMES: Record<Arena, string> = {
  fr: "France",
  us: "the United States",
}

const SCRUTINY_NAMES: Record<Scrutiny, string> = {
  government: "the government",
  regulators: "regulators",
  large_employers: "large employers",
  banks: "banks",
  large_landlords: "large landlords",
  public_spending: "public spending",
  tech_platforms: "tech platforms",
}

// The line as the writer reads it. `omissionRisk` stays out on purpose.
export function renderLine(line: Line) {
  const card = LINE_CARDS[line.stance]
  return [
    `Declared editorial line: ${line.stance} in ${ARENA_NAMES[line.arena]}. The account says so publicly. The line shapes what you emphasize, whose interests you center and how you judge. It never changes what is true.`,
    `- Values: ${card.values}`,
    `- What counts as the story: ${card.story}`,
    `- Protagonist: ${card.protagonist}`,
    `- Taken for granted: ${card.given}`,
    `- Words it reaches for, in the post's language: ${card.vocabulary}`,
    `- The system: ${card.system}`,
    ...(line.scrutiny.length
      ? [
          `When items concern these, give them a closer look: ${line.scrutiny.map((s) => SCRUTINY_NAMES[s]).join(", ")}. This only ranks what you read. It never supports an accusation.`,
        ]
      : []),
  ].join("\n")
}

const STYLE_TAKES: Record<Style, string> = {
  plain: "",
  deadpan:
    "The take is one dry line, stated flat, with no joke signposted. It adds no fact.",
  wry: "The take is one lightly amused line. It adds no fact and mocks no one who was hurt.",
}

export const renderStyle = (style: Style) => STYLE_TAKES[style]

// A machine with a stance or a funny style files a take and goes past the
// standards desk. Anything else is today's machine, down to the prompt.
export const usesDesk = (config: { line: Line | null; style: Style }) =>
  !!config.line || config.style !== "plain"

export const isFar = (line: Line | null) =>
  !!line && FAR_STANCES.includes(line.stance)

// Machines saved before this feature have neither field in their stored JSON,
// and the page reads that JSON without parsing it.
export const styleOf = (config: { style?: Style }) => config.style ?? "plain"
export const lineOf = (config: { line?: Line | null }) => config.line ?? null

// Staff write these by hand, one row per arena. `reviewed_until` is the promise
// that someone has read this arena's dates up to that moment.
export const electionWindow = z.object({
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
  label: z.string().max(120),
})

export const arenaCalendar = z.object({
  reviewed_until: z.iso.datetime({ offset: true }),
  windows: z.array(electionWindow),
})

export type LineStop = "frozen" | "no_calendar" | "not_public" | "line_left"

// Null when a line in this arena may publish now. A missing, unreadable or
// out-of-date calendar stops the line: nobody has said this moment is safe.
export function calendarStop(calendar: unknown, now: number): LineStop | null {
  const parsed = arenaCalendar.safeParse(calendar)
  if (!parsed.success) return "no_calendar"
  if (Date.parse(parsed.data.reviewed_until) <= now) return "no_calendar"
  const inside = parsed.data.windows.some(
    (w) => Date.parse(w.from) <= now && now < Date.parse(w.to)
  )
  return inside ? "frozen" : null
}
