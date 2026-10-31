// Regenerates packages/ui/src/icons/core-free-icons.ts: bun scripts/build-game-icons.ts
// Names missing from GAME keep their Hugeicons drawing.
import { writeFileSync } from "node:fs"
import { resolve } from "node:path"

// @ts-expect-error The real package, past the tsconfig alias; it ships no types here.
import * as hugeicons from "../node_modules/@hugeicons/core-free-icons/dist/esm/index.js"

const GAME_ICONS_COMMIT = "82d948812bfe3f269ef8f731dcdb07b08160edc4"

const GAME: Record<string, string> = {
  AiMagicIcon: "delapouite/sparkles",
  Alert02Icon: "lorc/hazard-sign",
  ArrowExpandIcon: "delapouite/expand",
  ArrowReloadHorizontalIcon: "lorc/cycle",
  BookOpen01Icon: "delapouite/book-cover",
  BubbleChatIcon: "delapouite/chat-bubble",
  Calendar03Icon: "delapouite/calendar",
  Camera01Icon: "delapouite/photo-camera",
  CheckmarkCircle02Icon: "delapouite/check-mark",
  Clock01Icon: "delapouite/alarm-clock",
  CloudIcon: "seregacthtuf/thought-bubble",
  Coins01Icon: "delapouite/two-coins",
  Crown02Icon: "lorc/crown",
  CubeIcon: "delapouite/cube",
  Delete02Icon: "delapouite/trash-can",
  DiceIcon: "delapouite/perspective-dice-five",
  Download01Icon: "delapouite/cloud-download",
  Edit02Icon: "delapouite/pencil",
  Flag02Icon: "delapouite/flag-objective",
  FlashIcon: "lorc/lightning-helix",
  FlipHorizontalIcon: "delapouite/horizontal-flip",
  FlipVerticalIcon: "delapouite/vertical-flip",
  FloppyDiskIcon: "delapouite/save",
  FolderLibraryIcon: "delapouite/full-folder",
  FolderOpenIcon: "delapouite/open-folder",
  GhostIcon: "lorc/ghost",
  GlobalIcon: "lorc/globe",
  InformationCircleIcon: "delapouite/info",
  LanguageSkillIcon: "lorc/globe",
  Layers01Icon: "delapouite/stack",
  LibraryIcon: "delapouite/bookshelf",
  Link01Icon: "lorc/linked-rings",
  Location01Icon: "delapouite/position-marker",
  LockIcon: "delapouite/plain-padlock",
  LockPasswordIcon: "delapouite/plain-padlock",
  MagicWand01Icon: "lorc/fairy-wand",
  Mail01Icon: "lorc/envelope",
  Message01Icon: "skoll/talk",
  Moon02Icon: "lorc/moon",
  Note01Icon: "delapouite/notebook",
  PaintBoardIcon: "delapouite/palette",
  PaintBrush01Icon: "delapouite/paint-brush",
  Pen01Icon: "lorc/quill-ink",
  PencilEdit01Icon: "delapouite/pencil",
  PencilEdit02Icon: "delapouite/pencil",
  PersonStandingIcon: "delapouite/person",
  PlayIcon: "guard13007/play-button",
  Redo02Icon: "delapouite/clockwise-rotation",
  RotateCcwIcon: "delapouite/anticlockwise-rotation",
  RotateCwIcon: "delapouite/clockwise-rotation",
  ScissorIcon: "lorc/scissors",
  Search01Icon: "lorc/magnifying-glass",
  SearchIcon: "lorc/magnifying-glass",
  Settings01Icon: "lorc/cog",
  Settings02Icon: "lorc/cog",
  ShirtIcon: "delapouite/t-shirt",
  SparklesIcon: "delapouite/sparkles",
  SquareUnlock02Icon: "delapouite/padlock-open",
  StopIcon: "delapouite/stop-sign",
  Sun03Icon: "lorc/sun",
  Target02Icon: "lorc/on-target",
  Tick02Icon: "delapouite/check-mark",
  Undo02Icon: "delapouite/anticlockwise-rotation",
  Upload04Icon: "delapouite/cloud-upload",
  UserCircleIcon: "delapouite/person",
  UserGroupIcon: "delapouite/meeple-group",
  UserIcon: "delapouite/person",
  VideoReplayIcon: "delapouite/video-camera",
}

const KEEP_HUGEICONS = [
  "Add01Icon",
  "ApiIcon",
  "ArrowDown01Icon",
  "ArrowDown02Icon",
  "ArrowLeft01Icon",
  "ArrowLeftIcon",
  "ArrowRight01Icon",
  "ArrowRightIcon",
  "ArrowUp01Icon",
  "AtIcon",
  "BringToFrontIcon",
  "Cancel01Icon",
  "ClipboardIcon",
  "CloudOffIcon",
  "ColorPickerIcon",
  "CommandIcon",
  "ComputerIcon",
  "Copy01Icon",
  "CreditCardIcon",
  "CropIcon",
  "DashboardCircleIcon",
  "DashboardSpeed02Icon",
  "Eraser01Icon",
  "FavouriteIcon",
  "FileAddIcon",
  "FilterIcon",
  "GitCompareIcon",
  "GridViewIcon",
  "Image01Icon",
  "Image02Icon",
  "ImageAdd01Icon",
  "ImageUploadIcon",
  "ImageUpscaleIcon",
  "InstagramIcon",
  "Jpg01Icon",
  "LayoutGridIcon",
  "LinkSquare02Icon",
  "Loading03Icon",
  "Login03Icon",
  "Logout01Icon",
  "MinusSignIcon",
  "MoreHorizontalCircle01Icon",
  "MoreHorizontalIcon",
  "MultiplicationSignCircleIcon",
  "Pdf01Icon",
  "PlugSocketIcon",
  "PlusSignIcon",
  "Png01Icon",
  "ScanEyeIcon",
  "SendToBackIcon",
  "SidebarLeftIcon",
  "SlidersHorizontalIcon",
  "SmileIcon",
  "SquareIcon",
  "TextAlignCenterIcon",
  "TextAlignLeftIcon",
  "TextAlignRightIcon",
  "TextAllCapsIcon",
  "TextIcon",
  "Tree06Icon",
  "UnfoldMoreIcon",
  "UserAdd01Icon",
  "ViewIcon",
  "ViewOffSlashIcon",
  "WalkingIcon",
  "ZoomInAreaIcon",
]

async function solid(file: string) {
  const url = `https://raw.githubusercontent.com/game-icons/icons/${GAME_ICONS_COMMIT}/${file}.svg`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${file}: ${response.status}`)
  const svg = await response.text()
  if (svg.includes("transform=")) throw new Error(`${file}: uses a transform`)
  // Every file is a black square with the drawing in white on top.
  const nodes = [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"[^>]*>/g)]
    .filter(([tag]) => tag.includes('fill="#fff"'))
    .map(([, d]) => ["path", { d }])
  if (!nodes.length) throw new Error(`${file}: no drawing found`)
  return nodes
}

const lines = [
  "// Generated by apps/web/scripts/build-game-icons.ts. Do not edit.",
  "// Solid icons: game-icons.net (CC BY 3.0), see GAME-ICONS-CREDITS.md.",
  'import type { IconSvgElement, Nodes } from "./react"',
  "",
]
for (const name of Object.keys(GAME).sort()) {
  const nodes = await solid(GAME[name]!)
  lines.push(
    `export const ${name}: IconSvgElement = ${JSON.stringify({ solid: true, nodes })}`
  )
}
for (const name of KEEP_HUGEICONS) {
  const icon = (hugeicons as unknown as Record<string, unknown>)[name]
  if (!icon) throw new Error(`Unknown Hugeicon ${name}`)
  // The export panel builds its WebP and PSD badges from the PNG's nodes.
  const type = name === "Png01Icon" ? "Nodes" : "IconSvgElement"
  lines.push(`export const ${name}: ${type} = ${JSON.stringify(icon)}`)
}
writeFileSync(
  resolve(
    import.meta.dirname,
    "../../../packages/ui/src/icons/core-free-icons.ts"
  ),
  lines.join("\n") + "\n"
)
console.log(Object.keys(GAME).length, "solid,", KEEP_HUGEICONS.length, "kept")
