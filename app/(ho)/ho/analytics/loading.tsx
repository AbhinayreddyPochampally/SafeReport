import {
  SkeletonCard,
  SkeletonHeader,
  SkeletonTable,
  SkeletonTile,
} from "@/components/ho-skeletons"

/**
 * /ho/analytics — Analytics route skeleton.
 *
 * Header + range/filter card + four time-analytics tiles + two chart
 * slabs + leaderboard table. Charts are h-[240px] to match the real
 * chart canvas, so the page doesn't reflow when Recharts streams in.
 */
export default function HoAnalyticsLoading() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <SkeletonHeader rightSlot />

      {/* Range + filter card */}
      <SkeletonCard className="mb-5 px-4 py-3 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-7 w-14 rounded-full bg-slate-200/70 animate-pulse" />
          ))}
        </div>
        {Array.from({ length: 2 }).map((_, row) => (
          <div key={row} className="flex items-center gap-1.5 flex-wrap">
            <div className="h-3 w-12 rounded bg-slate-200/70 animate-pulse" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-6 w-20 rounded-full bg-slate-200/70 animate-pulse" />
            ))}
          </div>
        ))}
      </SkeletonCard>

      {/* Time-analytics header */}
      <div className="flex items-start gap-3 mb-4">
        <div className="h-10 w-10 rounded-full bg-slate-200/70 animate-pulse" />
        <div className="space-y-2">
          <div className="h-4 w-32 rounded bg-slate-200/70 animate-pulse" />
          <div className="h-3 w-72 rounded bg-slate-200/70 animate-pulse" />
        </div>
      </div>

      {/* Four KPI tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonTile key={i} />
        ))}
      </div>

      {/* Two chart slabs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SkeletonCard className="h-[320px]" />
        <SkeletonCard className="h-[320px]" />
      </div>

      {/* Leaderboard table */}
      <div className="mt-6">
        <SkeletonTable columns={6} rows={8} />
      </div>
    </div>
  )
}
