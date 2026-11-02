import type { Site } from "../model"

export type TemplateCategory =
  | "Business"
  | "Store"
  | "Food"
  | "Beauty & wellness"
  | "Creative"
  | "Blog"
  | "Events"
  | "Community"

export interface Template {
  id: string
  name: string
  category: TemplateCategory
  blurb: string
  // Which apps it ships with, for the filter chips.
  apps: ("store" | "bookings" | "events" | "blog")[]
  make: () => Site
}
