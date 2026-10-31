import {
  type ComicProject,
  LAYOUTS,
  createBubble,
  createDefaultProject,
  createPanel,
  layoutRects,
  uid,
} from "@/components/comic-canvas/model"

import type { Board } from "./model"

const CAPTION_WIDTH = 880
const CAPTION_HEIGHT = 200

// A carousel with one full-page panel per scene, each with its caption and
// prompt set, ready to draw in the editor. `story` lets a rerun plan from it.
export function comicFromBoard(board: Board): ComicProject {
  const project = createDefaultProject()
  const rect = layoutRects(LAYOUTS[0]!.cells, project.width, project.height)[0]!
  project.story = board.scenes.map((s) => s.scene).join("\n")
  project.pages = board.scenes.map((scene) => {
    const panel = createPanel(rect)
    panel.prompt = scene.scene
    if (!scene.caption) return { id: uid(), layers: [panel] }
    const caption = createBubble("caption", {
      x: project.width / 2,
      y: 170,
    })
    caption.text = scene.caption
    caption.width = CAPTION_WIDTH
    caption.height = CAPTION_HEIGHT
    caption.x = (project.width - CAPTION_WIDTH) / 2
    caption.fontSize = 36
    caption.uppercase = false
    return { id: uid(), layers: [panel, caption] }
  })
  return project
}
