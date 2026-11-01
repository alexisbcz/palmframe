import { z } from "zod"

import { TRIMS, type Trim } from "@/lib/desk/export/common"
import { toPdf } from "@/lib/desk/export/pdf.server"
import { toManuscript } from "@/lib/desk/model"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/api.desk.pdf"

export const config = { maxDuration: 60 }

const Body = z.object({
  manuscript: z.record(z.string(), z.unknown()),
  style: z.enum(["book", "manuscript"]),
  trim: z.string().refine((t) => t in TRIMS),
})

// pdfkit and its fonts are far too heavy for the browser. The manuscript comes
// with the request, so what prints is what's on the desk, saved or not.
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST")
    return Response.json({ error: "Method not allowed" }, { status: 405 })
  const { viewer } = await getViewer(request)
  if (!viewer) return Response.json({ error: "Sign in" }, { status: 401 })
  if (!viewer.labs.desk)
    return Response.json({ error: "Not found" }, { status: 404 })
  const body = Body.safeParse(await request.json().catch(() => null))
  if (!body.success)
    return Response.json({ error: "Bad request" }, { status: 400 })
  try {
    const bytes = await toPdf(
      toManuscript(body.data.manuscript),
      body.data.style,
      body.data.trim as Trim
    )
    return new Response(bytes as BodyInit, {
      headers: { "content-type": "application/pdf" },
    })
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "PDF failed" },
      { status: 502 }
    )
  }
}
