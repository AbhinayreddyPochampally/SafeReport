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
 * Renders a left sidebar (232px) with brand, pilot context block, primary
 * nav, and the user/sign-out block at the bottom. Main content fills the
 * rest of the viewport.
 *
 * REDESIGN (May 2026, post-Claude-Design handoff):
 *   The earlier rev used a navy-gradient sidebar against a slate-to-indigo
 *   gradient page background. Reviewers flagged it as noisy — five different
 *   gradients per screen with no shared rhythm. The redesign drops every
 *   gradient and switches to a light sidebar (white, 1px slate-200 border)
 *   against a flat slate-50 page. Cards do the visual work; the chrome stays
 *   out of the way. Matches VISUAL_LANGUAGE.md's "flat fills, no gradients"
 *   rule that the previous rev had drifted from.
 *
 * Per-tab counts (Action = awaiting HO + stale-new, Stores = total active)
 * are fetched server-side once per page load so the sidebar shows live
 * numbers without any client polling.
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
    // Page background — flat slate-50. Earlier rev had a slate-50 → indigo-100
    // diagonal gradient, but the redesign moved to flat fills (one card style,
    // one shell colour) so the gradient came out. Cards are still white on
    // slate-50, which keeps a clear plate-on-tablecloth read without any
    // colour transitions doing the visual work.
    <div className="min-h-screen bg-slate-50 flex">
      {/* ----------------------------- Sidebar -----------------------------
        * Dark indigo → deep teal vertical gradient. Reviewer asked for a
        * deeper, calmer rail than the mid-tone indigo-700 → teal-600
        * earlier today — the saturated mids competed with content. This
        * deep variant (slate-900 → indigo-900 → teal-900) gives the
        * "navy with a green nod" feel without the visual weight.
        * `teal-*` keeps the no-green-* lint satisfied; `green-*` /
        * `emerald-*` / `lime-*` remain off-limits.
        *
        * Light text on top. The SafeReport SVG icon (the same one shown
        * on QR posters and PWA tiles) lives in the brand band so the
        * branding stays consistent across surfaces. */}
      <aside className="w-[232px] shrink-0 bg-gradient-to-b from-slate-900 via-indigo-900 to-teal-900 text-white border-r border-slate-950/80 flex flex-col sticky top-0 h-screen">
        {/* Brand band — uses the SafeReport icon SVG (navy shield + orange
          * alert dot) so the sidebar mark matches the QR poster + PWA
          * launcher tile. The icon already carries the alert dot, so no
          * separate ring is needed. */}
        <Link
          href="/ho"
          className="flex items-center gap-2.5 px-[18px] pt-[18px] pb-3 border-b border-white/10 hover:bg-white/5 transition-colors"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center shrink-0 rounded-md bg-white/10 ring-1 ring-white/20 overflow-hidden">
            <Image
              src="/icons/safereport-icon.svg"
              alt=""
              width={28}
              height={28}
              priority
              aria-hidden
            />
          </span>
          <span className="flex flex-col leading-tight min-w-0">
            <span className="font-display text-[14px] font-semibold tracking-tight text-white">
              SafeReport
            </span>
            <span className="text-[11px] text-white/70">Head Office</span>
          </span>
        </Link>

        {/* Counts-dependent block streams in via Suspense so a Supabase
            hiccup never blocks the rest of the layout from rendering. */}
        <Suspense fallback={<SidebarCountsFallback />}>
          <SidebarCountsBlock />
        </Suspense>

        {/* Spacer pushes the user block to the bottom */}
        <div className="flex-1" />

        {/* User block — translucent against the gradient. Slightly darker
          * wash (black/25) since the deep gradient already runs darker
          * than the previous indigo-700 rail — keeps the bottom block
          * distinguishable from the body of the nav. */}
        <div className="border-t border-white/15 bg-black/25 px-3.5 py-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white text-[12px] font-semibold shrink-0 ring-1 ring-white/25">
              {initials(session.display_name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-white truncate">
                {session.display_name}
              </p>
              <p className="text-[11px] text-white/70 truncate">
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
      {/* Pilot info card — dark-rail variant.
        * Translucent white panel over the gradient, amber-300 eyebrow so
        * the brand alert accent reads against the dark bg. */}
      <div className="mx-3.5 mt-3.5 mb-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-2.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-300">
          Pilot
        </p>
        <p className="mt-0.5 font-display text-[14px] font-semibold text-white">
          ABF · {counts.stores ?? 0} stores
        </p>
        <p className="text-[11px] text-white/70">In production · May 2026</p>
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
      <div className="mx-3.5 mt-3.5 mb-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 animate-pulse">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-300">
          Pilot
        </p>
        <p className="mt-0.5 font-display text-[14px] font-semibold text-white/60">
          ABF · ─ stores
        </p>
        <p className="text-[11px] text-white/60">Loading…</p>
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
  // 60-second TTL: pilot-scale counts are decorative and stable across
  // tab switches. Doubling the window from 30s halves cold-cache misses
  // during a typical HO session and tightens the perceived tab-switch
  // snap. Mutating routes call revalidateTag("ho-sidebar-counts") if
  // they need the badge to update immediately.
  { revalidate: 60, tags: ["ho-sidebar-counts"] },
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
