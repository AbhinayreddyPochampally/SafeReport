"use client"

import { ArrowLeft, ArrowRight } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { CATEGORIES, labelFor } from "@/lib/categories"
import {
  DateTimeWheel,
  defaultValue,
  toISO,
  type DateTimeValue,
} from "@/components/wheel-picker"
import { readDraft, readProfile, writeDraft } from "@/lib/reporter-state"
import { bcp47, t, useReporterLocale } from "@/lib/reporter-i18n"

/**
 * Screen 4 — when did it happen?
 *
 * Four-column wheel picker (Day · Hour 1-12 · Minute 00/15/30/45 · AM/PM).
 * Serialises to ISO 8601 in the user's local timezone and stashes on the
 * draft as `event_at`.
 */
export default function WhenPage({
  params,
}: {
  params: { sap_code: string }
}) {
  const router = useRouter()
  const locale = useReporterLocale()
  const [checked, setChecked] = useState(false)
  const [value, setValue] = useState<DateTimeValue>(() => defaultValue())
  const [categoryKey, setCategoryKey] = useState<string>("")

  useEffect(() => {
    if (!readProfile()) {
      router.replace(`/r/${params.sap_code}`)
      return
    }
    const draft = readDraft()
    if (!draft || !draft.category || draft.sap_code !== params.sap_code) {
      router.replace(`/r/${params.sap_code}/category`)
      return
    }
    if (draft.category) setCategoryKey(draft.category)

    // Reseed the default to "now" at mount time so a stale tab doesn't show
    // an hour that's 20 minutes old.
    setValue(defaultValue())
    setChecked(true)
  }, [params.sap_code, router])

  // Resolve category label every render so locale changes re-render it.
  const categoryLabel = useMemo(() => {
    const cat = CATEGORIES.find((c) => c.key === categoryKey)
    return cat ? labelFor(cat, locale) : ""
  }, [categoryKey, locale])

  const previewISO = useMemo(() => toISO(value), [value])
  const previewHuman = useMemo(() => {
    try {
      const d = new Date(previewISO)
      // BCP 47 tag — hi-IN / kn-IN / te-IN render weekday/month in the
      // user's script when the browser ships that locale data (modern
      // Chrome / iOS Safari do; older Android WebView falls back to
      // English numerals).
      return d.toLocaleString(bcp47(locale), {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    } catch {
      return ""
    }
  }, [previewISO, locale])

  function onContinue() {
    const iso = toISO(value)
    writeDraft({ sap_code: params.sap_code, event_at: iso })
    router.push(`/r/${params.sap_code}/photo`)
  }

  if (!checked) {
    return <main className="min-h-screen bg-slate-50" aria-hidden />
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-6 py-8">
      <div className="flex items-center justify-between text-slate-700">
        <Link
          href={`/r/${params.sap_code}/category`}
          className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-700 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.8} aria-hidden />
          {t(locale, "common.back")}
        </Link>
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
          {t(locale, "common.step.3of4")}
        </span>
      </div>

      {categoryLabel && (
        <p className="mt-6 text-[11px] font-bold uppercase tracking-wide text-slate-600">
          {categoryLabel}
        </p>
      )}
      <h1 className="mt-1 font-display text-[28px] font-bold leading-9 text-slate-900">
        {t(locale, "when.title")}
      </h1>
      <p className="mt-1 text-[13px] leading-5 text-slate-600">
        {t(locale, "when.lede")}
      </p>

      <div className="mt-6">
        <DateTimeWheel value={value} onChange={setValue} />
      </div>

      <div className="mt-5 text-center">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
          {t(locale, "when.selected")}
        </p>
        <p className="mt-1 text-[15px] font-medium text-slate-900">
          {previewHuman}
        </p>
      </div>

      <div className="mt-auto pt-8">
        <button
          type="button"
          onClick={onContinue}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 px-6 text-[15px] font-medium text-white transition hover:bg-indigo-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/40"
        >
          {t(locale, "common.continue")}
          <ArrowRight className="h-4 w-4" strokeWidth={1.8} aria-hidden />
        </button>
        <p className="mt-3 text-center text-[11px] uppercase tracking-wide text-slate-400">
          {t(locale, "common.anonymous_footer")}
        </p>
      </div>
    </main>
  )
}
