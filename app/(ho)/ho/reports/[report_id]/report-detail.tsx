"use client"

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Ban,
  Check,
  ChevronDown,
  Gauge,
  ImageOff,
  Image as ImageIcon,
  Loader2,
  Mic,
  Pause,
  Play,
  Phone,
  RotateCcw,
  User,
  X,
} from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react"
import { CATEGORIES } from "@/lib/categories"
import { isSeverityFloor } from "@/lib/category-derive"
import type { ReportCategory } from "@/lib/reporter-state"

const FULL_VIEW_SHORTCUT_HINT =
  "J / K navigate · A approve · R return · V void · Esc back"

// Compact SR-id format check used when parsing the ?sibs= URL param. Only
// genuinely-SR-shaped tokens are accepted so a malicious URL can't redirect
// the J/K nav to an arbitrary path.
const SR_ID_RE = /^SR-\d{6,}$/

/**
 * HO-side report detail. Structurally mirrors the manager view so the codebase
 * stays coherent (same audio player, same lightbox pattern, same status badge
 * styling), but with three differences:
 *
 *  1. Reporter identity (name + phone) is rendered in the Context block. HO
 *     is the only audience that ever sees these fields.
 *  2. The resolution history includes any HO-return comments threaded between
 *     attempts — so HO sees exactly what they asked the manager to rework.
 *  3. The bottom action bar swaps the manager's Acknowledge / Resolve CTA for
 *     Approve / Return / Void, with modals gating the two destructive flows.
 */

type Store = {
  sap_code: string
  name: string
  brand: string
  city: string
  state: string
}

type Report = {
  id: string
  store_code: string
  // Mig 007: type + category are nullable until HO confirms.
  type: "observation" | "incident" | null
  category: string | null
  suggested_category: string | null
  confidence: number | null
  category_source: "ai" | "ho-confirmed" | "ho-corrected" | null
  status:
    | "new"
    | "in_progress"
    | "awaiting_ho"
    | "returned"
    | "closed"
    | "voided"
  description: string | null
  transcript: string | null
  transcript_error: string | null
  photo_url: string
  audio_url: string | null
  incident_datetime: string
  reported_at: string
  acknowledged_at: string | null
  reporter_name: string | null
  reporter_phone: string | null
}

type Resolution = {
  id: string
  attempt_number: number
  note: string
  photo_url: string | null
  resolved_at: string
}

type HoActionEntry = {
  id: string
  action: "approve" | "return" | "void"
  rejection_reason: string | null
  acted_at: string
  actor_display_name: string | null
}

type Viewer = { display_name: string }

export type BackTarget = "overview" | "action" | "reports"

const BACK_TARGETS: Record<BackTarget, { href: string; label: string }> = {
  overview: { href: "/ho", label: "Back to overview" },
  action: { href: "/ho/action", label: "Back to Action queue" },
  reports: { href: "/ho/all-reports", label: "Back to Reports" },
}

export function HoReportDetail({
  store,
  report: initialReport,
  resolutions,
  history,
  viewer,
  backTarget = "overview",
}: {
  store: Store
  report: Report
  resolutions: Resolution[]
  history: HoActionEntry[]
  viewer: Viewer
  backTarget?: BackTarget
}) {
  const back = BACK_TARGETS[backTarget] ?? BACK_TARGETS.overview
  const router = useRouter()
  const searchParams = useSearchParams()
  // The list of sibling report ids the caller stashed in ?sibs=. Used to
  // walk J/K across the same filtered/sorted set the user was looking at
  // in /ho/all-reports. Parsed once per render, validated against SR_ID_RE.
  const siblingIds = useMemo<string[]>(() => {
    const raw = searchParams?.get("sibs")
    if (!raw) return []
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => SR_ID_RE.test(s))
  }, [searchParams])
  const currentSiblingIndex = useMemo<number>(() => {
    return siblingIds.indexOf(initialReport.id)
  }, [siblingIds, initialReport.id])
  const [report, setReport] = useState<Report>(initialReport)
  const [busy, setBusy] = useState<null | "approve" | "return" | "void">(null)
  const [error, setError] = useState<string | null>(null)
  const [photoOpen, setPhotoOpen] = useState<string | null>(null)
  const [returnOpen, setReturnOpen] = useState(false)
  const [voidOpen, setVoidOpen] = useState(false)
  // Mig 007 seamless (2026-05-27): HO can override the AI's suggested
  // category inline while approving. State lives here so submitAction
  // can bundle category+via into the same POST as the status flip.
  const [categoryOverride, setCategoryOverride] =
    useState<ReportCategory | null>(null)

  const suggestedCat = CATEGORIES.find(
    (c) => c.key === report.suggested_category,
  )
  // The category section is interactive whenever HO hasn't sealed a
  // category yet (category_source is null or 'ai'). Once it's
  // ho-confirmed / ho-corrected the row reads as final.
  const categoryNeedsHo =
    !report.category || report.category_source === "ai"
  // Effective category for the in-flight approve: the override HO
  // picked, else the AI's suggestion, else null (must pick).
  const sealedCategory = (report.category ?? null) as ReportCategory | null
  const suggestedCategory = (report.suggested_category ?? null) as
    | ReportCategory
    | null
  const effectiveCategory: ReportCategory | null =
    sealedCategory ?? categoryOverride ?? suggestedCategory
  const effectiveCat = CATEGORIES.find((c) => c.key === effectiveCategory)
  const effectiveFloor = effectiveCategory
    ? isSeverityFloor(effectiveCategory)
    : false
  // Tone follows the effective category's kind so the header reads
  // amber-for-incident even before HO seals the category. Defaults to
  // slate (observation) until anything resolves.
  const effectiveIsIncident = effectiveCat?.kind === "incident"
  const tone: "slate" | "amber" = effectiveIsIncident ? "amber" : "slate"
  // Why approve is blocked, when it is. Surfaces inline + on the
  // disabled button's title so HO sees the reason without hover.
  const approveBlockedReason: string | null =
    report.status === "awaiting_ho" && categoryNeedsHo
      ? !effectiveCategory
        ? "Pick a category from the dropdown before approving."
        : effectiveFloor && !categoryOverride
          ? "High-severity — confirm via the dropdown so the audit trail records an explicit click."
          : null
      : null

  // Keyboard shortcuts on the full-page view.
  //   J / ArrowUp   → previous report in the sibling list (if ?sibs= present)
  //   K / ArrowDown → next report in the sibling list (if ?sibs= present)
  //   A             → approve   (awaiting_ho only)
  //   R             → return    (awaiting_ho only)
  //   V             → void      (any non-terminal status)
  //   Esc           → navigate back to the inferred origin (?from= hint)
  // Inputs / textareas / modals don't trap. J/K do nothing when sibs is
  // empty so the keymap stays consistent even for direct-URL visits.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return
      }
      if (returnOpen || voidOpen || photoOpen) return
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key

      // J/K navigation across siblings. Preserves the existing search
      // params (so ?from=reports&sibs=... carries to the next page),
      // uses router.replace so back-button still returns the user to
      // the originating list rather than walking back through every
      // J/K hop they made.
      if ((key === "j" || key === "ArrowUp") && currentSiblingIndex > 0) {
        e.preventDefault()
        const prevId = siblingIds[currentSiblingIndex - 1]
        const qs = searchParams?.toString() ?? ""
        router.replace(`/ho/reports/${prevId}${qs ? `?${qs}` : ""}`)
        return
      }
      if (
        (key === "k" || key === "ArrowDown") &&
        currentSiblingIndex >= 0 &&
        currentSiblingIndex < siblingIds.length - 1
      ) {
        e.preventDefault()
        const nextId = siblingIds[currentSiblingIndex + 1]
        const qs = searchParams?.toString() ?? ""
        router.replace(`/ho/reports/${nextId}${qs ? `?${qs}` : ""}`)
        return
      }

      if (
        key === "a" &&
        report.status === "awaiting_ho" &&
        approveBlockedReason === null
      ) {
        e.preventDefault()
        void submitAction("approve")
      } else if (key === "r" && report.status === "awaiting_ho") {
        e.preventDefault()
        setReturnOpen(true)
      } else if (
        key === "v" &&
        report.status !== "closed" &&
        report.status !== "voided"
      ) {
        e.preventDefault()
        setVoidOpen(true)
      } else if (key === "Escape") {
        e.preventDefault()
        router.push(back.href)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // submitAction depends on this closure but is stable enough; we only need
    // to re-bind when status/modal flags / siblings change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    report.status,
    returnOpen,
    voidOpen,
    photoOpen,
    back.href,
    siblingIds,
    currentSiblingIndex,
    searchParams,
    categoryNeedsHo,
    approveBlockedReason,
  ])

  async function submitAction(
    action: "approve" | "return" | "void",
    comment?: string,
  ) {
    // Mig 007 seamless (2026-05-27): approving an un-sealed report
    // bundles category + via in the same POST so HO seals + closes
    // in one click. Mirrors the rules in /api/ho-actions:
    //   - finalCategory = manual override (if any) or AI's suggestion.
    //   - via = 'corrected' whenever HO picked from the dropdown OR
    //     the final category is severity-floor; otherwise 'confirmed'.
    //   - Severity floor (LTI / Fatality) without an explicit
    //     dropdown pick is blocked client-side via approveBlockedReason,
    //     so this defensive branch should never fire in practice.
    let categoryPatch:
      | { category: ReportCategory; category_via: "confirmed" | "corrected" }
      | null = null
    if (action === "approve" && !report.category) {
      const final: ReportCategory | null =
        categoryOverride ?? suggestedCategory
      if (!final) {
        setError("Pick a category from the dropdown before approving.")
        return
      }
      const floor = isSeverityFloor(final)
      if (floor && !categoryOverride) {
        setError(
          "High-severity categories must be confirmed via the dropdown so the audit trail records an explicit click.",
        )
        return
      }
      const matchesSuggested =
        categoryOverride === null
          ? true
          : suggestedCategory !== null &&
            categoryOverride === suggestedCategory
      const via: "confirmed" | "corrected" =
        floor || !matchesSuggested ? "corrected" : "confirmed"
      categoryPatch = { category: final, category_via: via }
    }
    setBusy(action)
    setError(null)
    try {
      const res = await fetch("/api/ho-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_id: report.id,
          action,
          comment: comment ?? undefined,
          ...(categoryPatch ?? {}),
        }),
      })
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean
        status?: Report["status"]
        error?: string
      } | null

      if (res.status === 401) {
        router.replace(
          `/ho/login?next=${encodeURIComponent(`/ho/reports/${report.id}`)}`,
        )
        return
      }
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error || `HTTP ${res.status}`)
      }

      setReport((prev) => ({ ...prev, status: body.status ?? prev.status }))
      setReturnOpen(false)
      setVoidOpen(false)
      // Pull fresh history + latest-attempt metadata.
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't complete that.")
    } finally {
      setBusy(null)
    }
  }

  // Build a threaded timeline: resolutions interleaved with HO return actions,
  // in chronological order. Approve / void history rows are *not* interleaved
  // above the bar — they're only relevant in the outcome, and the status badge
  // already reflects that outcome.
  const thread = buildThread(resolutions, history)

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link
          href={back.href}
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-700 hover:text-indigo-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {back.label}
        </Link>
        <p className="text-[11px] text-slate-400 tabular-nums hidden md:block">
          {FULL_VIEW_SHORTCUT_HINT}
        </p>
      </div>

      {/* Header */}
      <div className="mt-5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
          {store.brand} · {store.name} · {store.city} ·{" "}
          <span className="font-mono">{store.sap_code}</span>
        </p>
        <div className="mt-1 flex items-center gap-2">
          <StatusBadge status={report.status} />
          <span className="text-xs text-slate-400">{report.id}</span>
        </div>
        <h1
          className={`mt-2 font-display text-2xl font-bold leading-8 ${
            effectiveCat
              ? tone === "slate"
                ? "text-slate-900"
                : "text-amber-900"
              : "text-slate-900"
          }`}
        >
          {effectiveCat ? (
            <>
              {effectiveCat.label}
              {effectiveCat.acronym ? (
                <span className="ml-1 text-base font-semibold text-slate-400">
                  ({effectiveCat.acronym})
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-slate-700">Category pending review</span>
          )}
        </h1>
        {effectiveCat?.blurb ? (
          <p className="mt-1 text-sm leading-5 text-slate-600">
            {effectiveCat.blurb}
          </p>
        ) : (
          <p className="mt-1 text-sm leading-5 text-slate-600">
            No transcript yet — pick a category before approving.
          </p>
        )}
      </div>

      {/* Mig 007 seamless: the standalone Category block only renders
          when there's NO resolution to approve yet (status = new /
          in_progress / returned). For awaiting_ho rows, the category
          picker is folded into the action bar at the bottom so HO
          can confirm category + approve in a single click. */}
      {categoryNeedsHo && report.status !== "awaiting_ho" ? (
        <CategoryBlock
          report={report}
          suggestedCat={suggestedCat}
          onUpdate={(patch) =>
            setReport((prev) => ({
              ...prev,
              ...patch,
            }))
          }
        />
      ) : null}

      {/* Before / After comparison ---------------------------------------- */}
      {/* Two cards side-by-side on md+ screens, stacked on mobile. The left
          card is what the reporter saw; the right card is the latest manager
          fix attempt. If no resolution has been filed yet we render an empty
          placeholder on the right so the alignment doesn't shift later. */}
      <ComparisonSection
        report={report}
        latestResolution={resolutions[resolutions.length - 1] ?? null}
        latestAttemptCount={resolutions.length}
        onExpand={(url) => setPhotoOpen(url)}
      />

      {/* Two-column on desktop: voice + transcript on the left, context on the right. */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Evidence column */}
        <div className="lg:col-span-3 space-y-4">
          {report.audio_url ? (
            <section aria-label="Voice note">
              <AudioPlayer url={report.audio_url} />
            </section>
          ) : null}

          {/* Transcript / description */}
          <section aria-label="What the reporter said">
            <h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <Mic className="h-3 w-3" aria-hidden />
              {report.transcript ? "Transcript (English)" : "Reporter note"}
            </h2>
            <div className="mt-2 rounded-xl border border-stone-200 bg-stone-100 p-4">
              {report.transcript ? (
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">
                  {report.transcript}
                </p>
              ) : report.description ? (
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">
                  {report.description}
                </p>
              ) : report.transcript_error ? (
                <div className="text-sm leading-5 text-orange-700">
                  <p>
                    Transcript couldn&apos;t be generated automatically. Play
                    the voice note above to hear what the reporter said.
                  </p>
                  <p className="mt-1 text-xs text-orange-700/80">
                    Reason: {report.transcript_error}
                  </p>
                </div>
              ) : report.audio_url ? (
                <p className="text-sm italic leading-5 text-slate-500">
                  Transcript is still being prepared.
                </p>
              ) : (
                <p className="text-sm italic leading-5 text-slate-500">
                  No description was added.
                </p>
              )}
            </div>
          </section>
        </div>

        {/* Context column */}
        <div className="lg:col-span-2 space-y-4">
          <section aria-label="Context" className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <h2 className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 border-b border-slate-100 bg-slate-50">
              Context
            </h2>
            <dl className="divide-y divide-slate-100">
              <Row label="When it happened" value={formatDateTime(report.incident_datetime)} />
              <Row label="Filed" value={formatRelative(report.reported_at)} />
              {report.acknowledged_at ? (
                <Row
                  label="Manager acknowledged"
                  value={formatRelative(report.acknowledged_at)}
                />
              ) : null}
            </dl>
          </section>

          {/* Reporter identity — HO only */}
          <section
            aria-label="Reporter identity"
            className="rounded-xl border border-sky-200 bg-sky-50/60 overflow-hidden"
          >
            <h2 className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-sky-800 border-b border-sky-100 bg-sky-50 flex items-center gap-1.5">
              <User className="h-3 w-3" aria-hidden />
              Reporter
            </h2>
            <div className="px-4 py-3 space-y-1">
              <p className="text-sm font-medium text-slate-900">
                {report.reporter_name ?? "—"}
              </p>
              {report.reporter_phone ? (
                <a
                  href={`tel:${report.reporter_phone}`}
                  className="inline-flex items-center gap-1.5 text-sm text-sky-800 hover:text-sky-900"
                >
                  <Phone className="h-3.5 w-3.5" aria-hidden />
                  {report.reporter_phone}
                </a>
              ) : null}
              <p className="text-[11px] text-sky-700 pt-1">
                Visible only to Head Office. Do not share with store staff.
              </p>
            </div>
          </section>
        </div>
      </div>

      {/* Resolution thread */}
      <section className="mt-8" aria-label="Resolution thread">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">
          Resolution thread
        </h2>
        {thread.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-500 text-center">
            No resolution has been filed yet.
          </p>
        ) : (
          <ol className="space-y-3">
            {thread.map((entry) => {
              if (entry.kind === "resolution") {
                return (
                  <li
                    key={`res-${entry.id}`}
                    className="rounded-xl border border-slate-200 bg-white p-4"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        Manager · Attempt {entry.attempt_number}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {formatRelative(entry.at)}
                      </p>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-slate-800">
                      {entry.note}
                    </p>
                    {entry.photo_url ? (
                      <button
                        type="button"
                        onClick={() => setPhotoOpen(entry.photo_url!)}
                        className="mt-2 inline-flex items-center gap-1.5 text-xs text-indigo-700 hover:text-indigo-900"
                      >
                        <ImageIcon className="h-3.5 w-3.5" aria-hidden />
                        View proof photo
                      </button>
                    ) : null}
                  </li>
                )
              }
              // HO return entry
              return (
                <li
                  key={`ret-${entry.id}`}
                  className="rounded-xl border border-orange-200 bg-orange-50 p-4"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-orange-700 inline-flex items-center gap-1.5">
                      <RotateCcw className="h-3 w-3" aria-hidden />
                      HO returned for rework
                    </p>
                    <p className="text-[11px] text-orange-600">
                      {formatRelative(entry.at)}
                    </p>
                  </div>
                  <p className="mt-1 text-sm leading-5 text-orange-900 whitespace-pre-wrap">
                    {entry.comment ?? "(No comment.)"}
                  </p>
                  {entry.actor_display_name ? (
                    <p className="mt-1 text-[11px] text-orange-700">
                      — {entry.actor_display_name}
                    </p>
                  ) : null}
                </li>
              )
            })}
          </ol>
        )}
      </section>

      {/* Action bar (sticky bottom on mobile, inline on desktop) */}
      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-4">
        {report.status === "awaiting_ho" ? (
          <>
            <p className="text-sm text-slate-700 mb-3">
              Signed in as{" "}
              <span className="font-medium text-slate-900">
                {viewer.display_name}
              </span>
              . Your decision is recorded in the audit trail.
            </p>
            {/* Mig 007 seamless: inline category picker. Renders only
                when the row is awaiting HO and the category hasn't been
                sealed yet. The picker preselects the AI's suggestion
                so HO can hit Approve directly; overriding writes to
                local state and submitAction bundles the right via on
                the POST. Severity floor (LTI/Fatality) blocks the
                single-click path until HO picks from the dropdown. */}
            {categoryNeedsHo ? (
              <div className="mb-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Category
                  </span>
                  <span className="text-sm font-medium text-slate-900">
                    {effectiveCat?.label ?? "—"}
                    {effectiveCat?.acronym ? (
                      <span className="ml-1 text-slate-500">
                        ({effectiveCat.acronym})
                      </span>
                    ) : null}
                  </span>
                  <div className="relative ml-auto">
                    <select
                      value={categoryOverride ?? ""}
                      onChange={(e) =>
                        setCategoryOverride(
                          e.target.value
                            ? (e.target.value as ReportCategory)
                            : null,
                        )
                      }
                      disabled={busy !== null}
                      aria-label="Override category"
                      className="appearance-none rounded-md border border-slate-300 bg-white pl-2.5 pr-8 h-8 text-[12.5px] text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-60"
                    >
                      <option value="">Change category…</option>
                      {CATEGORIES.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                          {c.acronym ? ` (${c.acronym})` : ""}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                      aria-hidden
                    />
                  </div>
                </div>
                {approveBlockedReason ? (
                  <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[12px] text-amber-900">
                    {approveBlockedReason}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => submitAction("approve")}
                disabled={busy !== null || approveBlockedReason !== null}
                title={approveBlockedReason ?? undefined}
                className="inline-flex items-center gap-2 rounded-md bg-teal-700 hover:bg-teal-800 active:bg-teal-900 text-white font-medium px-4 py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {busy === "approve" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Approve &amp; close
              </button>
              <button
                type="button"
                onClick={() => setReturnOpen(true)}
                disabled={busy !== null}
                className="inline-flex items-center gap-2 rounded-md bg-orange-700 hover:bg-orange-800 active:bg-orange-900 text-white font-medium px-4 py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                <RotateCcw className="h-4 w-4" />
                Return for rework
              </button>
              <button
                type="button"
                onClick={() => setVoidOpen(true)}
                disabled={busy !== null}
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium px-4 py-2 text-sm disabled:opacity-60 transition-colors ml-auto"
              >
                <Ban className="h-4 w-4" />
                Void
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-700">
                This report is currently{" "}
                <span className="font-medium text-slate-900">
                  {humanStatus(report.status)}
                </span>
                .
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {report.status === "new" || report.status === "in_progress"
                  ? "Waiting on the store manager to file a resolution."
                  : report.status === "closed"
                    ? "Nothing more to do — the report has been approved and closed."
                    : report.status === "returned"
                      ? "Waiting on the store manager to rework and resubmit."
                      : report.status === "voided"
                        ? "This report was voided. It remains on record for audit only."
                        : ""}
              </p>
            </div>
            {report.status !== "voided" && report.status !== "closed" ? (
              <button
                type="button"
                onClick={() => setVoidOpen(true)}
                disabled={busy !== null}
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium px-3 py-1.5 text-sm disabled:opacity-60 transition-colors"
              >
                <Ban className="h-4 w-4" />
                Void
              </button>
            ) : null}
          </div>
        )}
        {error ? (
          <p
            role="alert"
            className="mt-3 rounded-md bg-orange-50 border border-orange-200 px-3 py-2 text-sm text-orange-700"
          >
            {error}
          </p>
        ) : null}
      </section>

      {returnOpen ? (
        <ReasonModal
          title="Return for rework"
          description="The manager will be notified and asked to update their resolution. Please explain what needs to change."
          minLen={10}
          maxLen={300}
          submitLabel="Return report"
          submitTone="orange"
          busy={busy === "return"}
          onCancel={() => setReturnOpen(false)}
          onSubmit={(c) => submitAction("return", c)}
        />
      ) : null}

      {voidOpen ? (
        <ReasonModal
          title="Void this report"
          description="Voiding is irreversible. The report stays on record for audit, but no further action is possible. Please give a 20+ character reason."
          minLen={20}
          submitLabel="Void report"
          submitTone="slate"
          busy={busy === "void"}
          onCancel={() => setVoidOpen(false)}
          onSubmit={(c) => submitAction("void", c)}
          warning
        />
      ) : null}

      {photoOpen ? (
        <PhotoLightbox url={photoOpen} onClose={() => setPhotoOpen(null)} />
      ) : null}
    </div>
  )
}

/* ----------------------------- Thread builder ---------------------------- */

type ThreadEntry =
  | {
      kind: "resolution"
      id: string
      attempt_number: number
      note: string
      photo_url: string | null
      at: string
    }
  | {
      kind: "return"
      id: string
      comment: string | null
      actor_display_name: string | null
      at: string
    }

function buildThread(
  resolutions: Resolution[],
  history: HoActionEntry[],
): ThreadEntry[] {
  const items: ThreadEntry[] = []
  for (const r of resolutions) {
    items.push({
      kind: "resolution",
      id: r.id,
      attempt_number: r.attempt_number,
      note: r.note,
      photo_url: r.photo_url,
      at: r.resolved_at,
    })
  }
  for (const h of history) {
    if (h.action !== "return") continue
    items.push({
      kind: "return",
      id: h.id,
      comment: h.rejection_reason,
      actor_display_name: h.actor_display_name,
      at: h.acted_at,
    })
  }
  items.sort((a, b) => a.at.localeCompare(b.at))
  return items
}

/* ------------------------------ Reason modal ----------------------------- */

function ReasonModal({
  title,
  description,
  minLen,
  maxLen,
  submitLabel,
  submitTone,
  onCancel,
  onSubmit,
  busy,
  warning,
}: {
  title: string
  description: string
  minLen: number
  maxLen?: number
  submitLabel: string
  submitTone: "orange" | "slate"
  onCancel: () => void
  onSubmit: (comment: string) => void
  busy: boolean
  warning?: boolean
}) {
  const [value, setValue] = useState("")
  const trimmed = value.trim()
  const tooShort = trimmed.length < minLen
  const tooLong = maxLen !== undefined && trimmed.length > maxLen

  function handle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (tooShort || tooLong || busy) return
    onSubmit(trimmed)
  }

  const btn =
    submitTone === "orange"
      ? "bg-orange-700 hover:bg-orange-800 active:bg-orange-900"
      : "bg-slate-900 hover:bg-slate-950"

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reason-modal-title"
    >
      <form
        onSubmit={handle}
        className="bg-white rounded-xl shadow-lg border border-slate-200 w-full max-w-lg p-6"
      >
        <div className="flex items-start gap-3">
          {warning ? (
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-700 ring-1 ring-orange-100">
              <AlertTriangle className="h-5 w-5" aria-hidden />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <h3
              id="reason-modal-title"
              className="text-base font-semibold text-slate-900"
            >
              {title}
            </h3>
            <p className="mt-1 text-sm text-slate-600">{description}</p>
          </div>
        </div>

        <label
          htmlFor="reason-input"
          className="block mt-4 text-sm font-medium text-slate-800"
        >
          Reason
        </label>
        <textarea
          id="reason-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={4}
          className="mt-1.5 w-full rounded-md border border-slate-300 text-sm text-slate-900 placeholder-slate-400 p-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          placeholder={
            maxLen !== undefined
              ? `Between ${minLen} and ${maxLen} characters.`
              : `At least ${minLen} characters.`
          }
          disabled={busy}
          autoFocus
        />
        <div className="mt-1 flex justify-between text-xs">
          <span
            className={
              tooShort || tooLong ? "text-orange-700" : "text-slate-500"
            }
          >
            {trimmed.length}
            {maxLen !== undefined ? ` / ${maxLen}` : ""}
            {tooShort
              ? ` — need ${minLen - trimmed.length} more`
              : tooLong
                ? ` — ${trimmed.length - maxLen!} too many`
                : ""}
          </span>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-md disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={tooShort || tooLong || busy}
            className={`inline-flex items-center gap-2 rounded-md text-white font-medium px-4 py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed transition-colors ${btn}`}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  )
}

/* ------------------------ Before/After comparison ------------------------ */

function ComparisonSection({
  report,
  latestResolution,
  latestAttemptCount,
  onExpand,
}: {
  report: Report
  latestResolution: Resolution | null
  latestAttemptCount: number
  onExpand: (url: string) => void
}) {
  // Trim the reporter description to the most signal-dense field. Voice
  // transcripts win over typed descriptions because that's what the reporter
  // actually said in their own words. Once `transcript_error` is set the
  // pipeline has given up — don't keep advertising the row as "pending".
  const reporterText =
    report.transcript?.trim() ||
    report.description?.trim() ||
    (report.audio_url
      ? report.transcript_error
        ? "Voice note attached — transcript couldn't be generated."
        : "Voice note attached — transcript pending."
      : null)

  return (
    <section className="mt-6" aria-label="Before and after comparison">
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
          Before / After
        </h2>
        {latestResolution ? (
          <span className="text-[11px] text-slate-400">
            Latest of {latestAttemptCount} attempt
            {latestAttemptCount === 1 ? "" : "s"}
          </span>
        ) : (
          <span className="text-[11px] text-slate-400">
            Awaiting first resolution
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 md:gap-4 items-stretch">
        {/* Reported (left) */}
        <ComparisonCard
          tone="report"
          eyebrow="Reported"
          eyebrowSub={formatDateTime(report.incident_datetime)}
          photoUrl={report.photo_url}
          photoAlt="Reported scene"
          body={reporterText}
          bodyEmpty="No description was added."
          onExpand={onExpand}
        />

        {/* Arrow divider — visible on md+ only, where the cards sit side by side. */}
        <div className="hidden md:flex items-center justify-center text-slate-300">
          <ArrowRight className="h-5 w-5" strokeWidth={1.6} aria-hidden />
        </div>

        {/* Resolution (right) */}
        {latestResolution ? (
          <ComparisonCard
            tone="resolution"
            eyebrow={`Manager fix · attempt ${latestResolution.attempt_number}`}
            eyebrowSub={formatRelative(latestResolution.resolved_at)}
            photoUrl={latestResolution.photo_url}
            photoAlt={`Proof of fix — attempt ${latestResolution.attempt_number}`}
            body={latestResolution.note}
            bodyEmpty="No note was filed with this attempt."
            onExpand={onExpand}
          />
        ) : (
          <ComparisonEmpty />
        )}
      </div>
    </section>
  )
}

function ComparisonCard({
  tone,
  eyebrow,
  eyebrowSub,
  photoUrl,
  photoAlt,
  body,
  bodyEmpty,
  onExpand,
}: {
  tone: "report" | "resolution"
  eyebrow: string
  eyebrowSub: string
  photoUrl: string | null
  photoAlt: string
  body: string | null
  bodyEmpty: string
  onExpand: (url: string) => void
}) {
  const accent =
    tone === "report"
      ? {
          eyebrow: "text-amber-700",
          dot: "bg-amber-500",
          ring: "border-amber-200",
          bg: "bg-amber-50/40",
        }
      : {
          eyebrow: "text-teal-700",
          dot: "bg-teal-600",
          ring: "border-teal-200",
          bg: "bg-teal-50/40",
        }

  return (
    <article
      className={`flex flex-col rounded-xl border ${accent.ring} ${accent.bg} overflow-hidden`}
    >
      <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-200/60 bg-white/70">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`h-2 w-2 rounded-full ${accent.dot}`} aria-hidden />
          <p
            className={`truncate text-[11px] font-bold uppercase tracking-wide ${accent.eyebrow}`}
          >
            {eyebrow}
          </p>
        </div>
        <p className="text-[11px] text-slate-500 shrink-0">{eyebrowSub}</p>
      </header>

      <button
        type="button"
        onClick={() => photoUrl && onExpand(photoUrl)}
        className="group relative block w-full overflow-hidden bg-slate-100 focus:outline-none focus:ring-4 focus:ring-indigo-500/40"
        aria-label={`Expand ${photoAlt}`}
        disabled={!photoUrl}
      >
        <div className="relative aspect-[4/3] w-full">
          {photoUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoUrl}
                alt={photoAlt}
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.01]"
                loading="lazy"
              />
              <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-slate-900/70 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity">
                <ImageIcon className="h-3 w-3" aria-hidden />
                Expand
              </span>
            </>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-400">
              <ImageOff className="h-8 w-8" aria-hidden />
            </div>
          )}
        </div>
      </button>

      <div className="px-3 py-2.5">
        {body ? (
          <p className="whitespace-pre-wrap text-[13px] leading-5 text-slate-800 line-clamp-6">
            {body}
          </p>
        ) : (
          <p className="text-[13px] italic leading-5 text-slate-500">
            {bodyEmpty}
          </p>
        )}
      </div>
    </article>
  )
}

function ComparisonEmpty() {
  return (
    <article className="flex flex-col rounded-xl border border-dashed border-slate-300 bg-white overflow-hidden">
      <header className="flex items-center gap-2 px-3 py-2 border-b border-slate-200/60 bg-white/70">
        <span className="h-2 w-2 rounded-full bg-slate-300" aria-hidden />
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
          Manager fix · pending
        </p>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-center">
        <ImageOff className="h-7 w-7 text-slate-300" aria-hidden />
        <p className="text-[13px] text-slate-500">
          No resolution has been filed yet.
        </p>
        <p className="text-[11px] text-slate-400">
          Waiting on the store manager.
        </p>
      </div>
    </article>
  )
}

/* -------------------------- Audio player + helpers ----------------------- */
// Unchanged from the manager-side version.

function AudioPlayer({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState<1 | 1.5>(1)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    a.playbackRate = rate
  }, [rate])

  const onLoaded = useCallback(() => {
    const a = audioRef.current
    if (a && Number.isFinite(a.duration)) setDuration(a.duration)
  }, [])
  const onTime = useCallback(() => {
    const a = audioRef.current
    if (a) setCurrent(a.currentTime)
  }, [])
  const onEnded = useCallback(() => setPlaying(false), [])
  const onPlay = useCallback(() => setPlaying(true), [])
  const onPause = useCallback(() => setPlaying(false), [])
  const onErr = useCallback(() => setError("Couldn't load the voice note."), [])

  async function toggle() {
    const a = audioRef.current
    if (!a) return
    if (a.paused) {
      try {
        await a.play()
      } catch {
        setError("Couldn't start playback.")
      }
    } else {
      a.pause()
    }
  }

  const pct = duration > 0 ? Math.min(100, (current / duration) * 100) : 0

  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-indigo-700 text-white transition hover:bg-indigo-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/40"
      >
        {playing ? (
          <Pause className="h-5 w-5" />
        ) : (
          <Play className="h-5 w-5" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Mic className="h-3 w-3" aria-hidden /> Voice note
          </span>
          <span className="tabular-nums">
            {formatDuration(current)} / {formatDuration(duration)}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full bg-indigo-700 transition-[width] duration-150"
            style={{ width: `${pct}%` }}
          />
        </div>
        {error ? (
          <p className="mt-1 text-[11px] text-orange-700" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => setRate(rate === 1 ? 1.5 : 1)}
        aria-label={`Playback speed ${rate}×. Tap to toggle.`}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-indigo-500 hover:text-indigo-700"
      >
        <Gauge className="h-3.5 w-3.5" aria-hidden />
        {rate}×
      </button>

      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onLoadedMetadata={onLoaded}
        onDurationChange={onLoaded}
        onTimeUpdate={onTime}
        onEnded={onEnded}
        onPlay={onPlay}
        onPause={onPause}
        onError={onErr}
        className="hidden"
      />
    </div>
  )
}

function PhotoLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/95 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Reported photo"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close photo"
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-md hover:bg-white"
      >
        <X className="h-5 w-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Reported scene — expanded"
        className="max-h-full max-w-full rounded-xl object-contain"
      />
    </div>
  )
}

function StatusBadge({ status }: { status: Report["status"] }) {
  const map: Record<Report["status"], { label: string; classes: string }> = {
    new: {
      label: "New",
      classes: "border-slate-200 bg-slate-50 text-slate-700",
    },
    in_progress: {
      label: "Acknowledged",
      classes: "border-indigo-200 bg-indigo-50 text-indigo-700",
    },
    awaiting_ho: {
      label: "Awaiting HO",
      classes: "border-sky-200 bg-sky-50 text-sky-700",
    },
    returned: {
      label: "Returned",
      classes: "border-orange-200 bg-orange-50 text-orange-700",
    },
    closed: {
      label: "Closed",
      classes: "border-teal-200 bg-teal-50 text-teal-700",
    },
    voided: {
      label: "Voided",
      classes: "border-slate-300 bg-slate-100 text-slate-700",
    },
  }
  const m = map[status]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${m.classes}`}
    >
      {m.label}
    </span>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  )
}

function humanStatus(s: Report["status"]): string {
  switch (s) {
    case "new":
      return "new"
    case "in_progress":
      return "acknowledged by the store manager"
    case "awaiting_ho":
      return "awaiting your decision"
    case "returned":
      return "returned to the store manager"
    case "closed":
      return "closed"
    case "voided":
      return "voided"
  }
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString("en-IN", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

function formatRelative(iso: string): string {
  try {
    const t = new Date(iso).getTime()
    const diff = Math.max(0, Date.now() - t)
    const s = Math.floor(diff / 1000)
    if (s < 60) return `${s}s ago`
    const m = Math.floor(s / 60)
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    const d = Math.floor(h / 24)
    if (d < 7) return `${d}d ago`
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
    })
  } catch {
    return iso
  }
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00"
  const s = Math.floor(seconds)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, "0")}`
}

/* -------------------------- Category block (Mig 007) -------------------- */

type CategoryDefT = (typeof CATEGORIES)[number]

/**
 * AI-category block. Shown whenever HO hasn't sealed a category yet.
 *
 * Three states:
 *   1. AI suggestion present, NOT severity-floor (e.g. AI picked
 *      first_aid_case at 82%):
 *        - "Confirm category" single-button approve (turquoise) →
 *          confirm_category with via='confirmed'
 *        - Dropdown selector with all 8 options → confirm_category
 *          with via='corrected' if user picks something different,
 *          via='confirmed' if they pick the same one as AI
 *
 *   2. AI suggestion present, IS severity-floor (AI picked LTI or
 *      Fatality):
 *        - Single-button confirm is disabled with an inline
 *          explanatory note ("High-severity category — confirm via
 *          the dropdown so the audit trail records an explicit click")
 *        - Dropdown is the only path. Selecting LTI / Fatality via the
 *          dropdown is always categorised as 'corrected' regardless of
 *          whether it matches AI, because the rule cares about the
 *          UI path taken, not the agreement.
 *
 *   3. No AI suggestion (suggested_category is null — usually means
 *      the report has no voice note or the classifier failed):
 *        - No "Confirm" button, no AI line
 *        - Dropdown is the only path; selecting any value is
 *          'corrected' (there's no AI pick to confirm)
 */
function CategoryBlock({
  report,
  suggestedCat,
  onUpdate,
}: {
  report: Report
  suggestedCat: CategoryDefT | undefined
  onUpdate: (patch: Partial<Report>) => void
}) {
  const [picked, setPicked] = useState<ReportCategory | "">(
    (suggestedCat?.key as ReportCategory) ?? "",
  )
  const [busy, setBusy] = useState<null | "confirm" | "apply">(null)
  const [err, setErr] = useState<string | null>(null)

  const aiBlocked = suggestedCat ? isSeverityFloor(suggestedCat.key) : false
  const pickIsFloor =
    picked && isSeverityFloor(picked as ReportCategory)
  const pickedIsSameAsAi = suggestedCat?.key === picked

  async function send(category: ReportCategory, via: "confirmed" | "corrected") {
    setBusy(via === "confirmed" ? "confirm" : "apply")
    setErr(null)
    try {
      const res = await fetch("/api/ho-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_id: report.id,
          action: "confirm_category",
          category,
          category_via: via,
        }),
      })
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean
        category?: ReportCategory
        type?: "observation" | "incident"
        category_source?: Report["category_source"]
        error?: string
      } | null
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error || `HTTP ${res.status}`)
      }
      onUpdate({
        category: body.category ?? category,
        type: body.type ?? null,
        category_source: body.category_source ?? null,
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't set the category.")
    } finally {
      setBusy(null)
    }
  }

  function onConfirmAi() {
    if (!suggestedCat || aiBlocked) return
    void send(suggestedCat.key, "confirmed")
  }

  function onApply() {
    if (!picked) return
    // Selecting via the dropdown is 'corrected' unless the user
    // happened to land on the AI's pick — in which case we record it
    // as 'confirmed' so the audit trail still says "HO agreed".
    // EXCEPTION: severity-floor picks are always 'corrected' because
    // the rule cares about the UI path, not agreement.
    const via: "confirmed" | "corrected" =
      pickedIsSameAsAi && !pickIsFloor ? "confirmed" : "corrected"
    void send(picked as ReportCategory, via)
  }

  return (
    <section
      className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white"
      aria-label="Confirm report category"
    >
      <header className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
          Confirm the category
        </h2>
      </header>

      <div className="space-y-3 px-4 py-3">
        {/* Mig 007 seamless (2026-05-27): the category renders as just
            "the category" — no "AI suggested" eyebrow, no confidence
            score, no Sparkles icon. The audit trail in category_source
            still records ai vs ho-confirmed vs ho-corrected. This
            block only renders when the report has no resolution to
            approve yet (status = new / in_progress / returned); the
            awaiting_ho path folds the picker into the action bar. */}
        {suggestedCat ? (
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 ring-1 ring-slate-200">
              <suggestedCat.icon
                className="h-3.5 w-3.5 text-slate-700"
                strokeWidth={1.8}
                aria-hidden
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900">
                {suggestedCat.label}
                {suggestedCat.acronym ? (
                  <span className="ml-1 text-slate-500">
                    ({suggestedCat.acronym})
                  </span>
                ) : null}
              </p>
              {suggestedCat.blurb ? (
                <p className="mt-0.5 text-xs leading-5 text-slate-600">
                  {suggestedCat.blurb}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-700">
            No category set yet — pick one from the dropdown below.
          </p>
        )}

        {/* Severity floor inline note (only when the suggestion is
            LTI / Fatality — the case where the single-button confirm
            is disabled). */}
        {suggestedCat && aiBlocked ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            High-severity category — confirm via the dropdown so the audit
            trail records an explicit click.
          </p>
        ) : null}

        {/* Single-click confirm — only when there IS a suggestion
            and it isn't severity-floor. Reads as "agree with what's
            shown"; the audit trail records the via=confirmed click. */}
        {suggestedCat && !aiBlocked ? (
          <button
            type="button"
            onClick={onConfirmAi}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-md bg-teal-700 hover:bg-teal-800 active:bg-teal-900 text-white font-medium px-3.5 py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {busy === "confirm" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Confirm category
          </button>
        ) : null}

        {/* Dropdown override. Always visible — the only path for
            severity-floor cases or when there's no pre-classification. */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Or pick a different category
          </p>
          <div className="mt-1.5 flex flex-wrap items-stretch gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <select
                value={picked}
                onChange={(e) =>
                  setPicked(e.target.value as ReportCategory | "")
                }
                disabled={busy !== null}
                className="block w-full appearance-none rounded-md border border-slate-300 bg-white pl-3 pr-8 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-60"
              >
                <option value="">Select a category…</option>
                {CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                    {c.acronym ? ` (${c.acronym})` : ""}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
            </div>
            <button
              type="button"
              onClick={onApply}
              disabled={busy !== null || !picked}
              className="inline-flex items-center gap-2 rounded-md border border-indigo-700 bg-white hover:bg-indigo-50 text-indigo-700 font-medium px-3.5 py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {busy === "apply" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Set category
            </button>
          </div>
        </div>

        {err ? (
          <p
            role="alert"
            className="rounded-md bg-orange-50 border border-orange-200 px-3 py-2 text-sm text-orange-700"
          >
            {err}
          </p>
        ) : null}
      </div>
    </section>
  )
}
