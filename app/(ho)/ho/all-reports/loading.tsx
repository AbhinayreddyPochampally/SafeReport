import {
  SkeletonCard,
  SkeletonHeader,
  SkeletonTable,
} from "@/components/ho-skeletons"

/**
 * /ho/all-reports — Reports route skeleton.
 *
 * Header band + compact filter card + dense table. Filter card mirrors
 * the three-row chip layout the real card uses (status row, category
 * row, brand row) so the chrome doesn't shift when the page swaps in.
 */
export default function HoReportsLoading() {
  return (
    <div className="max-w-[1400px] mx-auto px-8 py-8">
      <SkeletonHeader rightSlot />

      {/* Filter card — search input + 3 chip rows */}
      <SkeletonCard className="mb-3 px-3 py-2.5 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="h-8 w-72 rounded-md bg-slate-200/70 animate-pulse" />
          <div className="h-8 w-32 rounded-md bg-slate-200/70 animate-pulse" />
          <div className="h-8 w-32 rounded-md bg-slate-200/70 animate-pulse" />
        </div>
        {Array.from({ length: 3 }).map((_, row) => (
          <div key={row} className="flex items-center gap-1.5 flex-wrap">
            <div className="h-3 w-14 rounded bg-slate-200/70 animate-pulse" />
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-6 w-16 rounded-full bg-slate-200/70 animate-pulse"
              />
            ))}
          </div>
        ))}
      </SkeletonCard>

      {/* Meta line */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="h-3 w-48 rounded bg-slate-200/70 animate-pulse" />
        <div className="h-3 w-32 rounded bg-slate-200/70 animate-pulse" />
      </div>

      <SkeletonTable columns={6} rows={10} />
    </div>
  )
}
