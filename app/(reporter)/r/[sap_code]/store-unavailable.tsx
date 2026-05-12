"use client"

import { t, useReporterLocale } from "@/lib/reporter-i18n"

/**
 * Reporter landing fallback — shown when the SAP code in the URL doesn't
 * resolve to an active store row.
 *
 * Pulled out into its own client component so it can hook into
 * `useReporterLocale()` and render in whichever language the reporter
 * previously chose (persisted in localStorage). The parent page is a
 * server component (it queries Supabase), and a server component can't
 * call client hooks.
 *
 * First-time visitors with no persisted locale see English — which is
 * fine, this is an error/edge state, not a primary surface.
 */
export function StoreUnavailable({ sap_code }: { sap_code: string }) {
  const locale = useReporterLocale()
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-5 px-6 py-16">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
        {t(locale, "unavailable.eyebrow")}
      </p>
      <h1 className="font-display text-[28px] font-bold leading-9 text-slate-900">
        {t(locale, "unavailable.title")}
      </h1>
      <p className="text-[15px] leading-6 text-slate-600">
        {t(locale, "unavailable.body")}{" "}
        <span className="font-mono text-slate-900">{sap_code}</span>
      </p>
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-[13px] leading-5 text-slate-600">
        {t(locale, "unavailable.tip")}
      </div>
    </main>
  )
}
