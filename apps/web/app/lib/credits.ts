// Plans, packs and what each operation costs. Shared by server and UI;
// prices live in Stripe and are found by lookup key, never by ID.
export type PlanId = "creator" | "pro"

export const PLANS: Record<PlanId, { lookupKey: string; credits: number }> = {
  creator: { lookupKey: "palmframe_creator_monthly", credits: 2_000 },
  pro: { lookupKey: "palmframe_pro_monthly", credits: 10_000 },
}

export const PACKS = [
  { lookupKey: "palmframe_pack_2000", credits: 2_000 },
  { lookupKey: "palmframe_pack_10000", credits: 10_000 },
  { lookupKey: "palmframe_pack_30000", credits: 30_000 },
] as const

export const LOOKUP_KEYS = [
  ...Object.values(PLANS).map((p) => p.lookupKey),
  ...PACKS.map((p) => p.lookupKey),
]

// Credits a price grants: a month of a plan, or a pack.
export function creditsFor(lookupKey: string | null | undefined) {
  if (!lookupKey) return 0
  const plan = Object.values(PLANS).find((p) => p.lookupKey === lookupKey)
  return (
    plan?.credits ?? PACKS.find((p) => p.lookupKey === lookupKey)?.credits ?? 0
  )
}

export function planOf(lookupKey: string | null | undefined): PlanId | null {
  const entry = Object.entries(PLANS).find(([, p]) => p.lookupKey === lookupKey)
  return (entry?.[0] as PlanId | undefined) ?? null
}

// Charged before a render starts, refunded if it fails.
export const COSTS = {
  panel: 8, // Anima Turbo, text only
  panel_ref: 20, // FLUX.2 Klein, drawn from reference images
  portrait: 8,
  sheet: 40,
  coverage: 40, // FLUX.2 Klein, one image of nine camera setups
  edit: 20, // FLUX.2 Klein instruction edit of a panel
  vary: 8, // Anima Turbo img2img
  inpaint: 8, // Anima Turbo on a masked crop
  erase: 8,
  outpaint: 8,
  upscale: 3, // anime ESRGAN, 2x or 4x
  remove_bg: 2, // BiRefNet cut-out
  face_fix: 6, // up to four faces redrawn with Anima Turbo
  restyle: 8, // Anima Turbo img2img of a whole panel
  story_plan: 2, // the story planner's LLM call, per slide
  translate: 2, // a carousel's lettering, into one language
  panel_check: 2, // a vision model reading one finished panel
  continuity_check: 2, // an LLM comparing a carousel with its series' facts
} as const

export type Operation = keyof typeof COSTS

// What the app keeps of a subscription (Theo's cache shape).
export type SubscriptionCache =
  | {
      status: string
      subscriptionId: string
      plan: PlanId | null
      priceId: string | null
      currentPeriodEnd: number | null
      cancelAtPeriodEnd: boolean
      paymentMethod: { brand: string | null; last4: string | null } | null
    }
  | { status: "none" }

export const isActive = (s: SubscriptionCache | null | undefined) =>
  !!s && (s.status === "active" || s.status === "trialing")
