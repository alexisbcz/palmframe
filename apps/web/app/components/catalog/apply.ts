import {
  createText,
  uid,
  type Character,
  type PanelLayer,
  type WorldItem,
} from "@/components/comic-canvas/model"
import type { ComicEditor } from "@/components/comic-canvas/use-editor"

import type { Asset } from "./model"

export type Applied =
  | "cast"
  | "world"
  | "worn"
  | "backdrop"
  | "look"
  | "direction"
  | "sfx"
  | "story"
  | "needsPanel"
  | "needsCast"

// Official images are served from this app, and references get read by the
// server, so they have to be absolute by then.
const absolute = (url?: string | null) =>
  url?.startsWith("/") ? new URL(url, location.origin).href : (url ?? undefined)

const targetPanel = (editor: ComicEditor) => {
  const layers = editor.docRef.current.layers
  const selected = layers.find(
    (l): l is PanelLayer => l.type === "panel" && l.id === editor.selected?.id
  )
  return (
    selected ??
    layers.find((l): l is PanelLayer => l.type === "panel" && !l.src) ??
    layers.find((l): l is PanelLayer => l.type === "panel") ??
    null
  )
}

// Copies the asset into the carousel, as one or two undoable edits. Using it
// twice reuses the first copy rather than adding a duplicate.
export function applyAsset(editor: ComicEditor, asset: Asset): Applied {
  const { payload: p } = asset
  const project = editor.projectRef.current
  const panel = targetPanel(editor)

  if (p.type === "character") {
    const existing = project.cast?.find((c) => c.source === asset.id)
    const character: Character = existing ?? {
      id: uid(),
      name: asset.name,
      kind: p.character,
      tags: p.tags,
      portrait: absolute(asset.image),
      sheet: absolute(p.sheet),
      ...(p.sheet && { status: "approved" as const }),
      source: asset.id,
    }
    if (!existing) editor.saveCharacter(character)
    if (panel && !panel.cast?.includes(character.id))
      editor.update(panel.id, {
        cast: [...(panel.cast ?? []), character.id],
      })
    return "cast"
  }

  if (p.type === "world") {
    const existing = project.world?.find((w) => w.source === asset.id)
    const item: WorldItem = existing ?? {
      id: uid(),
      name: asset.name,
      kind: p.world,
      tags: p.tags,
      image: absolute(asset.image),
      source: asset.id,
    }
    if (!existing) editor.saveWorldItem(item)
    if (panel && !panel.world?.includes(item.id)) {
      // A panel happens in one place, so a location replaces the last.
      const places = (project.world ?? [])
        .filter((w) => w.kind === "location")
        .map((w) => w.id)
      const kept =
        item.kind === "location"
          ? (panel.world ?? []).filter((id) => !places.includes(id))
          : (panel.world ?? [])
      editor.update(panel.id, { world: [...kept, item.id] })
    }
    return "world"
  }

  if (p.type === "outfit") {
    const cast = project.cast ?? []
    const wearer =
      cast.find((c) => panel?.cast?.includes(c.id)) ?? cast[0] ?? null
    if (!wearer) return "needsCast"
    const outfit =
      wearer.outfits?.find((o) => o.name === asset.name) ??
      ({ id: uid(), name: asset.name, tags: p.tags } as const)
    if (!wearer.outfits?.some((o) => o.id === outfit.id))
      editor.saveCharacter({
        ...wearer,
        outfits: [
          ...(wearer.outfits ?? []),
          { ...outfit, tags: [...outfit.tags] },
        ],
      })
    if (panel?.cast?.includes(wearer.id))
      editor.update(panel.id, {
        outfits: { ...panel.outfits, [wearer.id]: outfit.id },
      })
    return "worn"
  }

  if (p.type === "backdrop") {
    if (!panel || !asset.image) return "needsPanel"
    editor.update(panel.id, {
      src: absolute(asset.image)!,
      model: asset.model ?? undefined,
      fit: "cover",
    })
    return "backdrop"
  }

  if (p.type === "look") {
    editor.setLook({ ...p.look, recipe: p.recipe })
    return "look"
  }

  if (p.type === "direction") {
    if (!panel) return "needsPanel"
    const tags = [...new Set([...(panel.tags ?? []), ...p.tags])]
    editor.update(panel.id, {
      tags,
      ...(p.prompt && !panel.prompt?.trim() && { prompt: p.prompt }),
    })
    return "direction"
  }

  if (p.type === "sfx") {
    const { width, height } = editor.docRef.current
    editor.add({
      ...createText({ x: width / 2, y: height / 2 }),
      name: asset.name,
      text: p.text,
      font: p.font,
      color: p.color,
      strokeColor: p.strokeColor,
      uppercase: false,
    })
    return "sfx"
  }

  if (p.type === "comic") return "needsPanel"

  const story = [p.brief, ...(p.facts ?? [])].join("\n")
  editor.commitProject((project) => ({ ...project, story }))
  return "story"
}
