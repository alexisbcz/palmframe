import * as React from "react"
import { useRevalidator } from "react-router"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import { ComputerIcon, Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Spinner } from "@workspace/ui/components/spinner"
import { useTheme } from "@workspace/ui/components/theme-provider"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"

import { Avatar } from "@/components/account/account-menu"
import { messages as toggles } from "@/components/toggles.messages"
import { LOCALES, LOCALE_NAMES, isLocale, useLocale, useT } from "@/i18n/core"
import type { Viewer } from "@/lib/database"
import { useSupabase } from "@/lib/supabase.browser"

import { messages } from "./settings.messages"

const AVATAR_SIZE = 256

// Centre-crops to a square and re-encodes, so uploads stay small.
async function squareAvatar(file: File) {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = AVATAR_SIZE
  canvas
    .getContext("2d")!
    .drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      AVATAR_SIZE,
      AVATAR_SIZE
    )
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("encode"))),
      "image/webp",
      0.9
    )
  )
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string
  hint?: string
  htmlFor?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm text-muted-foreground">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function Note({ ok, children }: { ok?: boolean; children: React.ReactNode }) {
  if (!children) return null
  return (
    <p
      role={ok ? "status" : "alert"}
      className={cn(
        "text-sm",
        ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
      )}
    >
      {children}
    </p>
  )
}

// One action at a time, with its result shown next to it.
function useRun() {
  const t = useT(messages)
  const revalidator = useRevalidator()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [note, setNote] = React.useState<{
    at: string
    ok: boolean
    text: string
  } | null>(null)

  const run = async (at: string, work: () => Promise<string | void>) => {
    setBusy(at)
    setNote(null)
    try {
      const ok = await work()
      if (ok) setNote({ at, ok: true, text: ok })
      revalidator.revalidate()
    } catch (e) {
      setNote({
        at,
        ok: false,
        text:
          e instanceof Error && e.message.startsWith("!")
            ? e.message.slice(1)
            : t("errors.generic"),
      })
    } finally {
      setBusy(null)
    }
  }
  const noteAt = (at: string) =>
    note?.at === at && <Note ok={note.ok}>{note.text}</Note>
  return { busy, run, noteAt }
}

export function ProfileSection({ viewer }: { viewer: Viewer }) {
  const t = useT(messages)
  const supabase = useSupabase()
  const { busy, run, noteAt } = useRun()
  const fileInput = React.useRef<HTMLInputElement>(null)
  const [name, setName] = React.useState(viewer.name)

  // Old pictures are deleted, so each account keeps one file.
  const clearAvatars = async (keep?: string) => {
    const bucket = supabase.storage.from("avatars")
    const { data } = await bucket.list(viewer.id)
    const stale = (data ?? [])
      .map((f) => `${viewer.id}/${f.name}`)
      .filter((p) => p !== keep)
    if (stale.length) await bucket.remove(stale)
  }

  const upload = (file: File) =>
    run("avatar", async () => {
      if (!file.type.startsWith("image/"))
        throw new Error(`!${t("errors.notImage")}`)
      const blob = await squareAvatar(file)
      const path = `${viewer.id}/avatar-${Date.now()}.webp`
      const bucket = supabase.storage.from("avatars")
      const { error } = await bucket.upload(path, blob, {
        contentType: "image/webp",
        cacheControl: "31536000",
      })
      if (error) throw error
      const avatar_url = bucket.getPublicUrl(path).data.publicUrl
      const { error: e2 } = await supabase.auth.updateUser({
        data: { avatar_url },
      })
      if (e2) throw e2
      await clearAvatars(path)
    })

  const removeAvatar = () =>
    run("avatar", async () => {
      const { error } = await supabase.auth.updateUser({
        data: { avatar_url: null },
      })
      if (error) throw error
      await clearAvatars()
    })

  return (
    <div className="flex flex-col gap-6">
      <Field label={t("profile.avatar")} hint={t("profile.avatarHint")}>
        <div className="flex items-center gap-4">
          <Avatar viewer={viewer} className="size-16 text-lg" />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              isDisabled={busy === "avatar"}
              onPress={() => fileInput.current?.click()}
            >
              {busy === "avatar" && <Spinner />}
              {viewer.avatarUrl ? t("profile.change") : t("profile.upload")}
            </Button>
            {viewer.avatarUrl && (
              <Button
                variant="ghost"
                isDisabled={busy === "avatar"}
                onPress={removeAvatar}
              >
                {t("profile.remove")}
              </Button>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ""
              if (file) void upload(file)
            }}
          />
        </div>
      </Field>
      {noteAt("avatar")}
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void run("name", async () => {
            const { error } = await supabase.auth.updateUser({
              data: { name: name.trim() },
            })
            if (error) throw error
            return t("profile.saved")
          })
        }}
      >
        <Field label={t("profile.name")} htmlFor="name">
          <div className="flex gap-2">
            <Input
              id="name"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
            <Button
              type="submit"
              variant="outline"
              isDisabled={
                busy === "name" || !name.trim() || name.trim() === viewer.name
              }
            >
              {busy === "name" && <Spinner />}
              {t("profile.save")}
            </Button>
          </div>
        </Field>
        {noteAt("name")}
      </form>
    </div>
  )
}

export function AccountSection({ viewer }: { viewer: Viewer }) {
  const t = useT(messages)
  const supabase = useSupabase()
  const { busy, run, noteAt } = useRun()
  const [password, setPassword] = React.useState("")

  return (
    <div className="flex flex-col gap-6">
      <Field
        label={t("account.email")}
        hint={t("account.emailHint")}
        htmlFor="email"
      >
        <Input
          id="email"
          value={viewer.email}
          readOnly
          className="bg-muted/50"
        />
      </Field>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void run("password", async () => {
            if (password.length < 8) throw new Error(`!${t("errors.tooShort")}`)
            const { error } = await supabase.auth.updateUser({ password })
            if (error) throw error
            setPassword("")
            return t("account.passwordSaved")
          })
        }}
      >
        <Field
          label={t("account.password")}
          hint={t("account.passwordHint")}
          htmlFor="password"
        >
          <div className="flex gap-2">
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button
              type="submit"
              variant="outline"
              isDisabled={busy === "password" || !password}
            >
              {busy === "password" && <Spinner />}
              {t("account.updatePassword")}
            </Button>
          </div>
        </Field>
        {noteAt("password")}
      </form>
    </div>
  )
}

export function PreferencesSection() {
  const t = useT(messages)
  const tt = useT(toggles)
  const { theme, setTheme } = useTheme()
  const { locale, setLocale } = useLocale()

  return (
    <div className="flex flex-col gap-6">
      <Field label={t("prefs.theme")}>
        <ToggleGroup
          variant="outline"
          spacing={0}
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[theme ?? "system"]}
          onSelectionChange={(keys) => {
            const next = [...keys][0]
            if (next) setTheme(String(next))
          }}
        >
          {(
            [
              ["light", Sun03Icon],
              ["dark", Moon02Icon],
              ["system", ComputerIcon],
            ] as const
          ).map(([id, icon]) => (
            <ToggleGroupItem key={id} id={id}>
              <HugeiconsIcon icon={icon} strokeWidth={2} />
              {tt(`theme.${id}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
      <Field label={t("prefs.language")} htmlFor="language">
        <NativeSelect
          id="language"
          value={locale}
          onChange={(e) =>
            isLocale(e.target.value) && setLocale(e.target.value)
          }
          className="w-56"
        >
          {LOCALES.map((l) => (
            <NativeSelectOption key={l} value={l}>
              {LOCALE_NAMES[l]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
    </div>
  )
}
