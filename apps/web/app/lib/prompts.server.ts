import { TAG_GROUPS } from "@/components/comic-canvas/anima-tags"
import type { StoryRequest } from "@/routes/api.story"

// The LLM prompts, each a named template with a number. Changing what a
// template says means bumping its version, so a plan can be traced to the
// wording that made it.
export interface PromptTemplate<Input> {
  name: string
  version: number
  render: (input: Input) => string
}

export const promptId = (t: Pick<PromptTemplate<never>, "name" | "version">) =>
  `${t.name}@${t.version}`

function shape(p: { width: number; height: number }) {
  const r = p.width / p.height
  return r > 1.6 ? "wide" : r < 0.7 ? "tall" : "squarish"
}

// The tags Anima knows best, by group; the planner may add other Danbooru tags.
const VOCABULARY = TAG_GROUPS.filter((g) => g.id !== "count")
  .map((g) => `${g.label}: ${g.tags.join(", ")}`)
  .join("\n")

export const STORY_PLANNER: PromptTemplate<StoryRequest> = {
  name: "story-planner",
  version: 2,
  render(r) {
    const ids = r.panels.map((p) => p.id)
    return `You are a manga and comic storyboard artist planning one page of an Instagram comic.

The page already has ${ids.length} panel frame${ids.length > 1 ? "s" : ""}. Write exactly one shot per frame, in reading order (${r.rtl ? "right to left, manga style" : "left to right"}):
${r.panels.map((p, i) => `${i + 1}. panel_id "${p.id}", ${shape(p)} (${Math.round(p.width)}x${Math.round(p.height)})`).join("\n")}

If the story is written as "Panel 1: …" beats, follow them one beat per frame. Otherwise split the story into ${ids.length} beats that read well in this order: establish, build, pay off. Use wide frames for establishing shots and tall frames for full-body or vertical action.
${r.part ? `\nThis page is slide ${r.part.slide} of ${r.part.slides}. The story runs across all ${r.part.slides} slides: plan only the stretch that belongs on this slide, so the slides read in order and the ending lands on the last one. If the story is written as "Slide 1: …" beats, follow the beat for this slide. A short story is stretched over the slides, not told again on each.\n` : ""}
Cast (use these exact names in "characters" and as speakers; match names case-insensitively in the story, never invent cast members):
${r.cast.length ? r.cast.map((c) => `- ${c.name} (${c.kind})${c.tags.length ? `: ${c.tags.join(", ")}` : ""}`).join("\n") : "- none: characters stay unnamed, describe them in the prompt"}

The image model is Anima, an anime model that reads Danbooru tags and short English prose. For each frame:
- "tags": 3 to 10 lowercase Danbooru tags with spaces, not underscores, for framing, camera angle, gaze, expression, pose, setting, lighting and effects. Prefer this vocabulary:
${VOCABULARY}
  Never add subject-count tags (1girl, 2boys…), character names, hair or outfit tags of cast members, quality tags or style tags: the app adds those itself.
- "prompt": one or two plain English sentences describing the action, poses, expressions and setting. Cast members are referred to by name. Never quote dialogue, never mention text, letters, signs with writing, speech bubbles or captions: lettering is added later on top of the image.
- "characters": the cast names visible in the frame (may be empty).
- "dialogue": the lines lettered on this frame, at most 3, short enough for a speech bubble (under 90 characters each). kind "say" for speech ("Aki says: …"), "think" for thoughts ("Aki thinks: …"), "shout" for shouting, "caption" for narration boxes (speaker ""). Keep the story's own lines verbatim when it has them. Write dialogue in the language the story is written in. A frame can have no dialogue.

The art style of the comic is "${r.style}"; do not describe the style, only the content.${r.recap ? `\n\nThe previous slide showed:\n${r.recap}` : ""}`
  },
}
