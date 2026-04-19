"use client"

import { ArrowLeft, ChevronRight, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { notFound, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { CATEGORIES, type CategoryDef } from "@/lib/categories"
import { readProfile, writeDraft } from "@/lib/reporter-state"

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
  onPick,
}: {
  cat: CategoryDef
  onPick: (c: CategoryDef) => void
}) {
  const Icon: LucideIcon = cat.icon

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
      aria-label={cat.label}
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
          {cat.label}
          {cat.acronym ? (
            <span className="ml-1 font-sans text-[13px] font-medium text-slate-500">
              ({cat.acronym})
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 text-[13px] leading-5 text-slate-600">
          {cat.blurb}
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
  const [checked, setChecked] = useState(false)

  if (params.kind !== "observation" && params.kind !== "incident") {
    notFound()
  }
  const kind = params.kind as Kind

  useEffect(() => {
    if (!readProfile()) {
      router.replace(`/r/${params.sap_code}`)
      return
    }
    setChecked(true)
  }, [params.sap_code, router])

  const tiles = CATEGORIES.filter((c) => c.kind === kind)

  function onPick(cat: CategoryDef) {
    writeDraft({ sap_code: params.sap_code, category: cat.key })
    router.push(`/r/${params.sap_code}/when`)
  }

  if (!checked) {
    return <main className="min-h-screen bg-slate-50" aria-hidden />
  }

  const kindLabel = kind === "observation" ? "Observation" : "Incident"
  const headingCopy =
    kind === "observation" ? "What did you notice?" : "What kind of incident?"
  const accentText =
    kind === "observation" ? "text-slate-600" : "text-amber-700"

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-6 py-8">
      <div className="flex items-center justify-between text-slate-700">
        <Link
          href={`/r/${params.sap_code}/category`}
          className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-700 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.8} aria-hidden />
          Back
        </Link>
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
          Step 2 of 4
        </span>
      </div>

      <p
        className={`mt-6 text-[11px] font-bold uppercase tracking-wide ${accentText}`}
      >
        {kindLabel}
      </p>
      <h1 className="mt-1 font-display text-[28px] font-bold leading-9 text-slate-900">
        {headingCopy}
      </h1>
      <p className="mt-1 text-[13px] leading-5 text-slate-600">
        Tap the one that best matches.
      </p>

      <section className="mt-6 flex flex-col gap-3">
        {tiles.map((c) => (
          <CategoryRow key={c.key} cat={c} onPick={onPick} />
        ))}
      </section>

      <p className="mt-8 text-center text-[11px] uppercase tracking-wide text-slate-400">
        Anonymous to store manager
      </p>
    </main>
  )
}
