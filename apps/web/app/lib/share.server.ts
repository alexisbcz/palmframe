import { randomBytes } from "node:crypto"

import {
  toProject,
  type ComicProject,
  type Layer,
} from "@/components/comic-canvas/model"

import { supabaseAdmin } from "./supabase-admin.server"

// Reader links: the first thing anyone sees of a person's work without an
// account. The table stays closed to anon; the server reads it with the secret
// key, so this file is the whole of what the public gets.
const TOKEN = /^[A-Za-z0-9_-]{43}$/

// 256 random bits, 43 characters: the format the database requires.
export const newShareToken = () => randomBytes(32).toString("base64url")

// Only what the renderer draws, by allow-list so a field added to the model
// later stays private until it's added here: no prompts, seeds, versions or
// cast sheets, no translations, and nothing the owner has hidden.
function readerLayer(l: Layer): Layer {
  const base = {
    id: l.id, // Seeds the outline of shout bubbles.
    name: "",
    x: l.x,
    y: l.y,
    width: l.width,
    height: l.height,
    rotation: l.rotation,
    opacity: l.opacity,
    hidden: false,
    locked: false,
  }
  if (l.type === "panel")
    return {
      ...base,
      type: l.type,
      src: l.src,
      fit: l.fit,
      imageZoom: l.imageZoom,
      panX: l.panX,
      panY: l.panY,
      flipX: l.flipX,
      flipY: l.flipY,
      fill: l.fill,
      borderWidth: l.borderWidth,
      borderColor: l.borderColor,
      radius: l.radius,
      blur: l.blur,
      brightness: l.brightness,
      contrast: l.contrast,
      saturation: l.saturation,
      grayscale: l.grayscale,
    }
  if (l.type === "bubble")
    return {
      ...base,
      type: l.type,
      shape: l.shape,
      text: l.text,
      font: l.font,
      fontSize: l.fontSize,
      uppercase: l.uppercase,
      textColor: l.textColor,
      fill: l.fill,
      borderColor: l.borderColor,
      borderWidth: l.borderWidth,
      tail: l.tail,
      tailX: l.tailX,
      tailY: l.tailY,
    }
  return {
    ...base,
    type: l.type,
    text: l.text,
    font: l.font,
    fontSize: l.fontSize,
    uppercase: l.uppercase,
    align: l.align,
    color: l.color,
    strokeColor: l.strokeColor,
    strokeWidth: l.strokeWidth,
  }
}

export function readerProject(p: ComicProject): ComicProject {
  return {
    version: 2,
    width: p.width,
    height: p.height,
    background: p.background,
    pages: p.pages.map((page, i) => ({
      id: String(i),
      layers: page.layers.filter((l) => !l.hidden).map(readerLayer),
    })),
  }
}

// The project behind a live link, or null. Exact match on the whole token: a
// malformed one never reaches the database, and a revoked one matches nothing.
export async function readShared(token: string) {
  if (!TOKEN.test(token)) return null
  const { data, error } = await supabaseAdmin()
    .from("comic_projects")
    .select("title, data")
    .eq("share_token", token)
    .maybeSingle()
  if (error) throw error
  const project = data && toProject(data.data)
  if (!data || !project) return null
  return { title: data.title, project: readerProject(project) }
}
