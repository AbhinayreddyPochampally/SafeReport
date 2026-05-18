"use client"

import { Eye, TriangleAlert } from "lucide-react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { ReporterScreenHeader } from "@/components/reporter-chrome"
import { t, useReporterLocale } from "@/lib/reporter-i18n"

/**
 * Screen 2 — triage.
 *
 * Trimmed in May 2026 after user feedback that the previous cards
 * read "too texty" — five lines per card (icon + kind eyebrow + bold
 * tagline + italic description with emphasis + examples row) felt
 * dense for a first-time, low-literacy reporter.
 *
 * Current card shape:
 *   - Hero icon (larger, top-aligned)
 *   - Kind eyebrow (Observation / Incident, uppercase)
 *   - Bold tagline (one line, plain-language)
 *   - Examples row (italic, comma-separated cues)
 *
 * Surface is stone-100 + warm border instead of the previous
 * white-with-slate-border — gives the cards a softer, Claude-design
 * feel that pairs with the cream intro overlay and the warm Stone-
 * palette voice plate downstream.
 *
 * Palette intent:
 *   - Observation: navy (#0A1F46) icon, slate-900 tagline, slate-500
 *     examples. Cool, calm — the "I noticed something" energy.
 *   - Incident: warm orange (#EA580C) icon, amber-900 tagline,
 *     amber-700 examples. Warm, alert — the "someone's hurt" energy.
 *
 * Brand-bar, back-link and 7-dot progress all come from
 * <ReporterScreenHeader>. This screen is step 1/7.
 */

type TriageCardProps = {
  href: string
  kind: "observation" | "incident"
  kindLabel: string
  tagline: string
  examples: string
  icon: typeof Eye
}

function TriageCard({
  href,
  kind,
  kindLabel,
  tagline,
  examples,
  icon: Icon,
}: TriageCardProps) {
  // Claude Workspace theme tokens. Observation reads as cool-clay —
  // navy icon + warm-charcoal body, the "I noticed something" energy.
  // Incident reads as warm-clay — Anthropic's terracotta + amber-900
  // body, the "someone's hurt" alert energy. Card surface is warm
  // cream #F5F1EA (deeper than the page's #FAF9F5) with a sand border
  // — closer to Claude.ai's reading-room aesthetic than the previous
  // stone-100/slate stack.
  const tone =
    kind === "observation"
      ? {
          iconColor: "text-[#0A1F46]",
          kindColor: "text-[#7A736B]",
          taglineColor: "text-[#2F2D29]",
          examplesColor: "text-[#9A938A]",
          ring: "focus:ring-[#C9684C]/30",
          hoverBorder: "hover:border-[#D9CFBC]",
        }
      : {
          iconColor: "text-[#C9684C]",
          kindColor: "text-amber-700",
          taglineColor: "text-amber-900",
          examplesColor: "text-amber-700/70",
          ring: "focus:ring-amber-500/40",
          hoverBorder: "hover:border-amber-300",
        }

  return (
    <Link
      href={href}
      className={`group relative block rounded-2xl border border-[#E8E2D5] bg-[#F5F1EA] p-6 text-left transition ${tone.hoverBorder} focus:outline-none focus:ring-4 ${tone.ring}`}
    >
      <div className={`mb-3 ${tone.iconColor}`} aria-hidden>
        <Icon className="h-10 w-10" strokeWidth={1.6} />
      </div>
      <p
        className={`text-[11px] font-bold uppercase tracking-wider ${tone.kindColor}`}
      >
        {kindLabel}
      </p>
      <h3
        className={`mt-1 font-display text-[20px] font-bold leading-tight tracking-tight ${tone.taglineColor}`}
      >
        {tagline}
      </h3>
      <p className={`mt-3 text-[12.5px] italic ${tone.examplesColor}`}>
        {examples}
      </p>
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

  return (
    // Page background stays on the global slate-50 — the Claude
    // Workspace theme applies to the CARDS (warm cream + sand
    // borders + clay accents) but not the global page surface. An
    // earlier rev tinted the whole page warm and was reverted per
    // user feedback.
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

      {/* Incident first, observation second — severity-descending.
          A worker who's looking at someone who just got hurt needs
          the first card they see to be "Someone got hurt", not
          "Something looked unsafe". The previous order (observation
          first, mirrored from the original Phase 10 layout) made
          sense by report-frequency (observations are more common)
          but not by urgency-of-the-moment, which is what the
          reporter is actually weighing. */}
      <div className="mt-5 flex flex-col gap-3">
        <TriageCard
          href={`/r/${params.sap_code}/category/incident`}
          kind="incident"
          kindLabel={t(locale, "subcat.incident.kind")}
          tagline={t(locale, "triage.incident.title")}
          examples="someone hurt · a fall · a cut"
          icon={TriangleAlert}
        />
        <TriageCard
          href={`/r/${params.sap_code}/category/observation`}
          kind="observation"
          kindLabel={t(locale, "subcat.observation.kind")}
          tagline={t(locale, "triage.observation.title")}
          examples="wet floor · frayed wire · blocked exit"
          icon={Eye}
        />
      </div>

      <p className="mt-8 text-center text-[11px] uppercase tracking-wide text-slate-400">
        {t(locale, "common.anonymous_footer")}
      </p>
    </main>
  )
}
