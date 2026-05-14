import Link from "next/link"
import { Suspense } from "react"
import { unstable_cache } from "next/cache"
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
    // Two-tone diagonal wash. The previous version used 50-scale tones
    // at low opacity and the result looked uniformly white — fixed by
    // using 100-scale stops at full opacity so the corners actually
    // carry visible colour. The diagonal direction means the indigo
    // tint pools in the bottom-right and the slate sits top-left, giving
    // long pages a sense of depth as you scroll.
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-white to-indigo-100 flex">
      {/* ----------------------------- Sidebar -----------------------------
        * Indigo wash on the sidebar plus a 2px indigo accent strip on the
        * right edge. The strip gives the sidebar a clear visual identity
        * against the main pane without bumping the layout width. */}
      <aside className="w-[240px] shrink-0 bg-gradient-to-b from-indigo-50 via-white to-slate-100 border-r-2 border-indigo-200/70 flex flex-col sticky top-0 h-screen">
        {/* Brand band — full indigo→sky→teal gradient so the top of the
          * sidebar carries clear, branded colour instead of reading as
          * "another white surface". Pilot is ABFRL so the gradient walks
          * from corporate indigo through to operational teal, both
          * palette-compliant. */}
        <Link
          href="/ho"
          className="flex items-center gap-2.5 px-5 pt-5 pb-4 text-white bg-gradient-to-br from-indigo-700 via-indigo-600 to-teal-700 hover:opacity-95 transition-opacity"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white/15 ring-1 ring-white/30 text-white backdrop-blur-sm">
            <Shield className="h-4 w-4" strokeWidth={2} />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="font-display text-[15px] font-semibold tracking-tight text-white">
              SafeReport
            </span>
            <span className="text-[10.5px] text-indigo-100/90">
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

        {/* User block — teal-tinted bottom band so the sidebar's colour
          * vocabulary closes out warmly instead of fading to slate-100. */}
        <div className="border-t border-teal-200/70 bg-gradient-to-r from-teal-50/80 to-transparent px-3 py-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-teal-200 to-teal-300 text-[12px] font-semibold text-teal-900 ring-2 ring-white">
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
      {/* Pilot info card — sky→indigo wash with a thin sky accent stripe.
        * Was a near-white slate-50 card; now carries actual brand colour
        * so the sidebar reads as colourful rather than a wall of white. */}
      <div className="mx-3 mt-3 mb-2 rounded-lg border border-sky-200 bg-gradient-to-br from-sky-100 via-white to-indigo-100 px-3 py-2.5 shadow-sm">
        <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-sky-700">
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
      <div className="mx-3 mt-3 mb-2 rounded-lg border border-sky-200 bg-gradient-to-br from-sky-100 via-white to-indigo-100 px-3 py-2.5 animate-pulse shadow-sm">
        <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-sky-700">
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

/**
 * Cache key for the sidebar-count fetch. The counts are pilot-wide
 * (not per-user) and decorative — refreshing every 30 seconds is plenty.
 *
 * Why this matters perf-wise: previously every navigation between Overview /
 * Reports / Analytics / Stores fired five COUNT(*) queries against Supabase
 * in parallel. Each query is small, but Railway → Supabase (a different
 * region) round-trips end up dominating perceived nav latency. With a 30s
 * server-side cache, back-to-back navs inside the same minute hit memory
 * instead of the DB, and the user feels the page "snap" rather than reload.
 *
 * Bypass: nothing — the data is non-sensitive and a 30s stale window is
 * within tolerance. If a count ever needs to update instantly (e.g. after
 * an HO approval), the page that triggered the change can call
 * revalidateTag("ho-sidebar-counts") to bust the cache.
 */
const getCachedSidebarCounts = unstable_cache(
  fetchSidebarCountsImpl,
  ["ho-sidebar-counts"],
  { revalidate: 30, tags: ["ho-sidebar-counts"] },
)

async function fetchSidebarCounts(): Promise<SidebarCounts> {
  return getCachedSidebarCounts()
}

async function fetchSidebarCountsImpl(): Promise<SidebarCounts> {
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
