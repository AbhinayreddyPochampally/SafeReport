import {
  SkeletonCard,
  SkeletonTable,
  SkeletonTile,
} from "@/components/ho-skeletons"

/**
 * /ho/stores — Stores route skeleton.
 *
 * Header (with the action-button cluster on the right) + 6 stat tiles
 * + filter card + roster table. The attention panel is intentionally
 * NOT skeletoned — it only renders when there's at least one un-resolved
 * candidate, and a placeholder for "maybe nothing to show" would just
 * leave a permanent ghost slab. The real panel pops in only when needed.
 */
export default function HoStoresLoading() {
  return (
    <div className="max-w-[1400px] mx-auto px-8 py-8">
      {/* Header — flat eyebrow + title block. Matches the real page's
        * eyebrow + title layout so the swap-in is invisible. */}
      <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <div className="h-2.5 w-24 rounded bg-slate-200/70 animate-pulse" />
          <div className="h-8 w-32 rounded bg-slate-200/70 animate-pulse" />
          <div className="h-3 w-72 rounded bg-slate-200/60 animate-pulse" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-9 w-32 rounded-md bg-slate-200/70 animate-pulse" />
          ))}
        </div>
      </header>

      {/* Six stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonTile key={i} />
        ))}
      </div>

      {/* Filter card */}
      <SkeletonCard className="mb-4 px-3 py-2.5 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="h-8 w-72 rounded-md bg-slate-200/70 animate-pulse" />
          <div className="h-8 w-24 rounded-md bg-slate-200/70 animate-pulse" />
          <div className="h-8 w-24 rounded-md bg-slate-200/70 animate-pulse ml-auto" />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-6 w-16 rounded-full bg-slate-200/70 animate-pulse" />
          ))}
        </div>
      </SkeletonCard>

      <SkeletonTable columns={7} rows={8} />
    </div>
  )
}
