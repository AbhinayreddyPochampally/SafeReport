import { NextResponse, type NextRequest } from "next/server"
import { createServerClient, type CookieOptions } from "@supabase/ssr"

/**
 * HO auth route — currently just sign-out.
 *
 * Sign-in happens in the browser via `createSupabaseBrowserClient()` so the
 * @supabase/ssr cookies get written directly by the SDK. That keeps the happy
 * path simple and avoids re-implementing Supabase's cookie logic on the
 * server. If we later move to server-side signin (e.g. for magic links), this
 * file gains a POST handler.
 *
 * Sign-out, however, has to be server-side so we can clear the cookie on the
 * outgoing response. We build a cookie-aware server client and call
 * signOut(); the SDK writes the removal cookies through the response adapter
 * below.
 */
export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          res.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          res.cookies.set({ name, value: "", ...options })
        },
      },
    },
  )

  // Best-effort: even if the call fails (no session / network blip), we still
  // return ok so the client redirects to /ho/login. The cookies have been
  // cleared by the SDK in either case.
  const { error } = await supabase.auth.signOut()
  if (error) {
    console.error("[ho-auth] signOut failed", error)
  }

  return res
}
