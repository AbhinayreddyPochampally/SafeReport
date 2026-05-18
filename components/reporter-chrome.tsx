"use client"

import { ArrowLeft, KeyRound } from "lucide-react"
import Link from "next/link"
import { AppIcon } from "@/components/app-icon"
import { t, useReporterLocale } from "@/lib/reporter-i18n"

/**
 * Reporter-screen chrome — brand bar + back link + 7-dot progress.
 *
 * Pulled into a shared component during the May 2026 mockup-audit batches
 * (b)+(c)+(f). Three divergences were the trigger:
 *
 *   (c) brand-bar persistence — every reporter screen post-landing dropped
 *       the APP icon + manager-login affordance. Live carried only a small
 *       "Step N of 6" text label. Mockup reporter_flow_v14 keeps the brand
 *       bar on every screen.
 *
 *   (b) 7-dot progress indicator — mockup uses a row of 7 dots (one active)
 *       on Triage through Review. Live used the same "Step N of 6" text
 *       label (six because identity is one screen).
 *
 *   (f) phone-viewport enforcement — reporter screens used max-w-xl which
 *       sprawls on desktop preview. CLAUDE.md says reporter is phone-only
 *       ~375px. The wrapper from this module sets max-w-sm so the layout
 *       feels right at QR-poster scan width.
 *
 * Step numbering (1-7) maps to:
 *   1 — Triage           ("What are you reporting?")
 *   2 — Sub-category     ("What did you see?")
 *   3 — When             ("When did this happen?")
 *   4 — Photo            ("Add a photo")
 *   5 — Describe         ("Tell us what happened")
 *   6 — Identity         ("Your name and number")
 *   7 — Review           ("Ready to submit?")
 *
 * Welcome, Language, and Confirm don't show progress dots in the mockup —
 * pass `step={null}` (or omit) to hide the dots row.
 *
 * Back-link target is provided per-screen — the chrome doesn't try to
 * derive it. Pass `backHref={null}` to suppress the back row (used on
 * Confirm where there's no meaningful back).
 */

const TOTAL_STEPS = 7

type Props = {
  sap_code: string
  /** 1..7 = highlight the corresponding dot. null/undefined = no dots row. */
  step?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | null
  /** Back-button href. null = suppress the back row entirely. */
  backHref?: string | null
}

export function ReporterScreenHeader({ sap_code, step = null, backHref }: Props) {
  const locale = useReporterLocale()
  const showDots = step !== null && step !== undefined

  return (
    <>
      {/* Brand bar — designed APP icon left, manager-login right.
          Persistent across every reporter screen so the user always has
          a thumb-reachable escape hatch to the manager surface if they
          scanned by mistake. */}
      <header className="flex items-center justify-between">
        <AppIcon
          size={40}
          className="rounded-[10px] shadow-[0_2px_6px_rgba(10,31,70,0.18)]"
        />
        <Link
          href={`/m/${sap_code}`}
          aria-label="Manager login"
          title="Manager login"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-indigo-500 hover:text-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-500/40"
        >
          <KeyRound className="h-4 w-4" strokeWidth={1.8} aria-hidden />
        </Link>
      </header>

      {/* Back row — only when we have a meaningful destination. */}
      {backHref ? (
        <div className="mt-4 flex items-center justify-between text-slate-700">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-700 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.8} aria-hidden />
            {t(locale, "common.back")}
          </Link>
        </div>
      ) : null}

      {/* Progress dots — mockup-spec 7-dot row, active state at indigo-700. */}
      {showDots ? (
        <div
          className="mt-4 flex justify-center gap-2"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={TOTAL_STEPS}
          aria-valuenow={step}
          aria-label={`Step ${step} of ${TOTAL_STEPS}`}
        >
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((n) => (
            <span
              key={n}
              aria-hidden
              className={
                n === step
                  ? "h-2 w-2 rounded-full bg-indigo-700"
                  : "h-2 w-2 rounded-full bg-slate-300"
              }
            />
          ))}
        </div>
      ) : null}
    </>
  )
}
