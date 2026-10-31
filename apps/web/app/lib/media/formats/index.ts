import { FORMATS, type FormatDefinition, type FormatId } from "../model"
import { blog } from "./blog"
import { instagramCarousel } from "./instagram_carousel"
import { linkedin } from "./linkedin"
import { substack } from "./substack"
import { xThread } from "./x_thread"
import { youtube } from "./youtube"

// Each format registers here. A missing one is simply not offered yet.
const REGISTRY: Partial<Record<FormatId, FormatDefinition>> = {
  blog,
  substack,
  linkedin,
  x_thread: xThread,
  instagram_carousel: instagramCarousel,
  youtube,
}

export const formatDefinition = (id: FormatId) => REGISTRY[id] ?? null

export const availableFormats = () => FORMATS.filter((id) => REGISTRY[id])
