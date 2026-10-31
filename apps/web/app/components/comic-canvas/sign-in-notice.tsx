import { Link, useLocation } from "react-router"

import { linkClass } from "@/components/auth/auth-ui"
import { useT } from "@/i18n/core"

import { messages } from "./sign-in-notice.messages"

// The API routes all answer a signed-out render with "Sign in to …".
export const needsSignIn = (error: string | null | undefined) =>
  !!error?.startsWith("Sign in to ")

// Comes back to this page after signing in.
export function SignInNotice() {
  const t = useT(messages)
  const { pathname, search } = useLocation()
  return (
    <>
      {t("text")}{" "}
      <Link
        to={`/login?next=${encodeURIComponent(pathname + search)}`}
        className={linkClass}
      >
        {t("link")}
      </Link>
    </>
  )
}
