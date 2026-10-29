import Stripe from "stripe"

import { LOOKUP_KEYS } from "./credits"

export const billingEnabled = () => !!process.env.STRIPE_SECRET_KEY?.trim()

let client: Stripe | null = null

// One client, pinned to the API version the code was written against.
export function stripe() {
  const key = process.env.STRIPE_SECRET_KEY?.trim()
  if (!key) throw new Error("STRIPE_SECRET_KEY must be set.")
  client ??= new Stripe(key, {
    apiVersion: "2026-09-30.endive",
    appInfo: { name: "Palmframe", url: "https://www.palmframe.com" },
  })
  return client
}

export interface CatalogPrice {
  id: string
  lookupKey: string
  amount: number
  currency: string
  interval: string | null
  productName: string
}

let catalog: { at: number; prices: Map<string, CatalogPrice> } | null = null

// Prices by lookup key, cached for five minutes per server instance.
export async function prices() {
  if (catalog && Date.now() - catalog.at < 300_000) return catalog.prices
  const list = await stripe().prices.list({
    lookup_keys: LOOKUP_KEYS,
    active: true,
    expand: ["data.product"],
    limit: 20,
  })
  const map = new Map<string, CatalogPrice>()
  for (const p of list.data) {
    if (!p.lookup_key || p.unit_amount === null) continue
    map.set(p.lookup_key, {
      id: p.id,
      lookupKey: p.lookup_key,
      amount: p.unit_amount,
      currency: p.currency,
      interval: p.recurring?.interval ?? null,
      productName:
        typeof p.product === "object" && "name" in p.product
          ? p.product.name
          : "",
    })
  }
  catalog = { at: Date.now(), prices: map }
  return map
}

let portalConfiguration: string | null | undefined

// The Customer Portal setup made for Palmframe (metadata app=palmframe).
export async function portalConfigurationId() {
  if (portalConfiguration !== undefined) return portalConfiguration
  const list = await stripe().billingPortal.configurations.list({
    active: true,
    limit: 100,
  })
  portalConfiguration =
    list.data.find((c) => c.metadata?.app === "palmframe")?.id ?? null
  return portalConfiguration
}
