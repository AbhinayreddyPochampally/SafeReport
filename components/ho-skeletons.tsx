/**
 * HO route loading skeletons.
 *
 * Next.js renders the matching `loading.tsx` while a route segment's data
 * fetches resolve, then streams the real markup in. Before adding these,
 * tab switches felt fast on the first paint (chrome + sidebar already
 * cached) but the main content area sat empty for ~0.5-1s while the
 * server roundtripped, which the user perceived as 'slightly slow'.
 *
 * The skeletons:
 *   • Match the layout shape of each route so the eye doesn't see a
 *     content shift when the real page swaps in.
 *   • Use the same glass-panel gradient (from-white via-slate-50 to-
 *     slate-100) the real cards use, so the swap-in is a content
 *     change, not a chrome change.
 *   • Subtle pulse animation (Tailwind's animate-pulse) on the inner
 *     placeholders so the page feels alive while the data lands.
 *
 * Building blocks live here; each `loading.tsx` composes them.
 */

import type { ReactNode } from "react"

/* ------------------------------ Primitives ------------------------------ */

/** Pulsing rectangle. Width/height set by Tailwind classes from the caller. */
export function SkeletonBar({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded bg-slate-200/70 ${className}`}
    />
  )
}

/** Card-shaped placeholder. Mirrors the glass-panel chrome the real cards
 * use so the swap-in is invisible at the chrome level. */
export function SkeletonCard({
  className = "",
  children,
}: {
  className?: string
  children?: ReactNode
}) {
  return (
    <div
      className={`bg-gradient-to-br from-white via-slate-50 to-slate-100 border border-slate-200 rounded-xl shadow-sm p-4 ${className}`}
    >
      {children}
    </div>
  )
}

/** Page header band placeholder — matches the slate-100 → white band the
 * four HO pages now share. */
export function SkeletonHeader({ rightSlot }: { rightSlot?: boolean }) {
  return (
    <header className="mb-6 rounded-xl bg-gradient-to-r from-slate-100 to-white border border-slate-200 px-5 py-4 shadow-sm flex items-end justify-between gap-4 flex-wrap">
      <SkeletonBar className="h-7 w-40" />
      {rightSlot && <SkeletonBar className="h-8 w-32" />}
    </header>
  )
}

/** One velocity-tile skeleton — title row + big number + delta line +
 * sparkline strip. Matches the real VelocityTile / TimeCard shape. */
export function SkeletonTile() {
  return (
    <SkeletonCard className="flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <SkeletonBar className="h-9 w-9 rounded-full" />
          <SkeletonBar className="h-3.5 w-24" />
        </div>
        <SkeletonBar className="h-3.5 w-3.5 rounded-full" />
      </div>
      <SkeletonBar className="mt-3 h-8 w-20" />
      <SkeletonBar className="mt-2 h-3 w-32" />
      <SkeletonBar className="mt-3 h-8 w-full" />
    </SkeletonCard>
  )
}

/** A simple stack of placeholder rows inside a card — used for queue lists,
 * Today panel, and any list-shaped section. */
export function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div className="divide-y divide-slate-100">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-4 py-3"
        >
          <SkeletonBar className="h-2 w-2 rounded-full" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <SkeletonBar className="h-3 w-2/3" />
            <SkeletonBar className="h-2.5 w-1/2" />
          </div>
          <SkeletonBar className="h-3 w-10" />
        </div>
      ))}
    </div>
  )
}

/** A skeleton table — header row + N rows of cells. Used for the Reports
 * table and the Stores roster. */
export function SkeletonTable({
  columns,
  rows = 8,
}: {
  columns: number
  rows?: number
}) {
  return (
    <div className="bg-gradient-to-br from-white via-slate-50 to-slate-100 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      <div className="bg-slate-100/70 px-4 py-2.5 border-b border-slate-200 flex items-center gap-4">
        {Array.from({ length: columns }).map((_, i) => (
          <SkeletonBar
            key={i}
            className={`h-3 ${i === 0 ? "w-20" : i === columns - 1 ? "w-14 ml-auto" : "w-24"}`}
          />
        ))}
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            {Array.from({ length: columns }).map((_, j) => (
              <SkeletonBar
                key={j}
                className={`h-3 ${j === 0 ? "w-20" : j === columns - 1 ? "w-14 ml-auto" : "w-32"}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
