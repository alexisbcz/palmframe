import { Agent, type AgentTool } from "@earendil-works/pi-agent-core"
import { createModels } from "@earendil-works/pi-ai"
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic"
import { openrouterProvider } from "@earendil-works/pi-ai/providers/openrouter"
import { Type } from "typebox"

import { payingConnection } from "@/lib/openrouter.server"
import { supabaseAdmin } from "@/lib/supabase-admin.server"

import { BOOK_MODEL, fakeEnabled, modelAvailable } from "./ai.server"
import type { BookRow, ChangeItem, MessageRow, SegmentRow } from "./database"
import { stripTags } from "./inline"
import { MAX_CHANGES, MAX_MESSAGE } from "./limits"
import { BOOK_RATES, DEFAULT_STYLE } from "./model"
import { assistantSystem } from "./prompts"
import { repo } from "./repo.server"
import {
  BookError,
  getBook,
  proposeChanges,
  segments as querySegments,
  type Actor,
} from "./service.server"

const BUDGET_MS = 120_000
const HISTORY = 12
const RESULTS = 30

const reply = (t: string) => ({
  content: [{ type: "text" as const, text: t }],
  details: {},
})

interface Turn {
  changeSet: string | null
}

const line = (s: SegmentRow) =>
  JSON.stringify({
    id: s.id,
    status: s.status,
    source: s.source,
    target: s.target,
  })

function tools(book: BookRow, actor: Actor, turn: Turn): AgentTool<any>[] {
  const propose = async (summary: string, items: ChangeItem[]) => {
    if (!items.length)
      return "Nothing to change: no segment would be different."
    const set = await proposeChanges(book, summary, items)
    turn.changeSet = set.id
    return `Proposed ${items.length} change(s) for the owner to review.`
  }
  return [
    {
      name: "search_book",
      label: "Search",
      description:
        "Find segments whose source or translation contains some text. Returns ids, statuses and both sides.",
      parameters: Type.Object({ query: Type.String() }),
      execute: async (_id, params) => {
        const { query } = params as { query: string }
        const { segments } = await querySegments(actor, book.id, {
          search: query,
        })
        return reply(
          segments.length
            ? segments
                .slice(0, RESULTS)
                .map((s) =>
                  JSON.stringify({
                    id: s.id,
                    status: s.status,
                    source: s.source,
                    target: s.target,
                  })
                )
                .join("\n")
            : "No matches."
        )
      },
    },
    {
      name: "read_segments",
      label: "Read",
      description: "Read specific segments by id.",
      parameters: Type.Object({ ids: Type.Array(Type.String()) }),
      execute: async (_id, params) => {
        const { ids } = params as { ids: string[] }
        const { data } = await supabaseAdmin()
          .from("book_segments")
          .select("*")
          .eq("book_id", book.id)
          .in("id", ids.slice(0, RESULTS))
        return reply((data ?? []).map(line).join("\n") || "Not found.")
      },
    },
    {
      name: "get_glossary",
      label: "Glossary",
      description: "The book's approved glossary.",
      parameters: Type.Object({}),
      execute: async () =>
        reply(JSON.stringify((await repo.terms(book)).slice(0, 500))),
    },
    {
      name: "propose_changes",
      label: "Propose",
      description:
        "Propose new translations for specific segments. The owner reviews them before anything changes. Keep inline tags as they are in each segment.",
      parameters: Type.Object({
        summary: Type.String(),
        changes: Type.Array(
          Type.Object({ segment_id: Type.String(), text: Type.String() })
        ),
      }),
      execute: async (_id, params) => {
        const { summary, changes } = params as {
          summary: string
          changes: { segment_id: string; text: string }[]
        }
        const { data } = await supabaseAdmin()
          .from("book_segments")
          .select("*")
          .eq("book_id", book.id)
          .in(
            "id",
            changes.slice(0, MAX_CHANGES).map((c) => c.segment_id)
          )
        const rows = new Map((data ?? []).map((s) => [s.id, s]))
        const locked = (data ?? []).filter((s) => s.status === "locked").length
        const items = changes.flatMap((c) => {
          const s = rows.get(c.segment_id)
          return s && s.status !== "locked" && s.target !== c.text
            ? [
                {
                  segment_id: s.id,
                  before: s.target ?? "",
                  after: c.text,
                  version: s.version,
                },
              ]
            : []
        })
        const result = await propose(summary, items)
        return reply(
          locked
            ? `${result} ${locked} locked segment(s) were left out.`
            : result
        )
      },
    },
    {
      name: "propose_replace",
      label: "Replace",
      description:
        "Propose one wording change across the whole translation, as a batch for the owner to review. Exact text only: it doesn't inflect, so review what a language with endings needs.",
      parameters: Type.Object({
        summary: Type.String(),
        find: Type.String(),
        replace: Type.String(),
      }),
      execute: async (_id, params) => {
        const { summary, find, replace } = params as {
          summary: string
          find: string
          replace: string
        }
        return reply(
          await propose(summary, await replaceAcross(book, find, replace))
        )
      },
    },
  ]
}

export async function replaceAcross(
  book: BookRow,
  find: string,
  replace: string
): Promise<ChangeItem[]> {
  if (!find) return []
  const rows = await repo.segments(book.id)
  return rows
    .filter(
      (s) =>
        s.target?.includes(find) &&
        s.status !== "locked" &&
        s.status !== "pending"
    )
    .slice(0, MAX_CHANGES)
    .map((s) => ({
      segment_id: s.id,
      before: s.target!,
      after: s.target!.replaceAll(find, replace),
      version: s.version,
    }))
}

// With BOOKS_AI_FAKE on: enough behaviour to drive the whole flow in a browser.
async function fakeReply(
  book: BookRow,
  message: string,
  selected: string[],
  turn: Turn
) {
  const swap = /replace ["“](.+?)["”] with ["“](.+?)["”]/i.exec(message)
  if (swap) {
    const items = await replaceAcross(book, swap[1]!, swap[2]!)
    if (items.length) {
      const set = await proposeChanges(book, `Replace ${swap[1]}`, items)
      turn.changeSet = set.id
    }
    return `Fake assistant: ${items.length} line(s) proposed.`
  }
  if (selected.length) {
    const { data } = await supabaseAdmin()
      .from("book_segments")
      .select("*")
      .eq("book_id", book.id)
      .in("id", selected)
    const items = (data ?? [])
      .filter((s) => s.status !== "locked" && s.target)
      .map((s) => ({
        segment_id: s.id,
        before: s.target!,
        after: `${s.target} (retranslated)`,
        version: s.version,
      }))
    if (items.length) {
      const set = await proposeChanges(book, message.slice(0, 200), items)
      turn.changeSet = set.id
    }
    return `Fake assistant: ${items.length} line(s) proposed.`
  }
  return "Fake assistant: this reply didn't come from a model."
}

function chatModel(openrouter: { key: string; textModel: string } | null) {
  const models = createModels()
  if (openrouter) {
    models.setProvider(openrouterProvider())
    const model = models.getModel("openrouter", openrouter.textModel)
    return { models, model, key: openrouter.key }
  }
  models.setProvider(anthropicProvider())
  return { models, model: models.getModel("anthropic", BOOK_MODEL), key: null }
}

// One message to the assistant. Charged first and refunded if it fails, the way
// a story plan is, unless the person's OpenRouter account pays.
export async function chat(
  actor: Actor,
  id: string,
  input: { message: unknown; selected?: unknown }
) {
  const book = await getBook(actor, id)
  const message =
    typeof input.message === "string"
      ? input.message.trim().slice(0, MAX_MESSAGE)
      : ""
  if (!message) throw new BookError(400, "invalid")
  const selected = Array.isArray(input.selected)
    ? input.selected.filter((s) => typeof s === "string").slice(0, 40)
    : []
  const db = supabaseAdmin()
  const openrouter = await payingConnection(actor.userId)
  if (!modelAvailable(openrouter)) throw new BookError(501, "not_set_up")

  const job = crypto.randomUUID()
  if (!openrouter) {
    const spent = actor.keyId
      ? await db.rpc("spend_credits_for_key", {
          p_user: actor.userId,
          p_key: actor.keyId,
          p_cost: BOOK_RATES.chat,
          p_kind: "book_chat",
          p_job: job,
        })
      : await db.rpc("spend_credits_for", {
          p_user: actor.userId,
          p_cost: BOOK_RATES.chat,
          p_kind: "book_chat",
          p_job: job,
        })
    if (spent.error?.code === "P0402")
      throw new BookError(402, "insufficient_credits")
    if (spent.error?.code === "P0403")
      throw new BookError(403, "key_credit_limit")
    if (spent.error) throw new BookError(500, "charge_failed")
  }

  const { data: history } = await db
    .from("book_messages")
    .select("*")
    .eq("book_id", id)
    .order("created_at", { ascending: false })
    .limit(HISTORY)
  await db
    .from("book_messages")
    .insert({
      book_id: id,
      user_id: actor.userId,
      role: "user",
      content: message,
    })

  const turn: Turn = { changeSet: null }
  let text: string
  try {
    if (fakeEnabled()) text = await fakeReply(book, message, selected, turn)
    else {
      const { models, model, key } = chatModel(openrouter)
      if (!model) throw new Error("Model isn't available.")
      const agent = new Agent({
        initialState: {
          systemPrompt: assistantSystem({
            title: book.title,
            sourceLang: book.source_lang,
            targetLang: book.target_lang,
            style: { ...DEFAULT_STYLE, ...book.style },
            bible: book.bible,
            glossary: await repo.terms(book),
          }),
          model,
          tools: tools(book, actor, turn),
          messages: [],
        },
        streamFn: models.streamSimple.bind(models),
        ...(key && { getApiKey: () => key }),
      })
      const timer = setTimeout(() => agent.abort(), BUDGET_MS)
      const past = ([...(history ?? [])] as MessageRow[])
        .reverse()
        .map((m) => `${m.role === "user" ? "Owner" : "You"}: ${m.content}`)
        .join("\n")
      const picked = selected.length
        ? `\n\nThe owner has selected these segment ids: ${selected.join(", ")}.`
        : ""
      try {
        await agent.prompt(
          `${past ? `Earlier in this conversation:\n${past}\n\n` : ""}${message}${picked}`
        )
      } finally {
        clearTimeout(timer)
      }
      const last = agent.state.messages.at(-1) as {
        role?: string
        content?: { type: string; text?: string }[]
      }
      text =
        last?.role === "assistant"
          ? (last.content ?? [])
              .map((b) => (b.type === "text" ? (b.text ?? "") : ""))
              .join("")
          : ""
      if (!text) throw new Error("The assistant didn't answer.")
    }
  } catch (e) {
    if (!openrouter)
      await db.rpc("refund_credits_for", { p_user: actor.userId, p_job: job })
    console.error("Book assistant failed", id, e)
    throw new BookError(502, "assistant_failed")
  }
  const { data: saved } = await db
    .from("book_messages")
    .insert({
      book_id: id,
      user_id: actor.userId,
      role: "assistant",
      content: text.slice(0, 20_000),
      change_set_id: turn.changeSet,
    })
    .select("*")
    .single()
  return { message: saved, change_set_id: turn.changeSet }
}

export async function messages(actor: Actor, id: string) {
  await getBook(actor, id)
  const { data } = await supabaseAdmin()
    .from("book_messages")
    .select("*")
    .eq("book_id", id)
    .order("created_at", { ascending: false })
    .limit(100)
  return (data ?? []).reverse()
}

export const plainPreview = (s: string) => stripTags(s).slice(0, 200)
