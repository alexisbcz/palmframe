import { LegalPage } from "@/components/auth/legal-page"
import { pageTitle } from "@/components/auth/auth-ui"

import type { Route } from "./+types/terms"

export const meta: Route.MetaFunction = ({ matches }) =>
  pageTitle(matches, "legal.termsTitle")

export default function Terms() {
  return <LegalPage kind="terms" />
}
