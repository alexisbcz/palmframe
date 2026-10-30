import * as React from "react"
import { Link } from "react-router"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"
import { Switch } from "@workspace/ui/components/switch"

import { useLocale, useT } from "@/i18n/core"
import {
  API_SCOPES,
  MAX_KEY_CREDIT_LIMIT,
  isApiScope,
  type ApiScope,
} from "@/lib/api-scopes"

import { messages as accountMessages } from "./account.messages"
import { messages } from "./api-keys.messages"

interface ApiKey {
  id: string
  name: string
  prefix: string
  scopes: string[]
  credit_limit: number | null
  credits_spent: number
  project_ids: string[] | null
  last_used_at: string | null
  created_at: string
}

interface Project {
  id: string
  title: string
}

// The access form's state. `limit` is the text typed, empty for no limit.
interface Access {
  scopes: ApiScope[]
  limit: string
  // Null reaches every project.
  projects: string[] | null
}

const FULL_ACCESS: Access = {
  scopes: [...API_SCOPES],
  limit: "",
  projects: null,
}

const accessOf = (key: ApiKey): Access => ({
  scopes: key.scopes.filter(isApiScope),
  limit: key.credit_limit === null ? "" : String(key.credit_limit),
  projects: key.project_ids,
})

const limitOf = (limit: string) => (limit.trim() ? Number(limit) : null)

const isValid = ({ scopes, limit, projects }: Access) => {
  const credits = limitOf(limit) ?? 0
  return (
    !!scopes.length &&
    Number.isInteger(credits) &&
    credits >= 0 &&
    credits <= MAX_KEY_CREDIT_LIMIT &&
    projects?.length !== 0
  )
}

const accessBody = ({ scopes, limit, projects }: Access) => ({
  scopes,
  credit_limit: limitOf(limit),
  project_ids: projects,
})

function Toggle({
  label,
  hint,
  isSelected,
  onChange,
}: {
  label: string
  hint?: string
  isSelected: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm">{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </span>
      <Switch
        aria-label={label}
        size="sm"
        isSelected={isSelected}
        onChange={onChange}
        className="mt-0.5"
      />
    </div>
  )
}

// What a key may do, for a new key and for changing an existing one.
function AccessFields({
  id,
  access,
  projects,
  onChange,
}: {
  id: string
  access: Access
  projects: Project[]
  onChange: (access: Access) => void
}) {
  const t = useT(messages)
  const ta = useT(accountMessages)
  const toggle = <T,>(list: T[], item: T, on: boolean) =>
    on ? [...list, item] : list.filter((x) => x !== item)
  return (
    <div className="flex flex-col gap-4 rounded-lg border p-3">
      <div className="flex flex-col gap-2.5">
        <span className="text-sm text-muted-foreground">{t("scopes")}</span>
        {API_SCOPES.map((scope) => (
          <Toggle
            key={scope}
            label={t(`scope.${scope}`)}
            hint={t(`scope.${scope}Hint`)}
            isSelected={access.scopes.includes(scope)}
            onChange={(on) =>
              onChange({
                ...access,
                scopes: API_SCOPES.filter((s) =>
                  toggle(access.scopes, scope, on).includes(s)
                ),
              })
            }
          />
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={`${id}-limit`}
          className="text-sm text-muted-foreground"
        >
          {t("limit")}
        </label>
        <Input
          id={`${id}-limit`}
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_KEY_CREDIT_LIMIT}
          step={1}
          value={access.limit}
          placeholder={t("noLimit")}
          onChange={(e) => onChange({ ...access, limit: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">{t("limitHint")}</p>
      </div>
      <div className="flex flex-col gap-2.5">
        <span className="text-sm text-muted-foreground">{t("projects")}</span>
        <Toggle
          label={t("allProjects")}
          hint={t("allProjectsHint")}
          isSelected={!access.projects}
          onChange={(on) => onChange({ ...access, projects: on ? null : [] })}
        />
        {access.projects &&
          (projects.length ? (
            <div className="flex max-h-40 flex-col gap-2.5 overflow-y-auto border-t pt-2.5 pr-3">
              {projects.map((p) => (
                <Toggle
                  key={p.id}
                  label={p.title || ta("sync.untitled")}
                  isSelected={access.projects!.includes(p.id)}
                  onChange={(on) =>
                    onChange({
                      ...access,
                      projects: toggle(access.projects!, p.id, on),
                    })
                  }
                />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t("noProjects")}</p>
          ))}
      </div>
    </div>
  )
}

// Settings section for developer API keys. A new key is shown once; the
// server keeps only its hash.
export function ApiKeys() {
  const t = useT(messages)
  const { locale } = useLocale()
  const [keys, setKeys] = React.useState<ApiKey[] | null>(null)
  const [projects, setProjects] = React.useState<Project[]>([])
  const [name, setName] = React.useState("")
  const [access, setAccess] = React.useState(FULL_ACCESS)
  const [editing, setEditing] = React.useState<{
    id: string
    access: Access
  } | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [fresh, setFresh] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(async () => {
    const res = await fetch("/api/keys")
    if (!res.ok) return
    const json = await res.json()
    setKeys(json.keys)
    setProjects(json.projects)
  }, [])
  React.useEffect(() => {
    void load()
  }, [load])

  const run = async (at: string, work: () => Promise<void>) => {
    setBusy(at)
    setError(null)
    try {
      await work()
      await load()
    } catch (e) {
      setError(
        e instanceof Error && e.message === "too_many_keys"
          ? t("errors.tooMany")
          : t("errors.generic")
      )
    } finally {
      setBusy(null)
    }
  }

  const create = () =>
    run("create", async () => {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), ...accessBody(access) }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? "error")
      setFresh(json.key)
      setCopied(false)
      setName("")
      setAccess(FULL_ACCESS)
    })

  const save = () => {
    if (!editing) return
    void run(editing.id, async () => {
      const res = await fetch(
        `/api/keys?id=${encodeURIComponent(editing.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(accessBody(editing.access)),
        }
      )
      if (!res.ok) throw new Error("error")
      setEditing(null)
    })
  }

  const revoke = (id: string) => {
    if (!window.confirm(t("confirmRevoke"))) return
    void run(id, async () => {
      const res = await fetch(`/api/keys?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      })
      if (!res.ok) throw new Error("error")
    })
  }

  const summary = (k: ApiKey) => {
    const scopes = k.scopes
      .filter(isApiScope)
      .map((s) => t(`scope.${s}`))
      .join(", ")
    const reach = k.project_ids
      ? t("someProjects", {
          count: k.project_ids.filter((id) => projects.some((p) => p.id === id))
            .length,
        })
      : t("allProjects")
    const spent =
      k.credit_limit === null
        ? t("spent", { spent: k.credits_spent })
        : t("spentOf", { spent: k.credits_spent, limit: k.credit_limit })
    return [scopes, reach, spent].filter(Boolean).join(" · ")
  }

  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    })

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        {t("intro")}{" "}
        <Link to="/docs/api" className="underline underline-offset-4">
          {t("docs")}
        </Link>
      </p>

      {fresh && (
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <p role="status" className="text-sm">
            {t("created")}
          </p>
          <code className="rounded bg-muted px-2 py-1.5 font-mono text-xs break-all select-all">
            {fresh}
          </code>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onPress={() => {
                void navigator.clipboard.writeText(fresh)
                setCopied(true)
              }}
            >
              {copied ? t("copied") : t("copy")}
            </Button>
            <Button variant="ghost" onPress={() => setFresh(null)}>
              {t("done")}
            </Button>
          </div>
        </div>
      )}

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (isValid(access)) void create()
        }}
      >
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="api-key-name"
            className="text-sm text-muted-foreground"
          >
            {t("name")}
          </label>
          <div className="flex gap-2">
            <Input
              id="api-key-name"
              value={name}
              maxLength={60}
              placeholder={t("namePlaceholder")}
              onChange={(e) => setName(e.target.value)}
            />
            <Button
              type="submit"
              variant="outline"
              isDisabled={busy === "create" || !isValid(access)}
            >
              {busy === "create" && <Spinner />}
              {t("create")}
            </Button>
          </div>
        </div>
        <AccessFields
          id="api-key-new"
          access={access}
          projects={projects}
          onChange={setAccess}
        />
      </form>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {keys && !keys.length && (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      )}
      {!!keys?.length && (
        <ul className="flex flex-col divide-y rounded-lg border">
          {keys.map((k) => (
            <li key={k.id} className="flex flex-col gap-3 px-3 py-2.5">
              <div className="flex items-center gap-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">
                    {k.name || k.prefix}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    <code className="font-mono">{k.prefix}…</code> ·{" "}
                    {k.last_used_at
                      ? t("lastUsed", { date: date(k.last_used_at) })
                      : t("neverUsed")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {summary(k)}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  isDisabled={busy === k.id}
                  onPress={() =>
                    setEditing(
                      editing?.id === k.id
                        ? null
                        : { id: k.id, access: accessOf(k) }
                    )
                  }
                >
                  {t("edit")}
                </Button>
                <Button
                  variant="ghost"
                  className="text-destructive"
                  isDisabled={busy === k.id}
                  onPress={() => revoke(k.id)}
                >
                  {busy === k.id && <Spinner />}
                  {t("revoke")}
                </Button>
              </div>
              {editing?.id === k.id && (
                <div className="flex flex-col gap-3">
                  <AccessFields
                    id={`api-key-${k.id}`}
                    access={editing.access}
                    projects={projects}
                    onChange={(access) => setEditing({ id: k.id, access })}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      isDisabled={busy === k.id || !isValid(editing.access)}
                      onPress={save}
                    >
                      {t("save")}
                    </Button>
                    <Button variant="ghost" onPress={() => setEditing(null)}>
                      {t("cancel")}
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
