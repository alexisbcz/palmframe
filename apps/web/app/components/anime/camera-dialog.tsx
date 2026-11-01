import * as React from "react"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Camera01Icon,
  Cancel01Icon,
  Move01Icon,
} from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import { Dialog, DialogTitle } from "@workspace/ui/components/dialog"

import {
  ApertureArt,
  CameraArt,
  LensArt,
  LightArt,
  MovementArt,
} from "@/components/anime/preset-art"
import { Wheel } from "@/components/anime/wheel"
import { useT } from "@/i18n/core"
import {
  APERTURES,
  AUTO_SETUP,
  CAMERAS,
  LENSES,
  LIGHTS,
  MOVEMENTS,
  type CameraSetup,
} from "@/lib/anime/model"
import { messages } from "@/routes/anime.messages"

export type CameraTab = "setup" | "movement"

const CAMERA_SIZE = {
  auto: 0.8,
  cel: 0.9,
  ova: 0.85,
  theatrical: 1,
  digital: 0.8,
  dv: 0.65,
}

// Auto goes in the middle of a dial, so a fresh one shows choices both ways.
function centered<T extends string>(list: readonly T[]) {
  const rest = list.filter((id) => id !== "auto")
  const middle = Math.floor(rest.length / 2)
  return [...rest.slice(0, middle), "auto" as T, ...rest.slice(middle)]
}

export function CameraDialog({
  value,
  tab,
  onTab,
  onChange,
  onClose,
}: {
  value: CameraSetup
  tab: CameraTab
  onTab: (tab: CameraTab) => void
  onChange: (next: CameraSetup) => void
  onClose: () => void
}) {
  const t = useT(messages)
  const set = (patch: Partial<CameraSetup>) => onChange({ ...value, ...patch })
  const tabs = [
    { id: "setup", label: t("camera.setup"), glyph: Camera01Icon },
    { id: "movement", label: t("camera.movement"), glyph: Move01Icon },
  ] as const
  return (
    <Dialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      showCloseButton={false}
      className="dark anime gap-0 rounded-3xl bg-[oklch(0.2_0.003_260)] p-0 text-white sm:max-w-3xl"
    >
      <div className="flex items-center justify-between gap-2 p-4 pb-3">
        <DialogTitle className="text-base font-semibold">
          {t("camera.title")}
        </DialogTitle>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            className="rounded-full"
            onPress={() => onChange(AUTO_SETUP)}
          >
            {t("camera.reset")}
          </Button>
          <Button
            variant="secondary"
            size="icon-sm"
            className="rounded-full"
            aria-label={t("camera.close")}
            onPress={onClose}
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-col md:flex-row">
        <div className="flex shrink-0 gap-1 p-3 md:w-44 md:flex-col md:border-e md:border-white/5">
          {tabs.map((x) => (
            <button
              key={x.id}
              type="button"
              aria-pressed={tab === x.id}
              onClick={() => onTab(x.id)}
              className={cn(
                "flex items-center gap-2 rounded-xl px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--anime-accent)]",
                tab === x.id
                  ? "bg-white/10 font-medium text-white"
                  : "text-muted-foreground hover:text-white"
              )}
            >
              <HugeiconsIcon
                icon={x.glyph}
                strokeWidth={2}
                className="size-4.5"
              />
              {x.label}
            </button>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 gap-3 divide-x divide-white/5 overflow-hidden px-4 pt-3 pb-1">
          {tab === "setup" ? (
            <>
              <Wheel
                label={t("camera.colCamera")}
                value={value.camera}
                onChange={(camera) => set({ camera })}
                options={centered(CAMERAS).map((id) => ({
                  id,
                  label: t(`presets.camera.${id}`),
                  art: <CameraArt size={CAMERA_SIZE[id]} />,
                }))}
              />
              <Wheel
                label={t("camera.colLens")}
                value={value.lens}
                onChange={(lens) => set({ lens })}
                options={centered(LENSES).map((id) => ({
                  id,
                  label: t(`presets.lens.${id}`),
                  art: <LensArt id={id} />,
                }))}
              />
              <Wheel
                label={t("camera.colAperture")}
                value={value.aperture}
                onChange={(aperture) => set({ aperture })}
                options={centered(APERTURES).map((id) => ({
                  id,
                  label: t(`presets.aperture.${id}`),
                  art: <ApertureArt id={id} />,
                }))}
              />
            </>
          ) : (
            <>
              <Wheel
                label={t("camera.colMovement")}
                value={value.movement}
                onChange={(movement) => set({ movement })}
                options={centered(MOVEMENTS).map((id) => ({
                  id,
                  label: t(`presets.movement.${id}`),
                  art: <MovementArt id={id} />,
                }))}
              />
              <Wheel
                label={t("camera.colLight")}
                value={value.light}
                onChange={(light) => set({ light })}
                options={centered(LIGHTS).map((id) => ({
                  id,
                  label: t(`presets.light.${id}`),
                  art: <LightArt id={id} />,
                }))}
              />
            </>
          )}
        </div>
      </div>
    </Dialog>
  )
}
