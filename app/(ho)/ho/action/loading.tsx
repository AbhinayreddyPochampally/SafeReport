import { SkeletonCard, SkeletonRows } from "@/components/ho-skeletons"

/**
 * /ho/action — Action route skeleton.
 *
 * Mirrors the real Action page layout: eyebrow + title header, filter
 * chip row, then a master-detail two-column layout (340px list on the
 * left, sticky detail card on the right). Painted while the route's
 * server data fetch warms; on warm hits the skeleton is invisible.
 */
export default function HoActionLoading() {
  return (
    <div className="max-w-[1500px] mx-auto px-6 py-6">
      {/* Header */}
      <header className="mb-4 space-y-2">
        <div className="h-2.5 w-20 rounded bg-slate-200/70 animate-pulse" />
        <div className="h-8 w-44 rounded bg-slate-200/70 animate-pulse" />
        <div className="h-3 w-80 rounded bg-slate-200/60 animate-pulse" />
      </header>

      {/* Filter chips */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-7 w-24 rounded-full bg-slate-200/70 animate-pulse"
          />
        ))}
      </div>

      {/* Master-detail */}
      <div className="grid grid-cols-1 md:grid-cols-[340px_minmax(0,1fr)] gap-4">
        <SkeletonCard className="p-0 overflow-hidden">
          <SkeletonRows count={6} />
        </SkeletonCard>
        <SkeletonCard className="p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 space-y-2">
            <div className="h-2.5 w-32 rounded bg-slate-200/70 animate-pulse" />
            <div className="h-5 w-60 rounded bg-slate-200/70 animate-pulse" />
            <div className="h-3 w-full max-w-md rounded bg-slate-200/60 animate-pulse" />
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="aspect-[4/3] rounded-lg bg-slate-200/70 animate-pulse" />
              <div className="aspect-[4/3] rounded-lg bg-slate-200/70 animate-pulse" />
            </div>
            <div className="h-3 w-full rounded bg-slate-200/60 animate-pulse" />
            <div className="h-3 w-3/4 rounded bg-slate-200/60 animate-pulse" />
          </div>
        </SkeletonCard>
      </div>
    </div>
  )
}
