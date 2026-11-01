import { parseScript } from "./fountain"
import { isSceneBreak, type Manuscript } from "./model"
import { compileStyle, STYLES } from "./styles"
import {
  compileRule,
  lintBlocks,
  parseRule,
  type Alert,
  type Block,
  type CompiledRule,
  type Level,
} from "./vale/vale"

const RANK: Record<Level, number> = { suggestion: 0, warning: 1, error: 2 }

const customCache = new Map<string, CompiledRule | Error>()

export function compileCustom(name: string, source: string) {
  const key = `${name}\n${source}`
  let hit = customCache.get(key)
  if (!hit) {
    try {
      hit = compileRule(`Custom.${name}`, parseRule(source))
    } catch (e) {
      hit = e instanceof Error ? e : new Error(String(e))
    }
    customCache.set(key, hit)
  }
  return hit
}

export function activeRules(m: Manuscript): CompiledRule[] {
  const muted = new Set(m.mutedRules)
  const rules = STYLES.filter((s) => m.styles.includes(s.id)).flatMap(
    compileStyle
  )
  const custom = m.customRules
    .map((r) => compileCustom(r.name, r.source))
    .filter((r): r is CompiledRule => !(r instanceof Error))
  return [...rules, ...custom].filter((r) => !muted.has(r.name))
}

// What a linter reads: never scene breaks or character names, and in a script,
// each element tagged so a rule can pick its scope.
export function blocksFor(m: Manuscript, body: string): Block[] {
  const blocks: Block[] = []
  const lines = body.split("\n")
  let at = 0
  if (m.kind === "screenplay") {
    const script = parseScript(body)
    const kinds: Record<string, string> = {
      action: "action",
      dialogue: "dialogue",
      parenthetical: "parenthetical",
      lyric: "dialogue",
    }
    let prev: Block | null = null
    script.forEach((l, i) => {
      const kind = kinds[l.type]
      if (kind && l.raw.trim()) {
        // Consecutive lines of one element read as one.
        if (prev && prev.kind === kind && kind !== "parenthetical")
          prev.text += `\n${l.raw}`
        else {
          prev = { text: l.raw, start: at, kind }
          blocks.push(prev)
        }
      } else prev = null
      at += lines[i]!.length + 1
    })
    return blocks
  }
  if (m.kind === "poetry") {
    let block: Block | null = null
    for (const line of lines) {
      if (!line.trim()) block = null
      else if (block) block.text += `\n${line}`
      else {
        block = { text: line, start: at, kind: "paragraph" }
        blocks.push(block)
      }
      at += line.length + 1
    }
    return blocks
  }
  for (const line of lines) {
    if (line.trim() && !isSceneBreak(line))
      blocks.push({ text: line, start: at, kind: "paragraph" })
    at += line.length + 1
  }
  return blocks
}

export function lintBody(m: Manuscript, body: string): Alert[] {
  const rules = activeRules(m)
  if (!rules.length) return []
  const accepted = new Set(m.accepted)
  return lintBlocks(blocksFor(m, body), rules, accepted).filter(
    (a) => RANK[a.level] >= RANK[m.minLevel]
  )
}
