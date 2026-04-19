import "server-only"
import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

/**
 * HO-side session helpers.
 *
 * Unlike managers (who sign in with a store PIN against our own JWT),
 * HO users authenticate via Supabase Auth email + password. Anyone who
 * has a valid Supabase session AND a row in `ho_users` is treated as HO.
 *
 * The middleware does the first-pass gate ("any auth session?") on
 * /ho/*. This helper does the full gate ("is this user in ho_users?")
 * and is meant to be called from every HO server component.
 */

export type HoSession = {
  user_id: string
  email: string | null
  display_name: string
  role: string
}

/**
 * Returns the current HO session or null. Does NOT redirect — callers
 * decide whether the absence of a session means 'bounce to login' or
 * 'render a neutral fallback' (e.g. a 404 page shared with non-HO).
 */
export async function getHoSession(): Promise<HoSession | null> {
  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  // We go through the service-role client for the ho_users lookup so the
  // page works before we layer on finer-grained RLS.
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin
    .from("ho_users")
    .select("user_id, display_name, role")
    .eq("user_id", user.id)
    .maybeSingle<{ user_id: string; display_name: string; role: string }>()

  if (error) {
    console.error("[ho-auth] ho_users lookup failed", error)
    return null
  }
  if (!data) return null

  return {
    user_id: data.user_id,
    email: user.email ?? null,
    display_name: data.display_name,
    role: data.role,
  }
}

/**
 * Require an HO session. If absent, redirects to /ho/login preserving
 * the intended path. Use from HO server components that need the user
 * profile to render.
 */
export async function requireHoSession(nextPath?: string): Promise<HoSession> {
  const session = await getHoSession()
  if (!session) {
    const q = nextPath ? `?next=${encodeURIComponent(nextPath)}` : ""
    redirect(`/ho/login${q}`)
  }
  return session
}
