import type { Metadata } from "next"
import Link from "next/link"
import Image from "next/image"
import { Suspense } from "react"
import { unstable_cache } from "next/cache"
import { getHoSession } from "@/lib/ho-auth"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { HoSignOutButton } from "./sign-out-button"
import { SidebarNav, type SidebarCounts } from "./sidebar-nav"

// HO-scoped PWA metadata.
//
// Without this, every /ho/* page inherits the root manifest from
// app/manifest.ts whose start_url is "/". Root then redirects to
// /r/PNT-MUM-047 (the demo store reporter landing). Net effect: an HO
// user who hit "Install" on /ho/stores got an installed launcher icon
// that opened the demo store's reporter flow on tap, not the HO console.
//
// Pointing every /ho/* page at /ho/manifest.webmanifest fixes that —
// the HO manifest binds start_url + id to /ho, so the launcher tile
// reopens the HO console where the user installed it.
//
// `icons.apple` is split out because iOS Safari ignores the manifest's
// icon list for the home-screen tile and reads <link rel="apple-touch-
// icon"> instead.
export const metadata: Metadata = {
  manifest: "/ho/manifest.webmanifest",
  icons: {
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SafeReport HO",
  },
}

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
    // Page background — two-stop diagonal from slate-50 to indigo-100. The
    // previous version had a `via-white` middle stop that put pure white
    // through the entire viewport centre, making the gradient effectively
    // invisible. Dropping it lets the colour carry edge-to-edge so the
    // GAPS between white cards finally show indigo/slate instead of more
    // white. Cards stay white on top — the gradient is the *table cloth*,
    // the cards are the *plates*.
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-100 flex">
      {/* ----------------------------- Sidebar -----------------------------
        * Dark navy rail. Matches the SafeReport app icon palette
        * (#0A1F46 with orange alert mark) and gives maximum differentiation
        * from the light page area — the standard pattern Linear / Notion /
        * Vercel use for dashboard chrome. Light page + dark rail removes
        * any ambiguity about where the app frame ends and content begins,
        * which is the exact thing the user kept calling out as "still all
        * white". */}
      <aside className="w-[240px] shrink-0 bg-gradient-to-b from-slate-900 via-[#0A1F46] to-slate-900 text-slate-200 border-r border-slate-950/40 shadow-2xl flex flex-col sticky top-0 h-screen">
        {/* Brand band — uses the custom SafeReport icon SVG we built
          * (navy shield + orange alert mark). Drops the indigo-on-indigo
          * Lucide Shield placeholder. The icon is decorative so it gets
          * aria-hidden; the brand text below already carries the meaning. */}
        <Link
          href="/ho"
          className="flex items-center gap-2.5 px-5 pt-5 pb-4 text-white hover:bg-white/5 transition-colors"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center shrink-0">
            <Image
              src="/icons/safereport-icon.svg"
              alt=""
              width={36}
              height={36}
              priority
              aria-hidden
            />
          </span>
          <span className="flex flex-col leading-tight min-w-0">
            <span className="font-display text-[15px] font-semibold tracking-tight text-white">
              SafeReport
            </span>
            <span className="text-[10.5px] text-slate-400">
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

        {/* User block — dark-rail compatible. Teal-300 avatar gradient
          * pops against the navy bg, top border in white/10 for the
          * subtlest possible separator. */}
        <div className="border-t border-white/10 bg-white/5 px-3 py-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-teal-300 to-teal-500 text-[12px] font-semibold text-teal-950 ring-2 ring-white/30 shadow-md">
              {initials(session.display_name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-white truncate">
                {session.display_name}
              </p>
              <p className="text-[11px] text-slate-400 truncate">
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
      {/* Pilot info card — dark-rail compatible. Translucent white panel
        * over the navy bg, sky-300 eyebrow for the brand accent. The
        * left orange accent line nods to the SafeReport icon's alert
        * mark colour, tying the rail back to the brand. */}
      <div className="mx-3 mt-3 mb-3 rounded-lg border border-white/10 bg-white/5 backdrop-blur-sm px-3 py-2.5 relative overflow-hidden">
        <span aria-hidden className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-orange-500" />
        <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-sky-300 ml-1.5">
          Pilot · ABFRL
        </p>
        <p className="mt-0.5 font-display text-[14px] font-semibold text-white ml-1.5">
          {counts.stores ?? 0} retail stores
        </p>
        <p className="text-[10.5px] text-slate-400 ml-1.5">In production</p>
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
      <div className="mx-3 mt-3 mb-3 rounded-lg border border-white/10 bg-white/5 backdrop-blur-sm px-3 py-2.5 animate-pulse relative overflow-hidden">
        <span aria-hidden className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-orange-500" />
        <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-sky-300 ml-1.5">
          Pilot · ABFRL
        </p>
        <p className="mt-0.5 font-display text-[14px] font-semibold text-slate-300 ml-1.5">
          ─ retail stores
        </p>
        <p className="text-[10.5px] text-slate-400 ml-1.5">Loading…</p>
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
