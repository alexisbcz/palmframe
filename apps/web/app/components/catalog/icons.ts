import {
  AiMagicIcon,
  BookOpen01Icon,
  Camera01Icon,
  CubeIcon,
  DashboardCircleIcon,
  FlashIcon,
  GhostIcon,
  Location01Icon,
  PaintBoardIcon,
  Sun03Icon,
  TextIcon,
  Tree06Icon,
  UserGroupIcon,
  UserIcon,
  VideoReplayIcon,
  WalkingIcon,
  ShirtIcon,
} from "@hugeicons/core-free-icons"

import type { AssetGroup, AssetKind } from "./model"

export const GROUP_ICONS: Record<AssetGroup, typeof UserIcon> = {
  cast: UserGroupIcon,
  world: Tree06Icon,
  look: PaintBoardIcon,
  direction: VideoReplayIcon,
  words: TextIcon,
}

export const KIND_ICONS: Record<AssetKind, typeof UserIcon> = {
  character: UserIcon,
  creature: GhostIcon,
  outfit: ShirtIcon,
  location: Location01Icon,
  background: DashboardCircleIcon,
  prop: CubeIcon,
  style: PaintBoardIcon,
  shot: Camera01Icon,
  lighting: Sun03Icon,
  pose: WalkingIcon,
  effect: FlashIcon,
  sfx: AiMagicIcon,
  story: BookOpen01Icon,
}
