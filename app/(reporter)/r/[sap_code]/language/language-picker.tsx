"use client"

import { ArrowLeft, Check, ShieldCheck, Store } from "lucide-react"
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
 * Language picker — client component, rendered by the server-component
 * page wrapper which fetches the store row and passes it down.
 *
 * Layout (May 2026 rev after the user flagged divergences):
 *  1. Brand-bar at the top (APP icon + Back link)
 *  2. Store card (brand eyebrow + name + city/state + SAP code) — same
 *     content as the welcome landing's store card so the reporter sees
 *     where they're reporting before they pick a script.
 *  3. Compact "Choose your language" heading (English-only — the user
 *     explicitly called the four-script subtitle stack noise; the tiles
 *     below carry their own native-script labels, which is the
 *     recognition signal).
 *  4. Locale tiles — native-script label on top, English-script name
 *     underneath, large tap target.
 *
 * The cinematic <ReporterIntro> overlay is mounted at the bottom of this
 * component (with `sap_code` so its dismiss handler knows the return
 * route). The overlay is `position: fixed; inset: 0; z-index: 50` so it
 * paints over the entire picker on first visit; once the reporter taps
 * "Get started" the overlay unmounts and they're sitting on the picker
 * already (no second navigation). For returning reporters who have
 * `sr_intro_seen=1` it renders null and the picker shows immediately.
 */

type StoreCard = {
  sap_code: string
  name: string
  brand: string
  city: string
  state: string
}

export function LanguagePicker({ store }: { store: StoreCard }) {
  const router = useRouter()
  const [current, setCurrent] = useState<Locale>("en")

  useEffect(() => {
    setCurrent(readLocale())
  }, [])

  function pick(loc: Locale) {
    writeLocale(loc)
    setCurrent(loc)
    // Brief pause so the checkmark visibly lands before we navigate away
    // to the welcome page (where the reporter taps "Get started" into
    // the Triage flow).
    window.setTimeout(() => {
      router.push(`/r/${store.sap_code}`)
    }, 220)
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col px-5 py-7">
      {/* Brand-bar — APP icon left, Back link right. Back goes to the
          welcome landing for reporters who arrived here via the "Change
          language" affordance; first-time visitors never reach Back
          because the intro overlay paints on top until dismissed. */}
      <header className="flex items-center justify-between">
        <span
          aria-label="SafeReport"
          className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-indigo-700 text-white shadow-[0_2px_6px_rgba(67,56,202,0.25)]"
        >
          <ShieldCheck className="h-6 w-6" strokeWidth={2} aria-hidden />
        </span>
        <Link
          href={`/r/${store.sap_code}`}
          aria-label="Back"
          className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-700 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.8} aria-hidden />
          Back
        </Link>
      </header>

      {/* Store card — same shape and content as the welcome landing.
          Names + brand + city + SAP code are universal so it stays
          unlocalised. */}
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

      {/* Heading — English-only. The four-script subtitle stack that
          lived here was pulled per user feedback ("language tiles are
          pretty explanatory"). */}
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

      <p className="mx-auto mt-6 max-w-[280px] text-center text-[12px] text-slate-500">
        You can change this anytime.
      </p>

      {/* Cinematic first-visit intro. Mounted here so it paints over
          the Language page (the literal first interactive page in the
          Intro → Language → flow order). On dismiss the overlay just
          hides — the reporter is already on the picker, no nav needed.
          For returning reporters who have sr_intro_seen=1 this renders
          null. */}
      <ReporterIntro sap_code={store.sap_code} />
    </main>
  )
}
