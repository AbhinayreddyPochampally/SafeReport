"use client"

import { ArrowLeft, Check, ShieldCheck } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import {
  LOCALES,
  LOCALE_ENGLISH_NAMES,
  LOCALE_LABELS,
  readLocale,
  writeLocale,
  type Locale,
} from "@/lib/reporter-i18n"

/**
 * Dedicated language picker — Phase 10 facelift.
 *
 * The landing previously held the language toggle inline; users couldn't
 * tell it was a focal interaction. Lifting it to its own page makes the
 * first-visit moment intentional: pick the script you read in, then go.
 *
 * Each locale renders as a large tappable card showing the native script
 * label (so a reporter recognises their language without reading English
 * first) plus the English-script name underneath. Selecting writes to
 * localStorage via writeLocale (dispatches sr:locale CustomEvent for other
 * locale-aware components) and routes back to the landing.
 *
 * Trilingual header above the cards — "Choose your language" rendered in
 * English plus each non-English locale's script — so a user who already
 * speaks their own language can find this screen without help.
 */

const NATIVE_PROMPTS: Record<Locale, string> = {
  en: "Choose your language",
  kn: "ನಿಮ್ಮ ಭಾಷೆ ಆಯ್ಕೆ ಮಾಡಿ",
  hi: "अपनी भाषा चुनें",
  ta: "உங்கள் மொழியைத் தேர்வு செய்யவும்",
  te: "మీ భాషను ఎంచుకోండి",
}

export default function LanguagePage({
  params,
}: {
  params: { sap_code: string }
}) {
  const router = useRouter()
  const [current, setCurrent] = useState<Locale>("en")

  useEffect(() => {
    setCurrent(readLocale())
  }, [])

  function pick(loc: Locale) {
    writeLocale(loc)
    setCurrent(loc)
    // Brief pause so the checkmark visibly lands before we navigate away.
    window.setTimeout(() => {
      router.push(`/r/${params.sap_code}`)
    }, 220)
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-6 py-8">
      <header className="flex items-center justify-between">
        <Link
          href={`/r/${params.sap_code}`}
          aria-label="Back"
          className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-700 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.8} aria-hidden />
          Back
        </Link>
        <div
          aria-label="SafeReport"
          className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-indigo-700 text-white shadow-[0_2px_6px_rgba(67,56,202,0.25)]"
        >
          <ShieldCheck className="h-6 w-6" strokeWidth={2} aria-hidden />
        </div>
      </header>

      <div className="mt-8 text-center">
        <h1 className="font-display text-[22px] font-bold leading-tight tracking-tight text-slate-900">
          {NATIVE_PROMPTS.en}
        </h1>
        {/* Native-script prompts so a reporter who doesn't read English
            can find their language on this screen. Order mirrors the
            canonical LOCALES tuple (kn, hi, ta, te). Each line uses its
            own Noto Sans family so devices without a system font for the
            script still render correctly. */}
        <p
          className="mt-2 font-display text-[15px] font-medium text-slate-600"
          style={{ fontFamily: "'Noto Sans Kannada', 'DM Sans', sans-serif" }}
        >
          {NATIVE_PROMPTS.kn}
        </p>
        <p
          className="mt-1 font-display text-[15px] font-medium text-slate-600"
          style={{ fontFamily: "'Noto Sans Devanagari', 'DM Sans', sans-serif" }}
        >
          {NATIVE_PROMPTS.hi}
        </p>
        <p
          className="mt-1 font-display text-[15px] font-medium text-slate-600"
          style={{ fontFamily: "'Noto Sans Tamil', 'DM Sans', sans-serif" }}
        >
          {NATIVE_PROMPTS.ta}
        </p>
        <p
          className="mt-1 font-display text-[15px] font-medium text-slate-600"
          style={{ fontFamily: "'Noto Sans Telugu', 'DM Sans', sans-serif" }}
        >
          {NATIVE_PROMPTS.te}
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        {LOCALES.map((loc) => {
          const selected = current === loc
          return (
            <button
              key={loc}
              type="button"
              onClick={() => pick(loc)}
              className={
                selected
                  ? "flex w-full items-center justify-between rounded-2xl border border-slate-900 bg-slate-900 px-5 py-4 text-left text-white shadow-[0_4px_14px_rgba(15,23,42,0.18)]"
                  : "flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left transition hover:border-indigo-500 hover:bg-indigo-50/40 focus:outline-none focus:ring-4 focus:ring-indigo-500/40"
              }
              aria-pressed={selected}
            >
              <span className="flex flex-col">
                <span
                  className={
                    selected
                      ? "text-[20px] font-semibold leading-tight"
                      : "text-[20px] font-semibold leading-tight text-slate-900"
                  }
                  // Inline font-family swap so each locale renders in its native script
                  // even if the global stylesheet hasn't matched all five.
                  style={{
                    fontFamily:
                      loc === "kn"
                        ? "'Noto Sans Kannada', 'DM Sans', sans-serif"
                        : loc === "te"
                          ? "'Noto Sans Telugu', 'DM Sans', sans-serif"
                          : loc === "hi"
                            ? "'Noto Sans Devanagari', 'DM Sans', sans-serif"
                            : loc === "ta"
                              ? "'Noto Sans Tamil', 'DM Sans', sans-serif"
                              : "inherit",
                  }}
                >
                  {LOCALE_LABELS[loc]}
                </span>
                <span
                  className={
                    selected
                      ? "mt-0.5 text-[12px] opacity-80"
                      : "mt-0.5 text-[12px] text-slate-500"
                  }
                >
                  {LOCALE_ENGLISH_NAMES[loc]}
                </span>
              </span>
              {selected ? (
                <Check className="h-5 w-5" strokeWidth={2.5} aria-hidden />
              ) : null}
            </button>
          )
        })}
      </div>

      <p className="mx-auto mt-6 max-w-[280px] text-center text-[12px] text-slate-500">
        You can change this anytime.
      </p>
    </main>
  )
}
