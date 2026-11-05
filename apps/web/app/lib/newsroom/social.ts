// Posts prepared from a story, one per network. Shared by server and browser.
import type { Platform } from "./database"

export const PLATFORMS: Platform[] = ["linkedin", "x", "bluesky", "facebook"]

export const PLATFORM_INFO: Record<
  Platform,
  { name: string; limit: number; brief: string }
> = {
  linkedin: {
    name: "LinkedIn",
    limit: 3000,
    brief:
      "800 to 1,300 characters. A first line that earns the 'see more' click, short paragraphs, the one number that matters, a question or takeaway to close. Up to three hashtags at the end.",
  },
  x: {
    name: "X",
    limit: 280,
    brief:
      "One post under 280 characters including the link. The sharpest fact, plainly. No hashtags.",
  },
  bluesky: {
    name: "Bluesky",
    limit: 300,
    brief:
      "One post under 300 characters including the link. Conversational, specific, no hashtags.",
  },
  facebook: {
    name: "Facebook",
    limit: 2000,
    brief:
      "300 to 600 characters. Tell people what the story is and why it's worth a read, in a warm, plain voice.",
  },
}

// Links count as written: networks shorten some, but not all of them.
export const postLength = (text: string) => [...text].length

export function postProblems(platform: Platform, text: string) {
  const problems: string[] = []
  const { limit, name } = PLATFORM_INFO[platform]
  if (!text.trim()) problems.push(`The ${name} post is empty.`)
  if (postLength(text) > limit)
    problems.push(`${postLength(text)} characters, ${name} allows ${limit}.`)
  if (/—/.test(text)) problems.push("Use a comma or a period, not a dash.")
  return problems
}

// Every post carries the story's link, so readers can check the reporting.
export const withLink = (text: string, url: string) =>
  text.includes(url) ? text : `${text.trimEnd()}\n\n${url}`
