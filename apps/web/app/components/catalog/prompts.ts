import {
  DEFAULT_LOOK,
  createPanel,
  type Look,
} from "@/components/comic-canvas/model"
import {
  BASE_NEGATIVE,
  lookOf,
  lookProse,
  lookTags,
} from "@/components/comic-canvas/use-generator"

import type { AssetKind } from "./model"

const NO_TEXT =
  "One single image filling the whole frame, edge to edge: no panels, no borders, no grid. Completely wordless: no text, no letters, no title, no signs, no labels, no speech bubbles."

// The same subject under every style and direction, so that cards of one
// kind can be compared at a glance.
const SUBJECT =
  "an adult woman in a long dark coat standing at a rainy city bus stop at night"

export function assetPrompt(
  kind: AssetKind,
  { words }: { words: string },
  look: Look = DEFAULT_LOOK
) {
  const panel = createPanel({ x: 0, y: 0, width: 3, height: 4 })
  const styled = lookProse(panel, lookOf(panel, look))
  const scene = {
    character: `Comic character portrait of an adult, ${words}. Waist up, three-quarter view, plain softly toned background, one person. Every detail listed is visible.`,
    creature: `Creature design portrait of ${words}, full figure, plain softly toned background, nobody else in the image.`,
    outfit: `Fashion illustration of one adult figure, seen full body from the front on a plain background, wearing ${words}. The clothes are the subject.`,
    location: `Wide eye-level establishing view of ${words}, with nobody in it.`,
    background: `Seamless full-bleed illustration of ${words}. No people, no characters.`,
    prop: `One object, ${words}, in three-quarter view on a plain off-white background, with nobody in the image.`,
    style: `A comic panel of ${SUBJECT}.`,
    shot: `A comic panel of ${SUBJECT}, composed as: ${words}.`,
    lighting: `A comic panel of ${SUBJECT}, lit with: ${words}.`,
    pose: `A comic panel of an adult figure in a dark coat, in this pose: ${words}.`,
    effect: `A comic panel of ${SUBJECT}, with this effect: ${words}.`,
    sfx: "",
    comic: "",
    // Saying "cover" gets a title drawn on it, so this is only ever a scene.
    story: `One dramatic illustrated scene: ${words}.`,
  }[kind]
  return [scene, styled, NO_TEXT].filter(Boolean).join(" ")
}

// Klein and Pruna both take the first image as what to keep.
export const sheetPrompt = (
  kind: "person" | "creature",
  words: string,
  look: Look = DEFAULT_LOOK
) => {
  const panel = createPanel({ x: 0, y: 0, width: 3, height: 2 })
  return [
    kind === "person"
      ? "Character model sheet of the person in the reference image, on a plain off-white background: full body front view, full body three-quarter view, and a large head-and-shoulders close-up. Same person, face, hair and clothes in every view."
      : "Creature model sheet of the creature in the reference image, on a plain off-white background: front view, side view, and a large close-up of its head. The same creature three times, and nothing else: no people, no humans.",
    `Look: ${words}.`,
    lookProse(panel, lookOf(panel, look)),
    NO_TEXT,
  ].join(" ")
}

const ANIMA_TAGS: Partial<Record<AssetKind, string>> = {
  character: "adult, solo, upper body, looking at viewer, simple background",
  creature: "no humans, monster, solo, full body, simple background",
  outfit: "solo, full body, standing, simple background",
  location: "scenery, no humans, wide shot",
  background: "no humans, scenery",
  prop: "no humans, still life, simple background, white background",
}

// The same request in Anima's language, for the cheap exploring renders.
export function animaAssetPrompt(
  kind: AssetKind,
  words: string,
  look: Look = DEFAULT_LOOK
) {
  const panel = createPanel({ x: 0, y: 0, width: 3, height: 4 })
  const styled = lookTags(panel, lookOf(panel, look))
  return {
    prompt: [ANIMA_TAGS[kind], words, ...styled.tags]
      .filter(Boolean)
      .join(", "),
    negative: [BASE_NEGATIVE, ...styled.negative].join(", "),
  }
}

// Sides on the 64 px grid the renderer needs.
export const renderSizeOf = (ratio: number) =>
  ratio > 1.2
    ? { width: 1024, height: 704 }
    : ratio < 0.9
      ? { width: 768, height: 1024 }
      : { width: 832, height: 832 }
