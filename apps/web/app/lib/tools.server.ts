import { redirect } from "react-router"

import { getViewer } from "@/lib/supabase.server"
import { TOOL_IDS, toolPath, type ToolId } from "@/lib/tools/catalog"

// The gate for one app. Models run in the browser, so this is what stands
// between a visitor and the page; without the switch the page isn't there.
export async function requireTool(request: Request, id: ToolId) {
  const { viewer, headers } = await getViewer(request)
  if (!viewer) throw redirect(`/login?next=${toolPath(id)}`, { headers })
  if (!viewer.labs[id]) throw redirect("/projects?settings=labs", { headers })
  return { viewer, headers }
}

export async function requireAnyTool(request: Request) {
  const { viewer, headers } = await getViewer(request)
  const next = new URL(request.url).pathname
  if (!viewer) throw redirect(`/login?next=${next}`, { headers })
  const enabled = TOOL_IDS.filter((id) => viewer.labs[id])
  if (!enabled.length) throw redirect("/projects?settings=labs", { headers })
  return { viewer, enabled, headers }
}
