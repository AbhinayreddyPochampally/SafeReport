"use client"

import { CheckCircle2, Home, Plus } from "lucide-react"
import Link from "next/link"
import { useEffect } from "react"
import { clearDraft } from "@/lib/reporter-state"
import { t, useReporterLocale } from "@/lib/reporter-i18n"

/**
 * Screen 7 — Confirmation.
 *
 * The Review page clears the draft before navigating here, but we call
 * `clearDraft()` again on mount as a belt-and-braces safeguard: if a user
 * deep-links or refreshes this page while sessionStorage still has stale
 * draft state from another tab, it should still be wiped.
 */
export default function ConfirmPage({
  params,
}: {
  params: { sap_code: string; report_id: string }
}) {
  const locale = useReporterLocale()
  useEffect(() => {
    clearDraft()
  }, [])

  // The id comes straight out of the URL path and we validate the shape
  // (SR- followed by digits) so we don't render `/confirm/<script>` content
  // as a headline. If it looks malformed, fall back to a generic "submitted"
  // headline — the report still went through, we just don't trust the param.
  const prettyId = /^SR-\d{6,}$/.test(params.report_id) ? params.report_id : ""

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 py-16 text-center">
      <div
        className="flex h-20 w-20 items-center justify-center rounded-full bg-teal-700/10"
        aria-hidden
      >
        <CheckCircle2
          className="h-12 w-12 text-teal-700"
          strokeWidth={1.8}
        />
      </div>

      <p className="mt-6 text-[11px] font-bold uppercase tracking-wide text-slate-500">
        {t(locale, "confirm.eyebrow")}
      </p>

      {prettyId ? (
        <>
          <h1 className="mt-2 font-display text-[34px] font-bold tracking-tight text-slate-900">
            {prettyId}
          </h1>
          <p className="mt-3 max-w-sm text-[15px] leading-6 text-slate-700">
            {t(locale, "confirm.body.withid")}
          </p>
        </>
      ) : (
        <>
          <h1 className="mt-2 font-display text-[28px] font-bold tracking-tight text-slate-900">
            {t(locale, "confirm.title.noid")}
          </h1>
          <p className="mt-3 max-w-sm text-[15px] leading-6 text-slate-700">
            {t(locale, "confirm.body")}
          </p>
        </>
      )}

      <p className="mt-4 text-[12px] text-slate-500">
        {t(locale, "confirm.privacy")}
      </p>

      <div className="mt-10 flex w-full flex-col gap-3">
        <Link
          href={`/r/${params.sap_code}`}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 px-6 text-[15px] font-medium text-white transition hover:bg-indigo-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/40"
        >
          <Home className="h-4 w-4" strokeWidth={1.8} aria-hidden />
          {t(locale, "confirm.close")}
        </Link>
        <Link
          href={`/r/${params.sap_code}/category`}
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 text-[14px] font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-indigo-500/40"
        >
          <Plus className="h-4 w-4" strokeWidth={1.8} aria-hidden />
          {t(locale, "confirm.again")}
        </Link>
      </div>
    </main>
  )
}
