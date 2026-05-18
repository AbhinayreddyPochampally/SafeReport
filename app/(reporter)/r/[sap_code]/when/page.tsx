"use client"

import { ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { ReporterScreenHeader } from "@/components/reporter-chrome"
import {
  DateTimeWheel,
  defaultValue,
  toISO,
  type DateTimeValue,
} from "@/components/wheel-picker"
import { getDraftBlobs, readDraft, writeDraft } from "@/lib/reporter-state"
import { bcp47, t, useReporterLocale } from "@/lib/reporter-i18n"

/**
 * Screen 3 — when did it happen?
 *
 * Four-column wheel picker (Day · Hour 1-12 · Minute 00/15/30/45 · AM/PM).
 * Serialises to ISO 8601 in the user's local timezone and stashes on the
 * draft as `event_at`.
 *
 * Mig 007 follow-up: re-ordered to land AFTER /describe. The reporter
 * narrates the incident (photo + voice/text) while it's fresh, then
 * recalls the time. Category is set by AI after submission (see
 * lib/classify.ts) so we never gate on it.
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

  useEffect(() => {
    // Reseed the default to "now" at mount time so a stale tab doesn't show
    // an hour that's 20 minutes old. Photo + voice/text prerequisites are
    // implicit — the reporter walked through /photo and /describe to get
    // here, and those pages own the validation. Hard-guard so a stale
    // tab can't land here without a photo (we'd lose the event_at on the
    // user's recall).
    const draft = readDraft()
    if (!draft || draft.sap_code !== params.sap_code) {
      router.replace(`/r/${params.sap_code}/photo`)
      return
    }
    const blobs = getDraftBlobs(draft.draftId)
    if (!blobs.photo) {
      router.replace(`/r/${params.sap_code}/photo`)
      return
    }
    setValue(defaultValue())
    setChecked(true)
  }, [params.sap_code, router])

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
    // Mig 007 follow-up: /when is now between /describe and /identity.
    router.push(`/r/${params.sap_code}/identity`)
  }

  if (!checked) {
    return <main className="min-h-screen bg-slate-50" aria-hidden />
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col px-5 py-7">
      <ReporterScreenHeader
        sap_code={params.sap_code}
        backHref={`/r/${params.sap_code}/describe`}
        step={3}
      />

      <h1 className="mt-5 font-display text-[22px] font-bold leading-tight text-slate-900">
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
