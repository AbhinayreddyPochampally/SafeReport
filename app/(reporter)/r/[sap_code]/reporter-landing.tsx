"use client"

import { Check, KeyRound, ShieldCheck, Store } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { ReporterIntro } from "@/components/reporter-intro"
import {
  LOCALES,
  LOCALE_ENGLISH_NAMES,
  LOCALE_LABELS,
  readLocale,
  writeLocale,
  type Locale,
} from "@/lib/reporter-i18n"

/**
 * Reporter landing — single combined screen at /r/[sap_code].
 *
 * Previously this surface had two pages: a welcome with "Get started" CTA,
 * and a separate /language picker. They were merged into one page after
 * user feedback ("we do not need separate welcome page as there is intro;
 * so combine language and store card"). The flow now is:
 *
 *   1. Reporter scans the QR → lands on /r/[sap_code]
 *   2. Cinematic <ReporterIntro> overlay paints on first visit
 *   3. "Get started" in the intro dismisses; reporter sees this page —
 *      brand bar + store card + language tiles
 *   4. Tap a language tile → writeLocale + route to /category (Triage)
 *
 * Returning visitors with `sr_intro_seen=1` skip the overlay; the page
 * renders directly with their current locale highlighted. Tapping the
 * same tile is idempotent — re-saves the locale and advances.
 *
 * The store card is intentionally English-only — brand name, store name,
 * city + state, SAP code are universal identifiers. Localising them would
 * fight transliteration norms (an Allen Solly store stays "Allen Solly"
 * in any script).
 */

type StoreCard = {
  sap_code: string
  name: string
  brand: string
  city: string
  state: string
}

export function ReporterLanding({ store }: { store: StoreCard }) {
  const router = useRouter()
  const [current, setCurrent] = useState<Locale>("en")

  useEffect(() => {
    setCurrent(readLocale())
  }, [])

  function pick(loc: Locale) {
    writeLocale(loc)
    setCurrent(loc)
    // Brief pause so the checkmark visibly lands before we navigate into
    // the Triage flow. Tapping the current tile is idempotent — same
    // locale gets re-saved, same navigation.
    window.setTimeout(() => {
      router.push(`/r/${store.sap_code}/category`)
    }, 220)
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col px-5 py-7">
      {/* Brand bar — APP icon left, manager-login key right. No back link
          (this is the root reporter screen — there's nowhere to go back to). */}
      <header className="flex items-center justify-between">
        <span
          aria-label="SafeReport"
          className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-indigo-700 text-white shadow-[0_2px_6px_rgba(67,56,202,0.25)]"
        >
          <ShieldCheck className="h-6 w-6" strokeWidth={2} aria-hidden />
        </span>
        <Link
          href={`/m/${store.sap_code}`}
          aria-label="Manager login"
          title="Manager login"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-indigo-500 hover:text-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-500/40"
        >
          <KeyRound className="h-4 w-4" strokeWidth={1.8} aria-hidden />
        </Link>
      </header>

      {/* Store card — English-only. Brand name + store name + city/state
          + SAP code are universal identifiers; localising them would
          fight transliteration norms. */}
      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 text-slate-600">
          <Store className="h-5 w-5" strokeWidth={1.8} aria-hidden />
          <span className="text-[11px] font-bold uppercase tracking-wide">
            {store.brand}
          </span>
        </div>
        <h1 className="mt-2 font-display text-[24px] font-bold leading-8 text-slate-900">
          {store.name}
        </h1>
        <p className="mt-1 text-[13px] text-slate-600">
          {store.city}, {store.state} &middot;{" "}
          <span className="font-mono">{store.sap_code}</span>
        </p>
      </section>

      {/* Language picker heading — English-only. The four-script
          subtitle stack that lived here was pulled per user feedback
          ("language tiles are pretty explanatory"). */}
      <h2 className="mt-6 font-display text-[18px] font-semibold leading-tight tracking-tight text-slate-900">
        Choose your language
      </h2>

      <div className="mt-4 flex flex-col gap-3">
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
                  // Inline font-family swap so each locale renders in its
                  // native script even if the global stylesheet hasn't
                  // matched all five.
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

      <p className="mx-auto mt-6 text-center text-[11px] uppercase tracking-wide text-slate-400">
        Anonymous to your store manager
      </p>

      {/* Cinematic first-visit intro overlay. Paints over this entire
          page until the reporter taps "Get started". Returning visitors
          (sr_intro_seen=1) see the picker immediately. */}
      <ReporterIntro sap_code={store.sap_code} />
    </main>
  )
}
