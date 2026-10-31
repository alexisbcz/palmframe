// Turns a push to main into a Bluesky post: a line of copy and a one-panel
// comic of the shop cat acting out what shipped. Dull pushes post nothing, and
// a failed writer or drawing falls back to something plainer, never to no post.
//
// DRY_RUN=1 writes the post to DRY_RUN_DIR instead of sending it.

import { appendFileSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const PRUNA = "https://api.pruna.ai/v1"
const BLUESKY = "https://bsky.social/xrpc"
const POST_LIMIT = 300
// Bluesky refuses image blobs over 976.56 KB.
const IMAGE_LIMIT = 976_560
const DIFF_LIMIT = 24_000
const CAT = new URL("../bluesky/cat.jpg", import.meta.url)

const STYLE =
  "Black and white European bande dessinee noir, thick confident brush ink, " +
  "large areas of solid black, fine cross-hatching, mechanical grey " +
  "screentone. Monochrome black, white and grey; the ONLY colour allowed is " +
  "vivid orange on the cat. No readable text, no letters, no logos, no " +
  "signature, no speech bubbles, no captions, no panel borders."

const WRITER = `You run the Bluesky account of Palmframe, an AI comic maker. A push just landed on main. Reply with JSON only:
{"post": boolean, "text": string, "scene": string, "alt": string}

post: false when nobody using Palmframe would care: typo fixes, refactors, dependency bumps, CI and internal tooling. Then leave the other fields empty.

text: at most 200 characters, for people who make comics, not for developers. Say what they can now do or what changed for them, plainly, like a person telling a friend. Never mention commits, diffs, file names, branches or code. No hashtags, no emoji, no exclamation marks, no "excited to announce", no "we're thrilled". Only claim what the changes show.

scene: one or two sentences describing a single wordless visual gag. The recurring star is a scruffy orange alley cat in a white printer's apron, a grumpy night-shift craftsman. He acts out the change as a physical job in a noir print shop, stairwell, back alley or newsstand, so the joke reads with no words. Describe only what he does and his surroundings, not how he looks. Any paper, page, sign or screen must be blank, because lettering comes out as gibberish.

alt: one sentence describing the scene for someone who can't see it.`

// For when the writer is unavailable: the commit subject, with a stock scene.
const STOCK_SCENES = [
  ["He hunches over a drafting table under one hanging lamp in a cramped print shop at night, inking a blank page with a brush.", "The orange shop cat inks a blank page at his drafting table under a single lamp."],
  ["He shoves a heavy crate of freshly printed blank pages down a rainy back alley on a rusty hand truck.", "The orange shop cat pushes a crate of pages down a rainy alley."],
  ["He hauls on the big lever of an old iron printing press in a dark print shop, blank sheets stacked high beside him.", "The orange shop cat works the lever of an old printing press."],
  ["He sits on a stool in a dark print shop, glaring at a blank page held up to a bare light bulb, a mug of coffee at his elbow.", "The orange shop cat inspects a blank page against a bare bulb."],
  ["He carries a tall wobbling stack of blank pages up a narrow noir stairwell, lit from one barred window.", "The orange shop cat climbs a dark stairwell with a tall stack of pages."],
  ["He hangs a row of blank wet pages on a line to dry in a shadowy print shop, clothes pegs in his mouth.", "The orange shop cat pegs wet pages on a drying line."],
]

const graphemes = (s) => [...new Intl.Segmenter().segment(s)].map((p) => p.segment)

function clip(s, max) {
  const parts = graphemes(s)
  return parts.length <= max ? s : `${parts.slice(0, max - 1).join("").trimEnd()}…`
}

async function json(res, label) {
  if (!res.ok) throw new Error(`${label}: ${res.status} ${await res.text()}`)
  return res.json()
}

async function changes(push) {
  const { REPO, GITHUB_TOKEN } = process.env
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/compare/${push.before}...${push.after}`,
    { headers: { authorization: `Bearer ${GITHUB_TOKEN}`, accept: "application/vnd.github+json" } }
  )
  const { files = [] } = await json(res, "compare")
  return files
    .filter((f) => !/(^|\/)(bun\.lock|package-lock\.json)$/.test(f.filename))
    .map((f) => `--- ${f.filename}\n${f.patch ?? "(binary or too large)"}`)
    .join("\n")
    .slice(0, DIFF_LIMIT)
}

async function askAnthropic(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5-5",
      max_tokens: 1000,
      system: WRITER,
      messages: [{ role: "user", content: prompt }],
    }),
  })
  const { content } = await json(res, "Anthropic")
  return content.find((b) => b.type === "text").text
}

async function write(subjects, diff) {
  const prompt = `Commits:\n${subjects.join("\n")}\n\nChanges:\n${diff}`
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set")
  const reply = await askAnthropic(prompt)
  const draft = JSON.parse(reply.slice(reply.indexOf("{"), reply.lastIndexOf("}") + 1))
  if (typeof draft.post !== "boolean") throw new Error(`Bad draft: ${reply}`)
  if (draft.post && !draft.text?.trim()) throw new Error(`Empty draft: ${reply}`)
  return draft
}

async function predict(model, input) {
  const headers = { apikey: process.env.PRUNA_API_KEY }
  let body = await json(
    await fetch(`${PRUNA}/predictions`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json", Model: model, "Try-Sync": "true" },
      body: JSON.stringify({ input }),
    }),
    "Pruna"
  )
  const deadline = Date.now() + 120_000
  while (body.status !== "succeeded") {
    if (["failed", "canceled"].includes(body.status) || Date.now() > deadline)
      throw new Error(`Pruna: ${JSON.stringify(body)}`)
    const url = body.get_url ?? `${PRUNA}/predictions/status/${body.id}`
    await new Promise((r) => setTimeout(r, 500))
    body = { ...(await json(await fetch(url, { headers }), "Pruna status")), get_url: url }
  }
  const url = [body.generation_url].flat()[0]
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`Pruna image: ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

async function draw(scene, seed) {
  const form = new FormData()
  form.set("content", new Blob([readFileSync(CAT)], { type: "image/jpeg" }), "cat.jpg")
  const { urls } = await json(
    await fetch(`${PRUNA}/files`, {
      method: "POST",
      headers: { apikey: process.env.PRUNA_API_KEY },
      body: form,
    }),
    "Pruna upload"
  )
  const image = await predict("p-image-edit", {
    images: [urls.get],
    prompt:
      "Image 1 is the orange alley cat with a torn ear and white apron. Draw " +
      "one new single illustration with exactly one of him, same design, " +
      "same black-and-white ink style, orange only on him, with a full " +
      `detailed background. ${scene}\n\n${STYLE}`,
    aspect_ratio: "4:3",
    seed,
  })
  if (image.length > IMAGE_LIMIT) throw new Error(`Image too big: ${image.length} bytes`)
  return image
}

async function send(text, facets, image, alt) {
  const xrpc = (method, body, headers) =>
    fetch(`${BLUESKY}/${method}`, { method: "POST", headers, body })
  const session = await json(
    await xrpc(
      "com.atproto.server.createSession",
      JSON.stringify({
        identifier: process.env.BLUESKY_HANDLE,
        password: process.env.BLUESKY_APP_PASSWORD,
      }),
      { "content-type": "application/json" }
    ),
    "Bluesky login"
  )
  const auth = { authorization: `Bearer ${session.accessJwt}` }
  const record = {
    $type: "app.bsky.feed.post",
    text,
    facets,
    createdAt: new Date().toISOString(),
  }
  if (image) {
    const { blob } = await json(
      await xrpc("com.atproto.repo.uploadBlob", image, { ...auth, "content-type": "image/jpeg" }),
      "Bluesky upload"
    )
    record.embed = {
      $type: "app.bsky.embed.images",
      images: [{ image: blob, alt, aspectRatio: { width: 4, height: 3 } }],
    }
  }
  const { uri } = await json(
    await xrpc(
      "com.atproto.repo.createRecord",
      JSON.stringify({ repo: session.did, collection: "app.bsky.feed.post", record }),
      { ...auth, "content-type": "application/json" }
    ),
    "Bluesky post"
  )
  return uri
}

function compose(body, linkText, link, drawn) {
  const footer = drawn ? ` · AI-drawn panel` : ""
  const tail = `\n\n${linkText}${footer}`
  const prefix = `${clip(body, POST_LIMIT - graphemes(tail).length)}\n\n`
  const encoder = new TextEncoder()
  const byteStart = encoder.encode(prefix).length
  return {
    text: prefix + linkText + footer,
    facets: [
      {
        index: { byteStart, byteEnd: byteStart + encoder.encode(linkText).length },
        features: [{ $type: "app.bsky.richtext.facet#link", uri: link }],
      },
    ],
  }
}

const push = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"))
const commits = push.commits.filter((c) => c.distinct && !c.message.startsWith("Merge "))
if (!commits.length) {
  console.log("Nothing to post.")
  process.exit(0)
}
const subjects = commits.map((c) => c.message.split("\n")[0].trim())
const single = commits.length === 1
const linkText = single ? "See the commit" : "See the changes"
const link = single ? commits[0].url : push.compare

const seed = parseInt(push.after.slice(0, 6), 16)

let draft
try {
  draft = await write(subjects, await changes(push))
} catch (e) {
  console.warn(`Writer failed, posting the commits: ${e.message}`)
  const [scene, alt] = STOCK_SCENES[seed % STOCK_SCENES.length]
  draft = { post: true, text: subjects.map((s) => (single ? s : `• ${s}`)).join("\n"), scene, alt }
}
if (!draft.post) {
  console.log(`Not worth a post: ${subjects.join("; ")}`)
  process.exit(0)
}

let image
if (draft.scene?.trim()) {
  try {
    image = await draw(draft.scene, seed)
  } catch (e) {
    console.warn(`Drawing failed, posting text only: ${e.message}`)
  }
}

const { text, facets } = compose(draft.text, linkText, link, !!image)
const alt = clip(draft.alt?.trim() || draft.scene || "", 900)
if (process.env.DRY_RUN) {
  const dir = process.env.DRY_RUN_DIR
  writeFileSync(join(dir, "post.json"), JSON.stringify({ text, facets, alt, scene: draft.scene }, null, 2))
  if (image) writeFileSync(join(dir, "panel.jpg"), image)
  console.log(`Dry run: ${text}`)
} else {
  const uri = await send(text, facets, image, alt).catch((e) => {
    if (!image) throw e
    console.warn(`Posting with the image failed, trying without: ${e.message}`)
    const plain = compose(draft.text, linkText, link, false)
    return send(plain.text, plain.facets)
  })
  console.log(`Posted ${uri}`)
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n\n${uri}\n`)
}
