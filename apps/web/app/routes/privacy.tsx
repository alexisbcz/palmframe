import { LegalPage } from "@/components/auth/legal-page"
import { pageTitle } from "@/components/auth/auth-ui"
import { seo } from "@/lib/seo"

import type { Route } from "./+types/privacy"

export const meta: Route.MetaFunction = ({ matches }) => [
  ...seo({
    title: pageTitle(matches, "legal.privacyTitle")[0]!.title,
    description: "How Palmframe handles your data.",
    path: "/privacy",
  }),
]

export default function Privacy() {
  return <LegalPage kind="privacy" />
}
