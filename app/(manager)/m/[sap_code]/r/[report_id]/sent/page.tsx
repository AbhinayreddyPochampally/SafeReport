import { notFound, redirect } from "next/navigation"
import { ArrowLeft, Send } from "lucide-react"
import Link from "next/link"
import { AppIcon } from "@/components/app-icon"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getManagerSession } from "@/lib/manager-auth"

/**
 * Manager post-submit confirmation — /m/[sap]/r/[id]/sent.
 *
 * Lands here after the manager submits a fresh resolution or a rework.
 * Shows:
 *  - Sky-700 send glyph (signals "sent to Head Office", not "closed")
 *  - SR-NNNNNN + Awaiting HO badge
 *  - "Your resolution is with Head Office" reassurance message
 *  - "Back to inbox" CTA (primary), "Open this report" link (secondary)
 *
 * Resolve form navigates here on successful POST. Notification permission
 * + install asks are handled by ManagerOnboarding on first inbox visit,
 * so this screen stays focused on the single "I did the work, what now?"
 * question.
 *
 * Server-side guards:
 *  - Auth: redirect to /m/[sap] login if no session
 *  - Existence: 404 if the report doesn't exist or doesn't belong to this
 *    store. Status check is loose — we accept awaiting_ho but also
 *    new/in_progress/closed/returned in case the manager refreshes the
 *    page after HO has acted; the screen is still informative for them.
 */
export default async function ManagerPostSubmitPage({
  params,
}: {
  params: { sap_code: string; report_id: string }
}) {
  const session = await getManagerSession(params.sap_code)
  if (!session) redirect(`/m/${params.sap_code}`)

  const admin = createSupabaseAdminClient()
  const { data, error } = await admin
    .from("reports")
    .select("id, sap_code, status")
    .eq("id", params.report_id)
    .eq("sap_code", params.sap_code)
    .maybeSingle<{ id: string; sap_code: string; status: string }>()
  if (error || !data) notFound()

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col px-5 pb-7 pt-6">
      {/* Designed APP icon top-left — persistent identity */}
      <header className="flex items-center justify-between">
        <AppIcon
          size={40}
          className="rounded-[10px] shadow-[0_2px_6px_rgba(10,31,70,0.18)]"
        />
      </header>

      <div className="mx-auto flex max-w-sm flex-1 flex-col items-center justify-center text-center">
        {/* Send glyph in sky-100 circle — "in transit" feeling, not "closed" */}
        <div
          aria-hidden
          className="flex h-20 w-20 items-center justify-center rounded-full bg-sky-100 text-sky-700"
        >
          <Send className="h-9 w-9" strokeWidth={1.8} />
        </div>

        <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
          Sent to Head Office
        </p>
        <h1 className="mt-1.5 font-display text-[30px] font-bold tracking-tight text-slate-900">
          {data.id}
        </h1>
        <div className="mt-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-sky-700">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-sky-700" />
            Awaiting HO
          </span>
        </div>

        <p className="mt-5 text-[14.5px] leading-6 text-slate-700">
          Your resolution is with Head Office. We&apos;ll let you know when
          it&apos;s approved or returned for revision.
        </p>

        <div className="mt-9 flex w-full flex-col gap-3">
          <Link
            href={`/m/${params.sap_code}`}
            className="flex h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 px-6 text-[15px] font-semibold text-white transition hover:bg-indigo-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/40"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.8} aria-hidden />
            Back to inbox
          </Link>
          <Link
            href={`/m/${params.sap_code}/r/${params.report_id}`}
            className="flex h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-6 text-[14px] font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-indigo-500/40"
          >
            Open this report
          </Link>
        </div>
      </div>
    </main>
  )
}
