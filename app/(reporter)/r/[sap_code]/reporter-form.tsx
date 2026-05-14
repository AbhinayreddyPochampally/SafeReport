"use client"

import { ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import {
  clearProfile,
  readProfile,
  writeProfile,
  type ReporterProfile,
} from "@/lib/reporter-state"
import {
  readLocale,
  t,
  type Locale,
} from "@/lib/reporter-i18n"
import { LocalePicker } from "@/components/locale-picker"

type Props = { sap_code: string }

export function ReporterForm({ sap_code }: Props) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [existing, setExisting] = useState<ReporterProfile | null>(null)
  const [locale, setLocale] = useState<Locale>("en")

  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    setExisting(readProfile())
    setLocale(readLocale())
    setMounted(true)
    // React to locale changes from elsewhere on the page (header pill, etc).
    function onLocale(e: Event) {
      const custom = e as CustomEvent<Locale>
      if (custom.detail) setLocale(custom.detail)
    }
    window.addEventListener("sr:locale", onLocale)
    return () => window.removeEventListener("sr:locale", onLocale)
  }, [])

  // The LocalePicker writes to localStorage + dispatches sr:locale itself,
  // so the `setLocale` happens via the `sr:locale` listener above. This
  // callback only clears the validation error so the next attempt renders
  // in the newly-chosen language.
  function onLocalePicked() {
    setErr(null)
  }

  function validate(): ReporterProfile | null {
    const n = name.trim()
    const p = phone.trim()
    if (n.length < 2) {
      setErr(t(locale, "validate.name_required"))
      return null
    }
    if (!/^[+0-9\s()-]{7,}$/.test(p)) {
      setErr(t(locale, "validate.phone_invalid"))
      return null
    }
    setErr(null)
    return { name: n, phone: p }
  }

  function onContinueExisting() {
    router.push(`/r/${sap_code}/category`)
  }

  function onSwitch() {
    clearProfile()
    setExisting(null)
    setName("")
    setPhone("")
    setErr(null)
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const p = validate()
    if (!p) return
    writeProfile(p)
    router.push(`/r/${sap_code}/category`)
  }

  // Avoid a hydration flicker: wait until we know whether a profile exists.
  if (!mounted) {
    return (
      <div className="mt-6 h-[52px] rounded-xl border border-slate-200 bg-white" aria-hidden />
    )
  }

  if (existing) {
    return (
      <div className="mt-6 space-y-3" lang={locale}>
        {/* Reporting-as summary card. Bug fix 2026-05-13: this card used
            to be locale-blind, so a returning Kannada-only reporter had
            no way to switch back to English (or vice versa) without
            tapping Switch — which clears their saved profile. The
            compact pill row at the bottom restores that affordance
            without forcing the heavier full toggle UI. */}
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white text-[13px] leading-5">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-slate-600">{t(locale, "form.reporting_as")}</p>
              <p className="text-slate-900">
                <span className="font-medium">{existing.name}</span>
                <span className="text-slate-400"> · {existing.phone}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={onSwitch}
              className="text-[13px] font-medium text-indigo-700 underline hover:text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            >
              {t(locale, "form.switch")}
            </button>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              {t(locale, "landing.language")}
            </span>
            <LocalePicker variant="compact" onChange={onLocalePicked} />
          </div>
        </div>
        <button
          type="button"
          onClick={onContinueExisting}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 px-6 text-[15px] font-medium text-white transition hover:bg-indigo-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/40"
        >
          {t(locale, "form.continue")}
          <ArrowRight className="h-4 w-4" strokeWidth={1.8} aria-hidden />
        </button>
      </div>
    )
  }

  return (
    <div className="mt-6" lang={locale}>
      {/* Language picker — visible right above the intro + form so the
        * reporter sees it before they decide what language to use.
        * Right-aligned trigger so the chip sits in the corner the eye
        * already tracks (where the toggle used to be). */}
      <div className="mb-4 flex items-end justify-end">
        <LocalePicker variant="default" onChange={onLocalePicked} />
      </div>

      {/* Localised intro */}
      <section className="mb-6 space-y-2">
        <h2 className="font-display text-[20px] font-bold leading-7 text-slate-900">
          {t(locale, "page.title")}
        </h2>
        <p className="text-[15px] leading-6 text-slate-700">
          {t(locale, "page.lede")}
        </p>
        <p className="text-[13px] leading-5 text-slate-600">
          {t(locale, "page.privacy_note")}
        </p>
      </section>

      <form onSubmit={onSubmit} className="space-y-4" noValidate lang={locale}>
        <div>
          <label
            htmlFor="sr-name"
            className="block text-[13px] font-medium text-slate-900"
          >
            {t(locale, "form.name_label")}
          </label>
          <input
            id="sr-name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-[15px] text-slate-900 outline-none focus:ring-4 focus:ring-indigo-500/40"
            placeholder={t(locale, "form.name_placeholder")}
            required
          />
        </div>

        <div>
          <label
            htmlFor="sr-phone"
            className="block text-[13px] font-medium text-slate-900"
          >
            {t(locale, "form.phone_label")}
          </label>
          <input
            id="sr-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 block w-full min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-[15px] text-slate-900 outline-none focus:ring-4 focus:ring-indigo-500/40"
            placeholder={t(locale, "form.phone_placeholder")}
            required
          />
        </div>

        {err && (
          <p className="rounded-md bg-orange-100 px-3 py-2 text-[13px] text-orange-700">
            {err}
          </p>
        )}

        <button
          type="submit"
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 px-6 text-[15px] font-medium text-white transition hover:bg-indigo-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/40"
        >
          {t(locale, "form.continue")}
          <ArrowRight className="h-4 w-4" strokeWidth={1.8} aria-hidden />
        </button>

        <p className="text-center text-[11px] uppercase tracking-wide text-slate-400">
          {t(locale, "form.anonymous_note")}
        </p>
      </form>
    </div>
  )
}
