"use client"

import { ChevronRight, type LucideIcon } from "lucide-react"
import { notFound, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { ReporterScreenHeader } from "@/components/reporter-chrome"
import {
  CATEGORIES,
  blurbFor,
  labelFor,
  type CategoryDef,
} from "@/lib/categories"
import { writeDraft } from "@/lib/reporter-state"
import { t, useReporterLocale, type Locale } from "@/lib/reporter-i18n"

/**
 * Screen 3 — sub-category.
 *
 * Vertical list of categories, one per row. Icons are large and framed in a
 * rounded-square tile on the left, with the label + short description on
 * the right. Matches the team's reference imagery (box-with-motion-lines
 * for Near Miss, bandage for FAC, mourning ribbon for Fatality, etc.).
 *
 * English-only labels — the pilot dropped Hindi/Marathi translations.
 */

function CategoryRow({
  cat,
  locale,
  onPick,
}: {
  cat: CategoryDef
  locale: Locale
  onPick: (c: CategoryDef) => void
}) {
  const Icon: LucideIcon = cat.icon
  const label = labelFor(cat, locale)
  const blurb = blurbFor(cat, locale)

  const accentText =
    cat.kind === "observation" ? "text-slate-700" : "text-amber-700"
  const accentBg =
    cat.kind === "observation" ? "bg-slate-100" : "bg-amber-100"
  const accentBorder =
    cat.kind === "observation" ? "border-slate-200" : "border-amber-200"
  const ring =
    cat.kind === "observation"
      ? "focus:ring-slate-500/40"
      : "focus:ring-amber-500/40"

  return (
    <button
      type="button"
      onClick={() => onPick(cat)}
      aria-label={label}
      className={`group flex w-full items-center gap-4 rounded-2xl border ${accentBorder} bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-md focus:outline-none focus:ring-4 ${ring}`}
    >
      {/* Icon tile — large, rounded-square, subtle accent background */}
      <span
        className={`flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl ${accentBg} ${accentText}`}
        aria-hidden
      >
        <Icon className="h-9 w-9" strokeWidth={1.75} />
      </span>

      {/* Copy stack */}
      <div className="flex-1 min-w-0">
        <p className="font-display text-[17px] font-bold leading-6 text-slate-900">
          {label}
          {cat.acronym ? (
            <span className="ml-1 font-sans text-[13px] font-medium text-slate-500">
              ({cat.acronym})
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 text-[13px] leading-5 text-slate-600">
          {blurb}
        </p>
      </div>

      <ChevronRight
        className="h-5 w-5 flex-shrink-0 text-slate-300 transition group-hover:text-slate-600"
        strokeWidth={1.8}
        aria-hidden
      />
    </button>
  )
}

type Kind = "observation" | "incident"

export default function SubCategoryPage({
  params,
}: {
  params: { sap_code: string; kind: string }
}) {
  const router = useRouter()
  const locale = useReporterLocale()
  const [checked, setChecked] = useState(false)

  if (params.kind !== "observation" && params.kind !== "incident") {
    notFound()
  }
  const kind = params.kind as Kind

  useEffect(() => {
    // Phase 10: profile no longer required to enter the flow.
    setChecked(true)
  }, [])

  const tiles = CATEGORIES.filter((c) => c.kind === kind)

  function onPick(cat: CategoryDef) {
    writeDraft({ sap_code: params.sap_code, category: cat.key })
    router.push(`/r/${params.sap_code}/when`)
  }

  if (!checked) {
    return <main className="min-h-screen bg-slate-50" aria-hidden />
  }

  const kindLabel =
    kind === "observation"
      ? t(locale, "subcat.observation.kind")
      : t(locale, "subcat.incident.kind")
  const headingCopy =
    kind === "observation"
      ? t(locale, "subcat.observation.heading")
      : t(locale, "subcat.incident.heading")
  const accentText =
    kind === "observation" ? "text-slate-600" : "text-amber-700"

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col px-5 py-7">
      <ReporterScreenHeader
        sap_code={params.sap_code}
        backHref={`/r/${params.sap_code}/category`}
        step={2}
      />

      <p
        className={`mt-5 text-[11px] font-bold uppercase tracking-wide ${accentText}`}
      >
        {kindLabel}
      </p>
      <h1 className="mt-1 font-display text-[22px] font-bold leading-tight text-slate-900">
        {headingCopy}
      </h1>
      <p className="mt-1 text-[13px] leading-5 text-slate-600">
        {t(locale, "subcat.lede")}
      </p>

      <section className="mt-5 flex flex-col gap-3">
        {tiles.map((c) => (
          <CategoryRow key={c.key} cat={c} locale={locale} onPick={onPick} />
        ))}
      </section>

      <p className="mt-8 text-center text-[11px] uppercase tracking-wide text-slate-400">
        {t(locale, "common.anonymous_footer")}
      </p>
    </main>
  )
}
