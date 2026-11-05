// Sending a newsletter issue. Resend is the provider; until RESEND_API_KEY and
// NEWSROOM_MAIL_FROM are set, an issue is written and held, and nothing leaves.
import { supabaseAdmin } from "@/lib/supabase-admin.server"

import { renderIssue } from "./mail"
import { publicationPath } from "./publication"

const RESEND = "https://api.resend.com"
const BATCH = 100

export const mailConfigured = () =>
  !!process.env.RESEND_API_KEY?.trim() &&
  !!process.env.NEWSROOM_MAIL_FROM?.trim()

export async function sendIssue(issueId: string, origin: string) {
  const admin = supabaseAdmin()
  const { data: issue } = await admin
    .from("comic_newsroom_issues")
    .select("*")
    .eq("id", issueId)
    .single()
  if (!issue) throw new Error("No such issue.")
  const [{ data: pub }, { data: story }, { data: subs }] = await Promise.all([
    admin
      .from("comic_newsrooms")
      .select("*")
      .eq("id", issue.newsroom_id)
      .single(),
    admin
      .from("comic_deep_dives")
      .select("title, dek, body, cover, slug")
      .eq("id", issue.story_id)
      .single(),
    admin
      .from("comic_newsroom_subscribers")
      .select("email, token")
      .eq("newsroom_id", issue.newsroom_id)
      .eq("status", "subscribed"),
  ])
  if (!pub || !story?.slug) throw new Error("The story isn't published.")
  const recipients = subs ?? []

  if (!mailConfigured()) {
    await admin
      .from("comic_newsroom_issues")
      .update({
        status: "held",
        recipients: recipients.length,
        error: "Email sending isn't connected yet.",
      })
      .eq("id", issueId)
    return "held" as const
  }

  await admin
    .from("comic_newsroom_issues")
    .update({
      status: "sending",
      provider: "resend",
      recipients: recipients.length,
    })
    .eq("id", issueId)
  const storyUrl = `${origin}${publicationPath(pub.slug, story.slug)}`
  try {
    for (let i = 0; i < recipients.length; i += BATCH) {
      const batch = recipients.slice(i, i + BATCH).map((r) => {
        const unsubscribeUrl = `${origin}${publicationPath(pub.slug)}/unsubscribe?t=${r.token}`
        const mail = renderIssue({
          publication: pub,
          story: { ...story, cover: story.cover?.url ?? null },
          storyUrl,
          unsubscribeUrl,
        })
        return {
          from: `${pub.name} <${process.env.NEWSROOM_MAIL_FROM!.trim()}>`,
          to: [r.email],
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          headers: {
            "List-Unsubscribe": `<${origin}/api/newsroom/public/${pub.slug}?unsubscribe=${r.token}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        }
      })
      const res = await fetch(`${RESEND}/emails/batch`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`,
          "content-type": "application/json",
          // A retried batch must not mail anyone twice.
          "idempotency-key": `${issueId}:${i}`,
        },
        body: JSON.stringify(batch),
      })
      if (!res.ok) throw new Error(`Resend ${res.status}`)
    }
    await admin
      .from("comic_newsroom_issues")
      .update({ status: "sent", sent_at: new Date().toISOString(), error: "" })
      .eq("id", issueId)
    return "sent" as const
  } catch (e) {
    await admin
      .from("comic_newsroom_issues")
      .update({
        status: "failed",
        error: e instanceof Error ? e.message.slice(0, 300) : "Failed",
      })
      .eq("id", issueId)
    return "failed" as const
  }
}
