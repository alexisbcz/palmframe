import { LegalPage } from "@/components/auth/legal-page"
import { pageTitle } from "@/components/auth/auth-ui"

import type { Route } from "./+types/privacy"

export const meta: Route.MetaFunction = ({ matches }) =>
  pageTitle(matches, "legal.privacyTitle")

export default function Privacy() {
  return <LegalPage kind="privacy" />
}
