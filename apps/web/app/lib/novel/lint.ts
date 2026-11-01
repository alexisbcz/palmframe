import { sceneTargets, type Novel } from "./model"

// What's wrong with a novel before anyone plays it. Codes map to messages.
export type IssueCode =
  | "noStart"
  | "unreachable"
  | "deadEnd"
  | "emptyScene"
  | "emptyLine"
  | "emptyOption"
  | "noArt"
  | "noPoseArt"
  | "noSound"
  | "missingTarget"
  | "noEnding"
  | "unnamedChoice"

export interface Issue {
  level: "error" | "warning"
  code: IssueCode
  scene?: string
  step?: string
  name?: string
}

export function lint(novel: Novel): Issue[] {
  const issues: Issue[] = []
  const ids = new Set(novel.scenes.map((s) => s.id))
  if (!novel.start || !ids.has(novel.start))
    issues.push({ level: "error", code: "noStart" })

  const reached = new Set<string>()
  const queue = novel.start ? [novel.start] : []
  while (queue.length) {
    const id = queue.pop()!
    if (reached.has(id)) continue
    reached.add(id)
    const scene = novel.scenes.find((s) => s.id === id)
    if (scene) queue.push(...sceneTargets(novel, scene))
  }

  let endings = 0
  for (const scene of novel.scenes) {
    const base = { scene: scene.id, name: scene.name }
    if (!reached.has(scene.id))
      issues.push({ level: "warning", code: "unreachable", ...base })
    if (!scene.steps.length) {
      issues.push({ level: "warning", code: "emptyScene", ...base })
      continue
    }
    const last = scene.steps.at(-1)!
    const leaves =
      last.t === "jump" ||
      last.t === "end" ||
      last.t === "return" ||
      last.t === "map" ||
      (last.t === "choice" && last.options.every((o) => o.goto)) ||
      (last.t === "if" && !!last.then && !!last.otherwise)
    if (!leaves) issues.push({ level: "warning", code: "deadEnd", ...base })

    for (const step of scene.steps) {
      const at = { ...base, step: step.id }
      if (step.t === "end") endings++
      if (step.t === "say" && !step.text.trim())
        issues.push({ level: "error", code: "emptyLine", ...at })
      if (step.t === "choice") {
        if (!step.options.length)
          issues.push({ level: "error", code: "emptyOption", ...at })
        for (const o of step.options)
          if (!o.text.trim())
            issues.push({ level: "error", code: "emptyOption", ...at })
      }
      for (const target of sceneTargets(novel, { ...scene, steps: [step] }))
        if (!ids.has(target))
          issues.push({ level: "error", code: "missingTarget", ...at })
      if ((step.t === "bg" || step.t === "cg") && step.ref) {
        const b = novel.backdrops.find((x) => x.id === step.ref)
        if (!b?.url)
          issues.push({
            level: "warning",
            code: "noArt",
            ...at,
            name: b?.name ?? "?",
          })
      }
      if (step.t === "show") {
        const c = novel.characters.find((x) => x.id === step.who)
        const pose = c?.sprites.find((p) => p.id === step.pose) ?? c?.sprites[0]
        if (!pose?.url)
          issues.push({
            level: "warning",
            code: "noPoseArt",
            ...at,
            name: c?.name ?? "?",
          })
      }
      if (step.t === "music" || step.t === "ambience" || step.t === "sfx") {
        if (step.track) {
          const k = novel.tracks.find((x) => x.id === step.track)
          if (!k?.url && !k?.recipe)
            issues.push({
              level: "warning",
              code: "noSound",
              ...at,
              name: k?.name ?? "?",
            })
        }
      }
    }
  }
  if (novel.scenes.length && !endings)
    issues.push({ level: "warning", code: "noEnding" })
  // One problem once: ten lines using one unpainted set is one thing to do.
  const seen = new Set<string>()
  return issues.filter((i) => {
    if (i.code !== "noArt" && i.code !== "noPoseArt" && i.code !== "noSound")
      return true
    const key = `${i.code}:${i.name}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
