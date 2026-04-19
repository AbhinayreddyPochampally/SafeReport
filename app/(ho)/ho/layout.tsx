import Link from "next/link"
import { Shield } from "lucide-react"
import { getHoSession } from "@/lib/ho-auth"
import { HoSignOutButton } from "./sign-out-button"

/**
 * Layout for every /ho/* route.
 *
 * We only render the HO chrome (nav + sign-out) when there IS a session. On
 * /ho/login there's no session so we render `children` bare — that's what
 * gives the login page its full-bleed look.
 *
 * Middleware already blocks unauthenticated access to non-login /ho routes,
 * and each page calls `requireHoSession()` itself. So the "no session" case
 * here really only covers /ho/login.
 */
export default async function HoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getHoSession()
  if (!session) {
    return <>{children}</>
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link
              href="/ho"
              className="flex items-center gap-2 text-slate-900 font-semibold tracking-tight"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-indigo-700 text-white">
                <Shield className="h-4 w-4" />
              </span>
              SafeReport
            </Link>
            <nav className="hidden md:flex items-center gap-1 text-sm">
              <NavLink href="/ho">Overview</NavLink>
              <NavLink href="/ho/analytics">Analytics</NavLink>
              <NavLink href="/ho/stores">Stores</NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col items-end leading-tight">
              <span className="text-sm text-slate-900 font-medium">
                {session.display_name}
              </span>
              <span className="text-xs text-slate-500">
                {session.email ?? formatRole(session.role)}
              </span>
            </div>
            <HoSignOutButton />
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-md text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-colors"
    >
      {children}
    </Link>
  )
}

function formatRole(role: string): string {
  // Convert "safety_officer" -> "Safety officer" etc., without bringing in a
  // helper lib for a single use.
  return role
    .split("_")
    .map((s, i) => (i === 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s))
    .join(" ")
}
