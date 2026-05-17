"use client"

import { ArrowLeft, ArrowRight } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { readDraft, readProfile, writeProfile } from "@/lib/reporter-state"
import { t, useReporterLocale } from "@/lib/reporter-i18n"

/**
 * Screen 8 (Phase 4 facelift) — Identity (name + phone).
 *
 * Moved from the landing page to after the Describe step. Reporters no
 * longer have to hand over identity to start reporting — they can scan,
 * choose a category, capture evidence, then commit identity at the end.
 *
 * Behavior:
 *  - On mount: if a profile already exists in localStorage (returning
 *    reporter), auto-skip straight to /review. The profile is shown on
 *    the Review screen with an Edit link for changes.
 *  - First-time reporter: render the name + phone form. Submit writes
 *    the profile and routes to /review.
 *
 * The mandatory anonymity microcopy ("Your name is visible only to Head
 * Office, never to the store manager") is verbatim per CLAUDE.md hard
 * rules. Do not paraphrase.
 */
export default function IdentityPage({
  params,
}: {
  params: { sap_code: string }
}) {
  const router = useRouter()
  const locale = useReporterLocale()
  const [checked, setChecked] = useState(false)
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    // Make sure prior steps were completed; otherwise route back.
    const draft = readDraft()
    if (!draft || draft.sap_code !== params.sap_code) {
      router.replace(`/r/${params.sap_code}/category`)
      return
    }
    if (!draft.category) {
      router.replace(`/r/${params.sap_code}/category`)
      return
    }
    if (!draft.event_at) {
      router.replace(`/r/${params.sap_code}/when`)
      return
    }
    // Returning reporter shortcut: profile already saved, skip ahead.
    const existing = readProfile()
    if (existing) {
      router.replace(`/r/${params.sap_code}/review`)
      return
    }
    setChecked(true)
  }, [params.sap_code, router])

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    const n = name.trim()
    const p = phone.trim()
    if (n.length < 2) {
      setErr(t(locale, "validate.name_required"))
      return
    }
    if (!/^[+0-9\s()-]{7,}$/.test(p)) {
      setErr(t(locale, "validate.phone_invalid"))
      return
    }
    writeProfile({ name: n, phone: p })
    router.push(`/r/${params.sap_code}/review`)
  }

  if (!checked) {
    return <main className="min-h-screen bg-slate-50" aria-hidden />
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-6 py-8">
      <div className="flex items-center justify-between text-slate-700">
        <Link
          href={`/r/${params.sap_code}/describe`}
          className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-700 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.8} aria-hidden />
          {t(locale, "common.back")}
        </Link>
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
          Step 6 of 6
        </span>
      </div>

      <h1 className="mt-6 font-display text-[28px] font-bold leading-9 text-slate-900">
        Your name and number
      </h1>
      <p className="mt-1 text-[13px] leading-5 text-slate-600">
        We&apos;ll share this with Head Office only, in case they have follow-up
        questions about this specific report.
      </p>

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
        <label className="block">
          <span className="block text-[12.5px] font-medium text-slate-700">
            {t(locale, "form.name_label")}
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t(locale, "form.name_placeholder")}
            autoComplete="given-name"
            className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-[14px] text-slate-900 outline-none placeholder:italic placeholder:text-slate-400 focus:ring-4 focus:ring-indigo-500/40"
          />
          {/* Mandatory verbatim microcopy per CLAUDE.md hard rules. Do not
              paraphrase or translate paraphrastically. */}
          <span className="mt-1.5 block text-[12px] text-slate-500">
            {t(locale, "form.anonymous_note")}
          </span>
        </label>

        <label className="block">
          <span className="block text-[12.5px] font-medium text-slate-700">
            {t(locale, "form.phone_label")}
          </span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t(locale, "form.phone_placeholder")}
            autoComplete="tel"
            inputMode="tel"
            className="mt-1.5 block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-[14px] text-slate-900 outline-none placeholder:italic placeholder:text-slate-400 focus:ring-4 focus:ring-indigo-500/40"
          />
        </label>

        {err && (
          <p
            role="alert"
            className="rounded-lg border border-orange-700/30 bg-orange-50 px-3 py-2 text-[12.5px] text-orange-700"
          >
            {err}
          </p>
        )}

        <div className="mt-auto pt-6">
          <button
            type="submit"
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 px-6 text-[15px] font-medium text-white transition hover:bg-indigo-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/40"
          >
            {t(locale, "common.continue")}
            <ArrowRight className="h-4 w-4" strokeWidth={1.8} aria-hidden />
          </button>
          <p className="mt-3 text-center text-[11px] uppercase tracking-wide text-slate-400">
            {t(locale, "common.anonymous_footer")}
          </p>
        </div>
      </form>
    </main>
  )
}
