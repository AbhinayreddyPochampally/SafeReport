import Link from "next/link"
import { Suspense } from "react"
import { Shield } from "lucide-react"
import { getHoSession } from "@/lib/ho-auth"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { HoSignOutButton } from "./sign-out-button"
import { SidebarNav, type SidebarCounts } from "./sidebar-nav"

/**
 * Layout for every /ho/* route.
 *
 * Renders a left sidebar (240px) with brand, pilot context block, primary
 * nav, and the user/sign-out block at the bottom. Main content fills the
 * rest of the viewport.
 *
 * Per-tab counts (Overview = awaiting HO, Reports = open total, Stores =
 * total active) are fetched server-side once per page load so the sidebar
 * shows live numbers without any client polling.
 *
 * Middleware blocks unauthenticated access to non-login /ho routes, and
 * each page calls `requireHoSession()` itself. The "no session" branch
 * here only matters for /ho/login, which intentionally renders bare.
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/40 flex">
      {/* ----------------------------- Sidebar ----------------------------- */}
      <aside className="w-[240px] shrink-0 bg-gradient-to-b from-white to-slate-50/80 border-r border-slate-200 flex flex-col sticky top-0 h-screen">
        {/* Brand */}
        <Link
          href="/ho"
          className="flex items-center gap-2.5 px-5 pt-5 pb-4 text-slate-900 hover:opacity-90"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-indigo-700 text-white">
            <Shield className="h-4 w-4" strokeWidth={2} />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="font-display text-[15px] font-semibold tracking-tight">
              SafeReport
            </span>
            <span className="text-[10.5px] text-slate-500">
              Head Office Console
            </span>
          </span>
        </Link>

        {/* Counts-dependent block streams in via Suspense so a Supabase
            hiccup never blocks the rest of the layout from rendering. */}
        <Suspense fallback={<SidebarCountsFallback />}>
          <SidebarCountsBlock />
        </Suspense>

        {/* Spacer pushes the user block to the bottom */}
        <div className="flex-1" />

        {/* User block */}
        <div className="border-t border-slate-200 px-3 py-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-[12px] font-semibold text-slate-700">
              {initials(session.display_name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-slate-900 truncate">
                {session.display_name}
              </p>
              <p className="text-[11px] text-slate-500 truncate">
                {session.email ?? formatRole(session.role)}
              </p>
            </div>
            <HoSignOutButton />
          </div>
        </div>
      </aside>

      {/* ------------------------------ Main ------------------------------ */}
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  )
}

/* --------------------------- Sidebar counts ------------------------------ */

// Async server component the layout suspends on. Wrapped in <Suspense>
// so a slow / failing count query doesn't block the rest of the sidebar
// (or the main content area) from rendering.
async function SidebarCountsBlock() {
  const counts = await fetchSidebarCounts()
  return (
    <>
      <div className="mx-3 mb-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5">
        <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Pilot · ABFRL
        </p>
        <p className="mt-0.5 font-display text-[14px] font-semibold text-slate-900">
          {counts.stores ?? 0} retail stores
        </p>
        <p className="text-[10.5px] text-slate-500">In production</p>
      </div>
      <SidebarNav counts={counts} />
    </>
  )
}

// Skeleton shown until counts settle. Same layout shape as the real
// block so the sidebar doesn't shift when counts arrive.
function SidebarCountsFallback() {
  return (
    <>
      <div className="mx-3 mb-2 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5 animate-pulse">
        <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Pilot · ABFRL
        </p>
        <p className="mt-0.5 font-display text-[14px] font-semibold text-slate-300">
          ─ retail stores
        </p>
        <p className="text-[10.5px] text-slate-400">Loading…</p>
      </div>
      <SidebarNav counts={{}} />
    </>
  )
}

async function fetchSidebarCounts(): Promise<SidebarCounts> {
  try {
    const admin = createSupabaseAdminClient()
    // Action queue = awaiting_ho (regardless of age) + stale-new (status=new,
    // no ack, > 24h old). The breached subcount is the awaiting_ho rows older
    // than 48h, which the sidebar uses to tint the badge orange.
    const SLA_BREACH_CUTOFF = new Date(Date.now() - 48 * 36e5).toISOString()
    const STALE_NEW_CUTOFF = new Date(Date.now() - 24 * 36e5).toISOString()
    const [awaitingHo, awaitingHoBreached, staleNew, openTotal, activeStores] =
      await Promise.all([
        admin
          .from("reports")
          .select("id", { count: "exact", head: true })
          .eq("status", "awaiting_ho"),
        admin
          .from("reports")
          .select("id", { count: "exact", head: true })
          .eq("status", "awaiting_ho")
          .lte("reported_at", SLA_BREACH_CUTOFF),
        admin
          .from("reports")
          .select("id", { count: "exact", head: true })
          .eq("status", "new")
          .is("acknowledged_at", null)
          .lte("reported_at", STALE_NEW_CUTOFF),
        admin
          .from("reports")
          .select("id", { count: "exact", head: true })
          .in("status", ["new", "in_progress", "awaiting_ho", "returned"]),
        admin
          .from("stores")
          .select("sap_code", { count: "exact", head: true })
          .eq("status", "active"),
      ])
    const awaiting = awaitingHo.count ?? 0
    const stale = staleNew.count ?? 0
    return {
      overview: awaiting,
      action: awaiting + stale,
      action_breached: awaitingHoBreached.count ?? 0,
      reports: openTotal.count ?? 0,
      stores: activeStores.count ?? 0,
    }
  } catch (err) {
    // Sidebar counts are decorative — never block layout render on a DB hiccup.
    console.error("[ho/layout] sidebar counts failed", err)
    return {}
  }
}

/* ------------------------------- Helpers --------------------------------- */

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "·"
}

function formatRole(role: string): string {
  return role
    .split("_")
    .map((s, i) => (i === 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s))
    .join(" ")
}
