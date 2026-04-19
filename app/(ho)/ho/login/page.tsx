import { redirect } from "next/navigation"
import { getHoSession } from "@/lib/ho-auth"
import { HoLoginForm } from "./login-form"

/**
 * HO login — /ho/login.
 *
 * If the user already has a valid HO session we bounce them to /ho so
 * they don't see the login screen by accident. Middleware already does
 * the first-pass redirect but this belt-and-braces check protects
 * direct-URL arrivals where middleware might be bypassed in dev.
 */

export default async function HoLoginPage({
  searchParams,
}: {
  searchParams?: { next?: string; error?: string }
}) {
  const existing = await getHoSession()
  if (existing) {
    redirect(safeNext(searchParams?.next))
  }
  const initialError =
    searchParams?.error === "not_authorized"
      ? "This account isn't authorised for Head Office access. Ask the admin to add you to ho_users."
      : null
  return (
    <HoLoginForm
      nextPath={safeNext(searchParams?.next)}
      initialError={initialError}
    />
  )
}

function safeNext(next: string | undefined): string {
  // Only allow same-origin relative paths starting with /ho. Anything
  // else silently falls back to /ho to avoid open-redirect weirdness.
  if (!next) return "/ho"
  if (!next.startsWith("/ho")) return "/ho"
  return next
}
