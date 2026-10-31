import { FORMATS, type FormatDefinition, type FormatId } from "../model"

// Each format registers here. A missing one is simply not offered yet.
const REGISTRY: Partial<Record<FormatId, FormatDefinition>> = {}

export const formatDefinition = (id: FormatId) => REGISTRY[id] ?? null

export const availableFormats = () => FORMATS.filter((id) => REGISTRY[id])
