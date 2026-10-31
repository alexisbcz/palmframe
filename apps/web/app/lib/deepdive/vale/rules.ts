// The rules behind "formatted with Vale": written to a temp folder at run time,
// because a serverless bundle has no style directory of its own.
const list = (items: string[]) =>
  items.map((t) => `  - ${JSON.stringify(t)}`).join("\n")

const existence = (
  message: string,
  level: string,
  tokens: string[],
  extra = ""
) =>
  `extends: existence\nmessage: "${message}"\nlevel: ${level}\nignorecase: true\n${extra}tokens:\n${list(tokens)}\n`

export const VALE_INI = (styles: string) => `StylesPath = ${styles}
MinAlertLevel = warning

[*.md]
BasedOnStyles = Hustle
`

export const VALE_RULES: Record<string, string> = {
  "Corporate.yml": existence("Cut the corporate word '%s'.", "error", [
    "leverage",
    "leverages",
    "leveraging",
    "synergy",
    "synergies",
    "utilize",
    "utilizes",
    "utilizing",
    "stakeholders",
    "ecosystem",
    "seamless",
    "seamlessly",
    "robust",
    "game-changer",
    "game-changing",
    "innovative",
    "best-in-class",
    "world-class",
    "cutting-edge",
    "paradigm",
    "empower",
    "empowers",
    "empowering",
    "unlock",
    "unlocks",
    "unlocking",
    "solution",
    "solutions",
    "scalable",
    "holistic",
    "mission-critical",
  ]),
  "AITells.yml": existence("'%s' reads like a machine wrote it.", "error", [
    "delve",
    "delves",
    "tapestry",
    "testament",
    "in today's",
    "it's worth noting",
    "at its core",
    "underscores",
    "more than just",
    "isn't just",
    "aren't just",
    "not just about",
    "navigate the",
    "landscape",
    "realm",
    "ever-evolving",
    "fast-paced",
    "here's the thing",
    "the secret sauce",
    "let that sink in",
    "buckle up",
    "spoiler alert",
    "the takeaway\\?",
    "and that's the point",
    "make no mistake",
  ]),
  "EmDash.yml": `extends: existence\nmessage: "Use a period or a comma, not a dash."\nlevel: error\nnonword: true\ntokens:\n  - '—'\n  - ' – '\n`,
  "Adverbs.yml": existence("Parr's rule: cut the adverb '%s'.", "warning", [
    "very",
    "really",
    "quite",
    "extremely",
    "incredibly",
    "literally",
    "basically",
    "actually",
    "simply",
    "truly",
    "absolutely",
    "definitely",
    "certainly",
    "arguably",
    "essentially",
  ]),
  "Passive.yml": `extends: existence\nmessage: "'%s' looks passive. Who did it?"\nlevel: warning\nignorecase: true\nraw:\n  - '\\b(?:is|are|was|were|been|being)\\s+\\w+ed\\b'\n`,
  "Exclaim.yml": `extends: existence\nmessage: "Earn it with facts, not an exclamation mark."\nlevel: error\nnonword: true\nscope: sentence\ntokens:\n  - '!'\n`,
  "SentenceLength.yml": `extends: occurrence\nmessage: "Over 30 words. Split this sentence."\nlevel: error\nscope: sentence\nmax: 30\ntoken: '\\b\\w+\\b'\n`,
  "ParagraphLength.yml": `extends: occurrence\nmessage: "Too long for a phone. Keep paragraphs to four sentences."\nlevel: warning\nscope: paragraph\nmax: 4\ntoken: '[.?!](?:\\s|$)'\n`,
  "Readability.yml": `extends: metric\nmessage: "Reads at grade %s. Aim for 8 or under."\nlevel: warning\nformula: |\n  (0.39 * (words / sentences)) + (11.8 * (syllables / words)) - 15.59\ncondition: "> 8"\n`,
}
