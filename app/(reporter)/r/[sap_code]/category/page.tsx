"use client"

import { ArrowLeft, ArrowRight, Eye, KeyRound, TriangleAlert } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { readProfile } from "@/lib/reporter-state"

/**
 * Screen 2 — triage.
 *
 * Two big cards: "Observation" vs "Incident". The user picks which of the
 * two buckets applies, and we send them to `/r/[sap_code]/category/[kind]`
 * for the fine-grained sub-category choice. This mirrors the HTML mockup
 * the team agreed on (uploads/reporter-flow-002.html).
 *
 * Palette: Slate 600 for observations, Amber 700 for incidents — the hard
 * rule is no green / red anywhere, so the mockup's green/crimson are
 * mapped onto our tokens.
 *
 * Shield-shaped KeyRound icon top-right is the manager-login entry point.
 */

type TriageCardProps = {
  href: string
  kind: "observation" | "incident"
  title: string
  subtitle: string
  icon: typeof Eye
}

function TriageCard({ href, kind, title, subtitle, icon: Icon }: TriageCardProps) {
  const bgTint = kind === "observation" ? "bg-slate-100" : "bg-amber-100"
  const fg = kind === "observation" ? "text-slate-700" : "text-amber-700"
  const ring =
    kind === "observation"
      ? "focus:ring-slate-500/40"
      : "focus:ring-amber-500/40"

  return (
    <Link
      href={href}
      className={`group flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 text-left transition hover:border-slate-400 focus:outline-none focus:ring-4 ${ring}`}
    >
      <span
        className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full ${bgTint} ${fg}`}
        aria-hidden
      >
        <Icon className="h-7 w-7" strokeWidth={1.8} />
      </span>
      <div className="flex-1">
        <p className="font-display text-[18px] font-bold leading-6 text-slate-900">
          {title}
        </p>
        <p className="mt-1 text-[13px] leading-5 text-slate-600">{subtitle}</p>
      </div>
      <ArrowRight
        className="h-5 w-5 flex-shrink-0 text-slate-400 transition group-hover:text-slate-700"
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
  const router = useRouter()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    // Guard: must have a reporter profile to be here. If not, bounce back.
    if (!readProfile()) {
      router.replace(`/r/${params.sap_code}`)
      return
    }
    setChecked(true)
  }, [params.sap_code, router])

  if (!checked) {
    return <main className="min-h-screen bg-slate-50" aria-hidden />
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-6 py-8">
      {/* Top bar: back on the left, manager-login key on the right */}
      <div className="flex items-center justify-between">
        <Link
          href={`/r/${params.sap_code}`}
          className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-700 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.8} aria-hidden />
          Back
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
            Step 1 of 4
          </span>
          <Link
            href={`/m/${params.sap_code}`}
            aria-label="Manager login"
            title="Manager login"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-indigo-500 hover:text-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-500/40"
          >
            <KeyRound className="h-4 w-4" strokeWidth={1.8} aria-hidden />
          </Link>
        </div>
      </div>

      <h1 className="mt-6 font-display text-[28px] font-bold leading-9 text-slate-900">
        What happened?
      </h1>
      <p className="mt-1 text-[13px] leading-5 text-slate-600">
        Pick the one that best describes it.
      </p>

      <div className="mt-6 flex flex-col gap-3">
        <TriageCard
          href={`/r/${params.sap_code}/category/observation`}
          kind="observation"
          title="Observation"
          subtitle="I noticed something unsafe — no one was hurt."
          icon={Eye}
        />
        <TriageCard
          href={`/r/${params.sap_code}/category/incident`}
          kind="incident"
          title="Incident"
          subtitle="Someone was hurt, or there was a serious event."
          icon={TriangleAlert}
        />
      </div>

      <p className="mt-8 text-center text-[11px] uppercase tracking-wide text-slate-400">
        Anonymous to store manager
      </p>
    </main>
  )
}
