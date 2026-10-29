// Only same-site paths, so `?next=` cannot send someone elsewhere.
export function safeNext(
  next: string | null | undefined,
  fallback = "/projects"
) {
  return next && next.startsWith("/") && !next.startsWith("//")
    ? next
    : fallback
}
