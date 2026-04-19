import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createServerClient, type CookieOptions } from "@supabase/ssr"

/**
 * Next.js middleware — two responsibilities:
 *
 *   1. Rotate Supabase SSR auth cookies on every request. @supabase/ssr
 *      issues a new session cookie whenever it refreshes the access token;
 *      without this middleware the new cookie never reaches the browser
 *      and the user gets logged out ~5 minutes after signing in.
 *
 *   2. Guard the /ho surface: anything under /ho (except /ho/login and the
 *      auth callback routes) requires a signed-in Supabase Auth user who
 *      ALSO has a row in public.ho_users. An auth user without that row is
 *      signed out here and redirected to /ho/login?error=not_authorized so
 *      the login page can show a friendly message. The server components
 *      (requireHoSession) remain the ultimate source of truth — this is a
 *      defence-in-depth gate so unauthorized users never even render.
 *
 * Manager-side (/m/...) is intentionally NOT guarded here: it has its own
 * JWT cookie (`sr_mgr`) that each manager page reads directly.
 */

export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: { headers: req.headers } })

  // Build a cookie-aware Supabase server client that writes back through
  // the outgoing response so rotated tokens reach the browser.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          req.cookies.set({ name, value, ...options })
          res.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          req.cookies.set({ name, value: "", ...options })
          res.cookies.set({ name, value: "", ...options })
        },
      },
    },
  )

  // Critical: calling getUser() also triggers the cookie rotation if the
  // current access token is close to expiry.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = req.nextUrl
  const isHoRoute = pathname.startsWith("/ho")
  const isHoLogin = pathname === "/ho/login" || pathname.startsWith("/ho/login/")

  if (isHoRoute && !isHoLogin && !user) {
    const url = req.nextUrl.clone()
    url.pathname = "/ho/login"
    // Preserve the originally-requested path so we can bounce back after login.
    url.searchParams.set("next", pathname)
    return NextResponse.redirect(url)
  }

  // Authed but trying to reach a protected /ho/* page — verify they're in
  // ho_users. We use an admin (service-role) client for the lookup so we
  // don't depend on RLS policies being in place yet.
  if (isHoRoute && !isHoLogin && user) {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
    const { data: hoRow, error: hoErr } = await admin
      .from("ho_users")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle()

    if (hoErr) {
      // Fail closed on infra errors — better to bounce to login than serve
      // a half-broken HO page.
      console.error("[middleware] ho_users lookup failed", hoErr)
    }

    if (!hoRow) {
      // Valid Supabase user but NOT an HO user. Sign them out so the stale
      // cookie doesn't keep shadowing the login page, then bounce them to
      // /ho/login with an explanatory flag.
      await supabase.auth.signOut()
      const url = req.nextUrl.clone()
      url.pathname = "/ho/login"
      url.search = ""
      url.searchParams.set("error", "not_authorized")
      return NextResponse.redirect(url)
    }
  }

  // If the user is already signed in and hits /ho/login, send them to /ho.
  if (isHoLogin && user) {
    const url = req.nextUrl.clone()
    url.pathname = "/ho"
    url.search = ""
    return NextResponse.redirect(url)
  }

  return res
}

// Only run middleware on these paths — static assets and the reporter /
// manager surfaces don't need it.
export const config = {
  matcher: [
    "/ho/:path*",
    // The auth-callback route is owned by /ho/login so it's covered by the
    // first matcher. If we add /api callbacks later, extend the matcher.
  ],
}
