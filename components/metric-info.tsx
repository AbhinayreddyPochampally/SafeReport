"use client"

import { Info } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"

/**
 * Inline info popover for KPI tiles.
 *
 * Replaces the native `title` attribute we used to hang off the Info icon —
 * that lived under a 700ms browser delay, was unstyled, and didn't render at
 * all on touch. This component opens on hover *and* on click, dismisses on
 * outside-click / Escape / re-click, and renders rich content (paragraph +
 * optional formula block) so we can explain things like what "pts" means
 * without cluttering the card body.
 *
 * Positioning: absolutely positioned below-left of the icon. The popover
 * width is fixed (~260px) so we don't depend on container clamps. We bias
 * to the right edge of the icon so it doesn't overflow the card border.
 *
 * Don't reach for a third-party popover for this — the card grid is dense
 * and we only need a small, self-contained hover/click affordance. Floating
 * UI would be overkill.
 */
export function MetricInfo({
  title,
  body,
  formula,
  example,
}: {
  /** Short headline shown bold at the top of the popover. */
  title: string
  /** Plain-language definition of what the metric measures. */
  body: string
  /** Optional formula line, rendered in a monospace tile. */
  formula?: string
  /** Optional concrete example sentence. */
  example?: string
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLSpanElement | null>(null)
  const popoverId = useId()

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      const node = containerRef.current
      if (!node) return
      if (node.contains(e.target as Node)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDocClick)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDocClick)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <span
      ref={containerRef}
      className="relative inline-flex shrink-0"
      // Hover opens; mouseleave on the wrapper (which contains both the
      // icon AND the popover) closes — so dragging the cursor onto the
      // popover doesn't dismiss it.
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`About: ${title}`}
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 cursor-help"
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open && (
        <div
          id={popoverId}
          role="dialog"
          aria-label={title}
          className="absolute right-0 top-6 z-50 w-[260px] rounded-lg border border-slate-200 bg-white p-3 text-left shadow-lg shadow-slate-900/10 ring-1 ring-slate-900/5"
        >
          {/* No close button — hover-leave on the wrapper already dismisses,
            * Escape dismisses, and clicking outside dismisses. The X used to
            * sit in the corner here was redundant and stole visual weight
            * from the title. */}
          <p className="text-[12px] font-semibold text-slate-900 leading-tight">
            {title}
          </p>
          <p className="mt-1.5 text-[11.5px] leading-[1.45] text-slate-600">
            {body}
          </p>
          {formula && (
            <div className="mt-2 rounded-md bg-slate-50 border border-slate-100 px-2 py-1.5">
              <p className="text-[9.5px] font-bold uppercase tracking-[0.10em] text-slate-500">
                How it&apos;s calculated
              </p>
              <p className="mt-0.5 font-mono text-[10.5px] leading-[1.4] text-slate-800">
                {formula}
              </p>
            </div>
          )}
          {example && (
            <p className="mt-2 text-[10.5px] italic leading-[1.45] text-slate-500">
              {example}
            </p>
          )}
        </div>
      )}
    </span>
  )
}
