"use client"

import { ArrowRight, Eye, TriangleAlert } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { ReporterScreenHeader } from "@/components/reporter-chrome"
import { t, useReporterLocale } from "@/lib/reporter-i18n"

/**
 * Screen 2 — triage.
 *
 * Two cards: "Something looked unsafe" (observation) vs "Someone got hurt"
 * (incident). Each card is built to mockup spec (reporter_flow_v14):
 *   - icon glyph row
 *   - "Observation" / "Incident" kind eyebrow (uppercase, tone-coloured)
 *   - bold tagline ("Could go wrong" / "Did go wrong")
 *   - italic description with the differentiating verb
 *   - examples row (lowercase, comma-separated cues)
 *
 * The flat horizontal-row style this replaced was visually thin — first
 * pilot tests showed reporters confused which card meant what. The card
 * spec from the mockup gives both cards much more weight and visible
 * differentiation.
 *
 * Palette: Slate 900/600 for observations, Amber 900/700 for incidents
 * — the hard "no green/no red" rule.
 *
 * Brand-bar, back-link and 7-dot progress all come from
 * <ReporterScreenHeader>. This screen is step 1/7.
 */

type TriageCardProps = {
  href: string
  kind: "observation" | "incident"
  kindLabel: string
  tagline: string
  descriptionPrefix: string
  descriptionEmphasis: string
  descriptionSuffix: string
  examples: string
  icon: typeof Eye
}

function TriageCard({
  href,
  kind,
  kindLabel,
  tagline,
  descriptionPrefix,
  descriptionEmphasis,
  descriptionSuffix,
  examples,
  icon: Icon,
}: TriageCardProps) {
  const kindColor =
    kind === "observation" ? "text-slate-600" : "text-amber-700"
  const taglineColor =
    kind === "observation" ? "text-slate-900" : "text-amber-900"
  const iconColor =
    kind === "observation" ? "text-slate-700" : "text-amber-700"
  const focusRing =
    kind === "observation"
      ? "focus:ring-slate-500/40"
      : "focus:ring-amber-500/40"

  return (
    <Link
      href={href}
      className={`group relative block rounded-xl border border-slate-200 bg-white p-5 text-left transition hover:border-slate-400 focus:outline-none focus:ring-4 ${focusRing}`}
    >
      <div className={`mb-2.5 ${iconColor}`} aria-hidden>
        <Icon className="h-8 w-8" strokeWidth={1.5} />
      </div>
      <p
        className={`mb-1.5 text-[11px] font-bold uppercase tracking-wider ${kindColor}`}
      >
        {kindLabel}
      </p>
      <h3
        className={`font-display text-[16px] font-medium leading-snug ${taglineColor}`}
      >
        {tagline}
      </h3>
      <p className="mt-1.5 text-[13px] leading-snug text-slate-600">
        {descriptionPrefix}
        <em className="font-medium not-italic text-slate-800">
          {descriptionEmphasis}
        </em>
        {descriptionSuffix}
      </p>
      <p className="mt-2.5 text-[12.5px] italic text-slate-500">
        {examples}
      </p>
      <ArrowRight
        className="absolute right-4 top-4 h-4 w-4 text-slate-300 transition group-hover:text-slate-600"
        strokeWidth={1.8}
        aria-hidden
      />
    </Link>
  )
}

export default function TriagePage({
  params,
}: {
  params: { sap_code: string }
}) {
  const locale = useReporterLocale()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    // Phase 10 facelift: profile is collected at /identity (after evidence),
    // not at the landing. So /category no longer requires a profile to enter.
    setChecked(true)
  }, [])

  if (!checked) {
    return <main className="min-h-screen bg-slate-50" aria-hidden />
  }

  // Plain-English copy in 5 locales is held in lib/reporter-i18n.ts. The
  // mockup-spec examples row + italic emphasis is composed here so it
  // doesn't need new translation keys for the punctuation pieces.
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col px-5 py-7">
      <ReporterScreenHeader
        sap_code={params.sap_code}
        backHref={`/r/${params.sap_code}`}
        step={1}
      />

      <h1 className="mt-5 font-display text-[22px] font-bold leading-tight text-slate-900">
        {t(locale, "triage.title")}
      </h1>
      <p className="mt-1 text-[13px] leading-5 text-slate-600">
        {t(locale, "triage.lede")}
      </p>

      <div className="mt-5 flex flex-col gap-3">
        <TriageCard
          href={`/r/${params.sap_code}/category/observation`}
          kind="observation"
          kindLabel={t(locale, "subcat.observation.kind")}
          tagline={t(locale, "triage.observation.title")}
          descriptionPrefix=""
          descriptionEmphasis={t(locale, "triage.observation.title")}
          descriptionSuffix={` — ${t(locale, "triage.observation.subtitle")}`}
          examples="wet floor · frayed wire · blocked exit · near miss"
          icon={Eye}
        />
        <TriageCard
          href={`/r/${params.sap_code}/category/incident`}
          kind="incident"
          kindLabel={t(locale, "subcat.incident.kind")}
          tagline={t(locale, "triage.incident.title")}
          descriptionPrefix=""
          descriptionEmphasis={t(locale, "triage.incident.title")}
          descriptionSuffix={` — ${t(locale, "triage.incident.subtitle")}`}
          examples="someone hurt · fall · cut · equipment damage"
          icon={TriangleAlert}
        />
      </div>

      <p className="mt-8 text-center text-[11px] uppercase tracking-wide text-slate-400">
        {t(locale, "common.anonymous_footer")}
      </p>
    </main>
  )
}
