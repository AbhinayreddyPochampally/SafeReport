"use client"

import { ArrowRight, KeyRound, MapPin, Store } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { AppIcon } from "@/components/app-icon"
import { ReporterIntro } from "@/components/reporter-intro"

/**
 * Reporter landing — single combined screen at /r/[sap_code].
 *
 * Migration 007 (May 2026) trimmed this surface twice over: the triage +
 * sub-category screens were removed (AI now picks the category), and the
 * language tile picker was removed too. The flow is now:
 *
 *   1. Reporter scans the QR → lands on /r/[sap_code]
 *   2. Cinematic <ReporterIntro> overlay paints on first visit
 *   3. "Get started" in the intro dismisses; reporter sees this page —
 *      brand bar + store card + single "Start reporting" CTA
 *   4. Tap CTA → route to /when (wheel picker, step 1 of 5)
 *
 * Why the language picker is gone:
 *   - The voice-transcription pipeline auto-detects whatever language the
 *     reporter speaks (Kannada / Hindi / Telugu / Tamil / Marathi /
 *     English / code-switched) and translates to English for HO. The
 *     reporter never had to choose anything for the speech path to work;
 *     the picker only drove the UI text.
 *   - Pilot reporters are off-roll floor staff who scan once. Forcing
 *     them through a language tile picker before they can even start
 *     adds friction with very little benefit — the UI is mostly icons
 *     and short button labels.
 *   - English is the lingua franca on every ABFRL store floor;
 *     iconography does the heavy lifting for non-English readers.
 *
 * The lib/reporter-i18n module is intact and useReporterLocale() still
 * resolves to "en" everywhere — keeps the door open for a per-store
 * default locale (set by HO) in a later phase without ripping out the
 * underlying machinery.
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

  // `reveal` gates the post-intro entry animation. Three states matter:
  //
  //   1. SSR / first paint  — `reveal` is false; landing renders with
  //      opacity 0 so there's no flash of unstyled content underneath
  //      the intro overlay.
  //   2. Returning visitor  — useEffect sees the intro-seen flag in
  //      localStorage and sets `reveal=true` immediately. The CSS uses
  //      a 0s-delay path that just sets opacity 1 with no transform
  //      — page appears instantly.
  //   3. First-time visitor — useEffect leaves `reveal=false` while
  //      the intro plays on top. The intro fires `sr:intro-dismissed`
  //      when the user taps Get started; the listener flips `reveal`
  //      and the CSS plays the entrance keyframes (store card slides
  //      up + scales + shadow grows, then lede + CTA cascade).
  //
  // We track an `instant` flag too so the no-intro path can short-
  // circuit the keyframes without flashing them at zero duration.
  const [reveal, setReveal] = useState(false)
  const [instant, setInstant] = useState(false)

  useEffect(() => {
    let seen = false
    try {
      seen = window.localStorage.getItem("sr_intro_seen") === "1"
    } catch {
      // localStorage unavailable — treat as "first visit", let the
      // intro / event-driven path drive the reveal.
    }
    if (seen) {
      setInstant(true)
      setReveal(true)
      return
    }
    function onDismiss() {
      setReveal(true)
    }
    window.addEventListener("sr:intro-dismissed", onDismiss as EventListener)
    return () => {
      window.removeEventListener(
        "sr:intro-dismissed",
        onDismiss as EventListener,
      )
    }
  }, [])

  // `wrongStore` flips when the reporter taps "Wrong store" on the
  // confirm prompt. We swap the primary CTA for a recovery hint rather
  // than navigating away — for an off-roll floor worker who scanned the
  // wrong poster, the action they actually need is "go find the right
  // poster", which we tell them on-screen.
  const [wrongStore, setWrongStore] = useState(false)

  function start() {
    // Mig 007 follow-up: flow re-ordered to put /when after /describe.
    // Rationale — the reporter just captured a photo and voice note
    // while still loaded on the incident. Asking "when did it happen?"
    // right after that beat is a natural pull-back-to-context step, vs
    // making them commit to a time before they've recalled the story.
    router.push(`/r/${store.sap_code}/photo`)
  }

  // Three CSS classes drive the staged reveal. `srl-stage` is the base
  // (hidden); `srl-stage--revealed` triggers the keyframes; per-element
  // classes carry per-element timing offsets. `--instant` forces an
  // immediate snap-on for returning visitors so they don't see the
  // entrance gestures every visit.
  const stageClass = reveal
    ? instant
      ? "srl-stage srl-stage--revealed srl-stage--instant"
      : "srl-stage srl-stage--revealed"
    : "srl-stage"

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col px-5 py-7">
      <style>{landingRevealStyles}</style>

      {/* Brand bar — designed APP icon left, manager-login key right. No
          back link (this is the root reporter screen — there's nowhere to
          go back to). */}
      <header className={`${stageClass} srl-brand flex items-center justify-between`}>
        <AppIcon
          size={40}
          className="rounded-[10px] shadow-[0_2px_6px_rgba(10,31,70,0.18)]"
        />
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
          fight transliteration norms.

          Mig 007: the store identity is the page's load-bearing
          element after the intro. SAP code is upgraded from an inline
          line-item to its own labelled row at the bottom of the card
          so a reporter can match it visually against the QR poster
          they scanned ("Store code: PNT-MUM-047"). */}
      <section
        className={`${stageClass} srl-card mt-6 rounded-lg border border-slate-200 bg-white p-5`}
      >
        <div className="flex items-center gap-2 text-slate-600">
          <Store className="h-5 w-5" strokeWidth={1.8} aria-hidden />
          <span className="text-[11px] font-bold uppercase tracking-wide">
            {store.brand}
          </span>
        </div>
        <h1 className="mt-2 font-display text-[24px] font-bold leading-8 text-slate-900">
          {store.name}
        </h1>
        <p className="mt-1 flex items-center gap-1.5 text-[13px] text-slate-600">
          <MapPin className="h-3.5 w-3.5 text-slate-400" strokeWidth={1.8} aria-hidden />
          {store.city}, {store.state}
        </p>
        <dl className="mt-3 flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <dt className="text-[10.5px] font-bold uppercase tracking-wide text-slate-500">
            Store code
          </dt>
          <dd className="font-mono text-[13.5px] font-semibold text-slate-900">
            {store.sap_code}
          </dd>
        </dl>
      </section>

      {/* Confirmation prompt. Replaces the prior "See something? Say
          something" lede + plain Start CTA. Asks the reporter to
          confirm they're on the right store before proceeding —
          single most common pilot-test mishap was reporters scanning
          a neighbouring store's poster by mistake and submitting to
          the wrong manager. Two-button layout keeps the right answer
          obvious. */}
      <section className={`${stageClass} srl-lede mt-7 flex-1`}>
        <h2 className="font-display text-[20px] font-semibold leading-tight text-slate-900">
          Is this your store?
        </h2>
        <p className="mt-2 text-[13.5px] leading-5 text-slate-600">
          Check the store code above matches the QR poster you scanned.
          If it does, tap Yes to start reporting.
        </p>

        {wrongStore ? (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-[13px] leading-5 text-amber-900"
          >
            <p className="font-semibold">Scan the right poster.</p>
            <p className="mt-1">
              Find the QR poster inside <strong>your</strong> store&apos;s
              back office and scan that one. If you&apos;re sure the
              poster is wrong, ask your manager which store this is for —
              the SAP code on the poster should match the one shown
              above.
            </p>
            <button
              type="button"
              onClick={() => setWrongStore(false)}
              className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-indigo-700 hover:text-indigo-900"
            >
              Back
            </button>
          </div>
        ) : null}
      </section>

      <div className={`${stageClass} srl-cta pt-4`}>
        {!wrongStore ? (
          <>
            <button
              type="button"
              onClick={start}
              className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 px-6 text-[15px] font-medium text-white transition hover:bg-indigo-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/40"
            >
              Yes — start reporting
              <ArrowRight className="h-4 w-4" strokeWidth={1.8} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setWrongStore(true)}
              className="mx-auto mt-2 block px-3 py-1.5 text-[12.5px] font-medium text-slate-600 hover:text-slate-900"
            >
              No, this isn&apos;t my store
            </button>
          </>
        ) : null}
        <p className="mx-auto mt-3 text-center text-[11px] uppercase tracking-wide text-slate-400">
          Anonymous to your store manager
        </p>
      </div>

      {/* Cinematic first-visit intro overlay. Paints over this entire
          page until the reporter taps "Get started"; firing
          `sr:intro-dismissed` lifts the page underneath via the
          reveal state above. Returning visitors (sr_intro_seen=1) skip
          the intro entirely and the landing renders with reveal=true
          + instant=true on first paint. */}
      <ReporterIntro sap_code={store.sap_code} />
    </main>
  )
}

/* Co-located reveal styles. Co-locating mirrors the intro's pattern —
 * the entry animation is co-owned with the intro's exit, so keeping
 * both stylesheets near their JSX makes the choreography easier to
 * read and tune. */
const landingRevealStyles = /* css */ `
  /* Base: hidden until reveal flips. translate3d nudges trigger the GPU
     so the entrance is buttery on Android WebView. */
  .srl-stage {
    opacity: 0;
  }
  .srl-card.srl-stage {
    transform: translate3d(0, 10px, 0) scale(0.96);
    box-shadow: 0 0 0 rgba(10, 31, 70, 0);
  }
  .srl-brand.srl-stage,
  .srl-lede.srl-stage,
  .srl-cta.srl-stage {
    transform: translate3d(0, 6px, 0);
  }

  /* Revealed: cascade — brand, card, lede, CTA — over ~0.95s after the
     intro lifts. Staggers chosen so the store card lands first (it's
     the user-asked focal point) and the lede + CTA follow. */
  .srl-stage--revealed.srl-brand {
    animation: srl-fadeUp 0.4s cubic-bezier(0.2, 0, 0, 1) 0.00s forwards;
  }
  .srl-stage--revealed.srl-card {
    animation: srl-card-in 0.55s cubic-bezier(0.2, 0, 0, 1) 0.10s forwards;
  }
  .srl-stage--revealed.srl-lede {
    animation: srl-fadeUp 0.5s cubic-bezier(0.2, 0, 0, 1) 0.35s forwards;
  }
  .srl-stage--revealed.srl-cta {
    animation: srl-fadeUp 0.5s cubic-bezier(0.2, 0, 0, 1) 0.55s forwards;
  }

  /* Instant: no animation, just show. Used for returning visitors so
     they don't see the entrance on every refresh. */
  .srl-stage--instant {
    animation: none !important;
    opacity: 1 !important;
    transform: none !important;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  }
  /* The card has a baseline shadow it should land at — explicit so the
     instant path matches the post-animation state. */
  .srl-card.srl-stage--instant {
    box-shadow: 0 4px 14px rgba(10, 31, 70, 0.06);
  }

  @keyframes srl-fadeUp {
    from {
      opacity: 0;
      transform: translate3d(0, 6px, 0);
    }
    to {
      opacity: 1;
      transform: translate3d(0, 0, 0);
    }
  }
  @keyframes srl-card-in {
    from {
      opacity: 0;
      transform: translate3d(0, 10px, 0) scale(0.96);
      box-shadow: 0 0 0 rgba(10, 31, 70, 0);
    }
    60% {
      opacity: 1;
      transform: translate3d(0, 0, 0) scale(1.005);
      box-shadow: 0 6px 18px rgba(10, 31, 70, 0.08);
    }
    to {
      opacity: 1;
      transform: translate3d(0, 0, 0) scale(1);
      box-shadow: 0 4px 14px rgba(10, 31, 70, 0.06);
    }
  }

  /* prefers-reduced-motion — skip the cascade. The card and copy snap
     on immediately when the intro lifts. Mirrors the intro's own
     reduced-motion handling. */
  @media (prefers-reduced-motion: reduce) {
    .srl-stage,
    .srl-stage--revealed.srl-brand,
    .srl-stage--revealed.srl-card,
    .srl-stage--revealed.srl-lede,
    .srl-stage--revealed.srl-cta {
      animation: none !important;
      opacity: 1 !important;
      transform: none !important;
    }
    .srl-card.srl-stage--revealed,
    .srl-card.srl-stage--instant {
      box-shadow: 0 4px 14px rgba(10, 31, 70, 0.06);
    }
  }
`
