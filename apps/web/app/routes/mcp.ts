import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { z } from "zod"

import {
  ApiError,
  allowed,
  apiError,
  authenticate,
  balance,
  cancelJob,
  capabilities,
  estimatePanel,
  getJob,
  getProject,
  limit,
  listProjects,
  startJob,
  type Access,
  type Caller,
} from "@/lib/api.server"

import type { Route } from "./+types/mcp"

// The developer API as MCP tools, over Streamable HTTP. Stateless: each
// request builds its own server for the key's owner, and answers in JSON.
// Paid tools come in pairs, estimate then start, so an agent shows the
// cost before it spends. A key only gets the tools its scopes open.

function server(caller: Caller) {
  const mcp = new McpServer({ name: "palmframe", version: "1.0.0" })

  const tool = <Shape extends z.ZodRawShape>(
    name: string,
    description: string,
    inputSchema: Shape,
    access: Access,
    work: (args: z.infer<z.ZodObject<Shape>>) => Promise<unknown>
  ) => {
    if (!allowed(caller, access)) return
    const write = access === "write"
    mcp.registerTool(
      name,
      {
        description,
        inputSchema,
        annotations: { readOnlyHint: !write, openWorldHint: false },
      },
      // The SDK's callback type is generic over its own shape helpers.
      (async (args: z.infer<z.ZodObject<Shape>>) => {
        try {
          if (write) limit(caller.keyId, "write")
          const result = await work(args)
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          }
        } catch (e) {
          const message =
            e instanceof ApiError
              ? `${e.code}: ${e.message}`
              : e instanceof Error
                ? e.message
                : String(e)
          return { content: [{ type: "text", text: message }], isError: true }
        }
      }) as never
    )
  }

  tool(
    "get_capabilities",
    "Credit prices of each operation, and the rate and concurrency limits.",
    {},
    "any",
    async () => capabilities()
  )
  tool(
    "get_credit_balance",
    "The account's credit balance, shared with the Palmframe app, and this key's credit limit and spending.",
    {},
    "read",
    () => balance(caller)
  )
  tool(
    "list_projects",
    "The account's comic projects, most recently edited first.",
    {},
    "read",
    () => listProjects(caller)
  )
  tool(
    "get_project",
    "A project's pages, panels (prompt, tags, cast, image) and cast. page_version is the revision estimates are bound to.",
    { project_id: z.string().describe("Project ID from list_projects.") },
    "read",
    ({ project_id }) => getProject(caller, project_id)
  )
  tool(
    "estimate_panel_generation",
    "Free. Prices rendering one panel from its prompt, tags and cast; valid 10 minutes for the project's current page_version. Show the cost to the user before start_panel_generation.",
    {
      project_id: z.string(),
      panel_id: z.string(),
      prompt: z
        .string()
        .max(2000)
        .optional()
        .describe("Replaces the panel's prompt text for this render."),
      seed: z.number().int().min(0).optional(),
    },
    "write",
    (args) => estimatePanel(caller, args)
  )
  tool(
    "start_panel_generation",
    "Spends credits: starts an estimate. Returns an operation to poll with get_operation; the image lands in the panel when it succeeds.",
    {
      estimate_id: z.string(),
      page_version: z.number().int(),
      max_credits: z
        .number()
        .int()
        .describe("The most the user agreed to spend."),
      idempotency_key: z
        .string()
        .min(1)
        .max(255)
        .describe("Unique per intended render; retries reuse it."),
    },
    "write",
    (args) => startJob(caller, args)
  )
  tool(
    "get_operation",
    "Status of a started generation: queued, running, succeeded (with image_url), failed or cancelled (refunded).",
    { operation_id: z.string() },
    "any",
    ({ operation_id }) => getJob(caller, operation_id)
  )
  tool(
    "cancel_operation",
    "Cancels a queued or running generation and refunds its credits.",
    { operation_id: z.string() },
    "write",
    ({ operation_id }) => cancelJob(caller, operation_id)
  )
  return mcp
}

async function handle(request: Request) {
  let caller: Caller
  try {
    caller = await authenticate(request, "any")
  } catch (e) {
    const res = apiError(e)
    if (res.status === 401)
      res.headers.set("www-authenticate", 'Bearer realm="palmframe"')
    return res
  }
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await server(caller).connect(transport)
  return transport.handleRequest(request)
}

export const loader = ({ request }: Route.LoaderArgs) => handle(request)
export const action = ({ request }: Route.ActionArgs) => handle(request)
