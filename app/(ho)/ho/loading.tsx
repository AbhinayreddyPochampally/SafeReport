import {
  SkeletonCard,
  SkeletonHeader,
  SkeletonRows,
  SkeletonTile,
} from "@/components/ho-skeletons"

/**
 * /ho — Overview route skeleton.
 *
 * Mirrors the real Overview layout shape: header band, four velocity
 * tiles in a row, three-up pulse row, trend chart slab, two queue
 * cards side by side. Renders while the cached Overview data fetch
 * (unstable_cache, 30s TTL) is warming on a cold hit. On warm hits the
 * skeleton is invisible — RSC streams in immediately.
 */
export default function HoOverviewLoading() {
  return (
    <div className="max-w-[1400px] mx-auto px-8 py-8">
      <SkeletonHeader rightSlot />

      {/* Velocity strip — 4 tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonTile key={i} />
        ))}
      </div>

      {/* Pulse row — Today / Coverage / CategoryMix */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
        <SkeletonCard className="p-0 overflow-hidden">
          <SkeletonRows count={4} />
        </SkeletonCard>
        <SkeletonCard className="flex items-center gap-4">
          <div className="h-20 w-20 rounded-full bg-slate-200/70 animate-pulse" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="h-3 w-32 rounded bg-slate-200/70 animate-pulse" />
            <div className="h-3 w-20 rounded bg-slate-200/70 animate-pulse" />
          </div>
        </SkeletonCard>
        <SkeletonCard className="p-0 overflow-hidden">
          <SkeletonRows count={5} />
        </SkeletonCard>
      </div>

      {/* Trend chart slab */}
      <SkeletonCard className="mb-5 h-[260px]" />

      {/* Two queue cards */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <SkeletonCard className="p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 space-y-2">
            <div className="h-2.5 w-32 rounded bg-slate-200/70 animate-pulse" />
            <div className="h-5 w-40 rounded bg-slate-200/70 animate-pulse" />
            <div className="h-3 w-full max-w-md rounded bg-slate-200/60 animate-pulse" />
          </div>
          <SkeletonRows count={5} />
        </SkeletonCard>
        <SkeletonCard className="p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 space-y-2">
            <div className="h-2.5 w-32 rounded bg-slate-200/70 animate-pulse" />
            <div className="h-5 w-40 rounded bg-slate-200/70 animate-pulse" />
            <div className="h-3 w-full max-w-md rounded bg-slate-200/60 animate-pulse" />
          </div>
          <SkeletonRows count={5} />
        </SkeletonCard>
      </div>
    </div>
  )
}
