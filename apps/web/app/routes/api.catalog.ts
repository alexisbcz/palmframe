import { readFilters } from "@/components/catalog/model"
import { createDefaultProject } from "@/components/comic-canvas/model"
import {
  CatalogError,
  createAsset,
  getAssets,
  reportAsset,
  searchCatalog,
  setPublic,
} from "@/lib/catalog.server"
import { getViewer } from "@/lib/supabase.server"

import type { Route } from "./+types/api.catalog"

const error = (message: string, status: number) =>
  Response.json({ error: message }, { status })

const MAX_IDS = 20

// Reading is public. `?ids=` fetches specific assets, `?recent=1` the
// person's latest carousels, and anything else searches.
export async function loader({ request }: Route.LoaderArgs) {
  const { supabase, viewer } = await getViewer(request)
  const params = new URL(request.url).searchParams
  if (params.has("recent")) {
    if (!viewer) return Response.json({ projects: [] })
    const { data } = await supabase
      .from("comic_projects")
      .select("id, title, cover")
      .order("updated_at", { ascending: false })
      .limit(6)
    return Response.json({ projects: data ?? [] })
  }
  const ids = params.get("ids")
  if (ids !== null)
    return Response.json({
      assets: await getAssets(
        supabase,
        viewer?.id,
        ids.split(",").filter(Boolean).slice(0, MAX_IDS)
      ),
    })
  return Response.json(
    await searchCatalog(supabase, viewer?.id, readFilters(params))
  )
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") return error("Method not allowed", 405)
  const { supabase, viewer } = await getViewer(request)
  if (!viewer) return error("Sign in first.", 401)
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null
  const id = typeof body?.id === "string" ? body.id : ""
  try {
    switch (body?.intent) {
      case "create":
        return Response.json({ id: await createAsset(viewer, body.draft) })
      case "publish":
        await setPublic(viewer, id, body.isPublic === true)
        return Response.json({ ok: true })
      case "delete": {
        // Row-level security limits this to their own assets.
        const { error: failed } = await supabase
          .from("comic_assets")
          .delete()
          .eq("id", id)
        if (failed) throw new CatalogError(failed.message, 500)
        return Response.json({ ok: true })
      }
      case "save": {
        const saves = supabase.from("comic_asset_saves")
        const { error: failed } = body.saved
          ? await saves.upsert(
              { asset_id: id },
              { onConflict: "user_id,asset_id", ignoreDuplicates: true }
            )
          : await saves.delete().eq("asset_id", id)
        if (failed) throw new CatalogError(failed.message, 500)
        return Response.json({ ok: true })
      }
      case "use": {
        // Counted once per person. Nothing depends on it, so failures are fine.
        const ids = Array.isArray(body.ids) ? body.ids.slice(0, MAX_IDS) : []
        await supabase.from("comic_asset_uses").upsert(
          ids
            .filter((i): i is string => typeof i === "string")
            .map((asset_id) => ({ asset_id })),
          { onConflict: "user_id,asset_id", ignoreDuplicates: true }
        )
        return Response.json({ ok: true })
      }
      case "report":
        await reportAsset(viewer, id, String(body.reason))
        return Response.json({ ok: true })
      case "carousel": {
        const { data, error: failed } = await supabase
          .from("comic_projects")
          .insert({ title: "", data: createDefaultProject() })
          .select("id")
          .single()
        if (failed) throw new CatalogError(failed.message, 500)
        return Response.json({ id: data.id })
      }
      default:
        return error("Unknown intent", 400)
    }
  } catch (e) {
    if (e instanceof CatalogError) return error(e.message, e.status)
    throw e
  }
}
