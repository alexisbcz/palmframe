// What an API key can be allowed to do. Shared by server and UI.
export const API_SCOPES = ["read", "generate"] as const
export type ApiScope = (typeof API_SCOPES)[number]

export const isApiScope = (s: unknown): s is ApiScope =>
  API_SCOPES.includes(s as ApiScope)

export const MAX_KEY_CREDIT_LIMIT = 100_000_000
export const MAX_KEY_PROJECTS = 200
