import * as React from "react"
import { cn } from "cn"
import { HugeiconsIcon } from "@hugeicons/react"
import { SentIcon } from "@hugeicons/core-free-icons"

import { Button } from "@workspace/ui/components/button"
import { ButtonGroup } from "@workspace/ui/components/button-group"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"
import { Textarea } from "@workspace/ui/components/textarea"

import { bookCall } from "@/lib/books/client"
import type { ChangeSetRow, MessageRow } from "@/lib/books/database"
import { stripTags } from "@/lib/books/inline"
import { BOOK_RATES } from "@/lib/books/model"
import type { BookStatusData } from "@/routes/studio.books.$id"

import {
  ErrorNote,
  Panel,
  PanelTitle,
  textProps,
  useAction,
  useBookT,
} from "./shared"

type Book = BookStatusData["book"]

function ChangeSet({
  book,
  set,
  onDone,
}: {
  book: Book
  set: ChangeSetRow
  onDone: () => Promise<void>
}) {
  const t = useBookT()
  const action = useAction()
  return (
    <li className="flex flex-col gap-2 rounded-xl bg-foreground/[0.03] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]">
          {set.summary}
          <span className="ms-2 font-normal text-muted-foreground">
            {t("assistant.items", { count: set.items.length })}
          </span>
        </p>
        {set.status === "proposed" ? (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              isDisabled={action.busy}
              onPress={() =>
                action
                  .run(() =>
                    bookCall("discardChanges", { id: book.id, set: set.id })
                  )
                  .then(onDone)
              }
            >
              {t("assistant.discard")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              isDisabled={action.busy}
              onPress={() =>
                action
                  .run(() =>
                    bookCall("applyChanges", { id: book.id, set: set.id })
                  )
                  .then(onDone)
              }
            >
              {t("assistant.apply")}
            </Button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">
            {set.status === "applied"
              ? t("assistant.applied", {
                  applied: set.applied,
                  skipped: set.skipped,
                })
              : t("assistant.discarded")}
          </span>
        )}
      </div>
      {set.status === "proposed" && (
        <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
          {set.items.slice(0, 40).map((item) => (
            <li
              key={item.segment_id}
              {...textProps(book.target_lang)}
              className="grid gap-1 font-serif text-sm [overflow-wrap:anywhere]"
            >
              <p className="text-muted-foreground line-through decoration-pink-400/60">
                {stripTags(item.before)}
              </p>
              <p>{stripTags(item.after)}</p>
            </li>
          ))}
        </ul>
      )}
      <ErrorNote code={action.error} />
    </li>
  )
}

export function AssistantPanel({
  book,
  selection,
  clearSelection,
}: {
  book: Book
  selection: string[]
  clearSelection: () => void
}) {
  const t = useBookT()
  const [messages, setMessages] = React.useState<MessageRow[]>([])
  const [sets, setSets] = React.useState<ChangeSetRow[]>([])
  const [draft, setDraft] = React.useState("")
  const [find, setFind] = React.useState("")
  const [replace, setReplace] = React.useState("")
  const [none, setNone] = React.useState(false)
  const send = useAction()
  const swap = useAction()
  const log = React.useRef<HTMLDivElement>(null)

  const loadSets = React.useCallback(async () => {
    const r = await bookCall<{ sets: ChangeSetRow[] }>("changeSets", {
      id: book.id,
    })
    setSets(r.sets)
  }, [book.id])

  React.useEffect(() => {
    void bookCall<{ messages: MessageRow[] }>("messages", { id: book.id })
      .then((r) => setMessages(r.messages))
      .catch(() => {})
    void loadSets().catch(() => {})
  }, [book.id, loadSets])

  React.useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight })
  }, [messages, send.busy])

  const submit = () => {
    const message = draft.trim()
    if (!message || send.busy) return
    setDraft("")
    setMessages((old) => [
      ...old,
      {
        id: `local-${old.length}`,
        role: "user",
        content: message,
      } as MessageRow,
    ])
    void send.run(async () => {
      const r = await bookCall<{ message: MessageRow }>("chat", {
        id: book.id,
        message,
        selected: selection,
      })
      setMessages((old) => [...old, r.message])
      clearSelection()
      await loadSets()
    })
  }

  return (
    <div className="@container">
      <div className="grid items-start gap-4 @3xl:grid-cols-2">
        <Panel className="flex min-h-[28rem] flex-col gap-3">
          <div
            ref={log}
            aria-live="polite"
            className="flex max-h-[55svh] flex-1 flex-col gap-3 overflow-y-auto"
          >
            {messages.length ? (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "max-w-[92%] rounded-xl px-3 py-2 text-sm [overflow-wrap:anywhere] whitespace-pre-wrap",
                    m.role === "user"
                      ? "ms-auto bg-foreground/10"
                      : "me-auto bg-foreground/[0.04]"
                  )}
                >
                  <span className="sr-only">
                    {m.role === "user"
                      ? t("assistant.you")
                      : t("assistant.name")}
                    :{" "}
                  </span>
                  {m.content}
                </div>
              ))
            ) : (
              <div className="m-auto max-w-sm text-center">
                <h2 className="studio-title text-xl">
                  {t("assistant.emptyTitle")}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("assistant.emptyText")}
                </p>
              </div>
            )}
            {send.busy && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner />
                {t("assistant.thinking")}
              </p>
            )}
          </div>
          <ErrorNote code={send.error} />
          {selection.length > 0 && (
            <p className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
              {t("assistant.selection", { count: selection.length })}
              <Button size="xs" variant="ghost" onPress={clearSelection}>
                {t("assistant.clear")}
              </Button>
            </p>
          )}
          <div className="flex flex-col gap-2">
            <Textarea
              value={draft}
              aria-label={t("assistant.placeholder")}
              placeholder={t("assistant.placeholder")}
              maxLength={4000}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  submit()
                }
              }}
            />
            <Button
              variant="outline"
              className="self-end"
              isDisabled={!draft.trim() || send.busy}
              onPress={submit}
            >
              {t("assistant.send", { cost: BOOK_RATES.chat })}
              <HugeiconsIcon
                icon={SentIcon}
                strokeWidth={2}
                data-icon="inline-end"
                className="rtl:-scale-x-100"
              />
            </Button>
          </div>
        </Panel>
        <div className="flex min-w-0 flex-col gap-4">
          <Panel className="flex flex-col gap-3">
            <PanelTitle>{t("assistant.replace")}</PanelTitle>
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                setNone(false)
                void swap.run(async () => {
                  const r = await bookCall<{ set: ChangeSetRow | null }>(
                    "replace",
                    { id: book.id, find, replace }
                  )
                  setNone(!r.set)
                  await loadSets()
                })
              }}
            >
              <Input
                value={find}
                aria-label={t("assistant.find")}
                placeholder={t("assistant.find")}
                {...textProps(book.target_lang)}
                onChange={(e) => setFind(e.target.value)}
              />
              <ButtonGroup className="w-full">
                <Input
                  value={replace}
                  aria-label={t("assistant.with")}
                  placeholder={t("assistant.with")}
                  {...textProps(book.target_lang)}
                  onChange={(e) => setReplace(e.target.value)}
                  className="min-w-0 flex-1"
                />
                <Button
                  type="submit"
                  variant="outline"
                  isDisabled={!find || swap.busy}
                >
                  {t("assistant.propose")}
                </Button>
              </ButtonGroup>
            </form>
            {none && (
              <p role="status" className="text-sm text-muted-foreground">
                {t("assistant.noChanges")}
              </p>
            )}
            <ErrorNote code={swap.error} />
          </Panel>
          <Panel className="flex flex-col gap-3">
            <PanelTitle>{t("assistant.proposals")}</PanelTitle>
            {sets.length ? (
              <ul className="flex flex-col gap-2">
                {sets.map((set) => (
                  <ChangeSet
                    key={set.id}
                    book={book}
                    set={set}
                    onDone={loadSets}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("assistant.noProposals")}
              </p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
