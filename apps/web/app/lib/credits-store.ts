import * as React from "react"

// The signed-in person's credit balance on the client. The root loader seeds
// it; every render's `x-credits` response header keeps it current.
let balance: number | null = null
const listeners = new Set<() => void>()

export function setCredits(next: number | null) {
  if (next === balance) return
  balance = next
  for (const l of listeners) l()
}

// For code outside React, such as a run deciding whether to go on.
export const getCredits = () => balance

export function useCredits() {
  return React.useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => balance,
    () => null
  )
}

// Thrown by the generator when a render needs more credits than are left.
export const INSUFFICIENT_CREDITS = "insufficient_credits"
