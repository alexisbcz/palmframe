import { LegalPage } from "@/components/auth/legal-page"
import { pageTitle } from "@/components/auth/auth-ui"
import { seo } from "@/lib/seo"

import type { Route } from "./+types/terms"

export const meta: Route.MetaFunction = ({ matches }) => [
  ...seo({
    title: pageTitle(matches, "legal.termsTitle")[0]!.title,
    description: "The terms for using Palmframe.",
    path: "/terms",
  }),
]

export default function Terms() {
  return <LegalPage kind="terms" />
}
