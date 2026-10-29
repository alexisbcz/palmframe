import {
  ZernioError,
  listInstagramAccounts,
  zernioEnabled,
} from "@/lib/zernio.server"

const error = (e: unknown) =>
  e instanceof ZernioError
    ? Response.json({ error: e.message, code: e.code }, { status: e.status })
    : Response.json({ error: String(e) }, { status: 500 })

export async function loader() {
  if (!zernioEnabled()) return new Response("Not found", { status: 404 })
  try {
    return Response.json({ accounts: await listInstagramAccounts() })
  } catch (e) {
    return error(e)
  }
}
