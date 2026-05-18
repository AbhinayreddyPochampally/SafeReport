import { requireHoSession } from "@/lib/ho-auth"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { ActionClient, type ActionListItem, type ActionDetail } from "./action-client"

export const dynamic = "force-dynamic"

/**
 * HO Action Required — /ho/action.
 *
 * Single screen that consolidates everything Head Office needs to do something
 * about, grouped by priority:
 *
 *   1. SLA-breached awaiting (status=awaiting_ho, > 48h waiting) — pinned, orange.
 *   2. Awaiting HO (status=awaiting_ho, ≤ 48h) — the regular approve/return queue.
 *      Rows that have been previously returned are tagged "Resub" so HO can see
 *      this is the manager's nth attempt.
 *   3. Stale new (status=new, > 24h, no acknowledged_at) — read-only, no action
 *      possible from HO; surfaces so HO can chase the store manager.
 *
 * Master-detail layout: list on the left, full report context + action bar on
 * the right. Selection is URL-driven via ?id=SR-... — server re-renders with
 * the new detail row, which keeps the experience snappy and permalinkable.
 *
 * After an approve / return / void mutation, the client calls router.refresh()
 * so the server re-fetches and the list re-shapes (the row leaves the queue;
 * next-most-urgent slides in).
 */

type StoreLite = {
  sap_code: string
  name: string
  brand: string
  city: string
  state: string
}

type ReportRow = {
  id: string
  store_code: string
  // Mig 007: nullable until HO confirms.
  type: "observation" | "incident" | null
  category: string | null
  status: "new" | "in_progress" | "awaiting_ho" | "returned" | "closed" | "voided"
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
  stores: StoreLite
}

type ResolutionRow = {
  id: string
  report_id: string
  attempt_number: number
  note: string
  photo_url: string | null
  resolved_at: string
}

type HoActionRow = {
  id: string
  report_id: string
  action: "approve" | "return" | "void"
  rejection_reason: string | null
  acted_at: string
  ho_users: { display_name: string } | null
}

const SLA_BREACH_HOURS = 48
const STALE_NEW_HOURS = 24

export default async function HoActionPage({
  searchParams,
}: {
  searchParams?: { id?: string }
}) {
  const session = await requireHoSession("/ho/action")
  const admin = createSupabaseAdminClient()

  // Pull all rows in scope in a single query, then partition in Node.
  // Awaiting-HO rows AND new (not yet acked) rows in one go.
  const { data: reportRows, error: repErr } = await admin
    .from("reports")
    .select(
      "id, store_code, type, category, status, description, transcript, transcript_error, photo_url, audio_url, incident_datetime, reported_at, acknowledged_at, reporter_name, reporter_phone, stores!inner(sap_code, name, brand, city, state)",
    )
    .in("status", ["awaiting_ho", "new"])
    .order("reported_at", { ascending: true })

  if (repErr) {
    console.error("[ho/action] reports query failed", repErr)
    return (
      <div className="max-w-3xl mx-auto p-10">
        <h1 className="text-xl font-semibold text-slate-900">
          Action queue unavailable
        </h1>
        <p className="text-slate-600 mt-2 text-sm">
          Could not load the queue. Try refreshing.
        </p>
      </div>
    )
  }

  const rawReports = (reportRows ?? []) as unknown as ReportRow[]
  if (rawReports.length === 0) {
    return (
      <ActionClient
        list={[]}
        detailsById={{}}
        initialSelectedId={null}
        counts={{ sla_breached: 0, awaiting: 0, stale_new: 0, resubmitted: 0 }}
        viewer={{ display_name: session.display_name }}
      />
    )
  }

  const reportIds = rawReports.map((r) => r.id)
  const [resolutionsResp, historyResp] = await Promise.all([
    admin
      .from("resolutions")
      .select("id, report_id, attempt_number, note, photo_url, resolved_at")
      .in("report_id", reportIds)
      .order("attempt_number", { ascending: true }),
    admin
      .from("ho_actions")
      .select(
        "id, report_id, action, rejection_reason, acted_at, ho_users!left(display_name)",
      )
      .in("report_id", reportIds)
      .order("acted_at", { ascending: true }),
  ])

  const allResolutions = (resolutionsResp.data ?? []) as ResolutionRow[]
  const allHistory = (historyResp.data ?? []) as unknown as HoActionRow[]

  // Bucket children by report id for cheap lookup.
  const resByReport = new Map<string, ResolutionRow[]>()
  for (const r of allResolutions) {
    const arr = resByReport.get(r.report_id) ?? []
    arr.push(r)
    resByReport.set(r.report_id, arr)
  }
  const histByReport = new Map<string, HoActionRow[]>()
  for (const h of allHistory) {
    const arr = histByReport.get(h.report_id) ?? []
    arr.push(h)
    histByReport.set(h.report_id, arr)
  }

  const now = Date.now()
  const slaBreachCutoff = now - SLA_BREACH_HOURS * 36e5
  const staleNewCutoff = now - STALE_NEW_HOURS * 36e5

  // Build the list. Partition + sort.
  type Bucketed = {
    item: ActionListItem
    bucket: "sla_breached" | "awaiting" | "stale_new"
    sort: number
  }

  const bucketed: Bucketed[] = []
  for (const r of rawReports) {
    const reportedTs = Date.parse(r.reported_at)
    const resolutions = resByReport.get(r.id) ?? []
    const returnCount = (histByReport.get(r.id) ?? []).filter(
      (h) => h.action === "return",
    ).length
    const latestRes = resolutions[resolutions.length - 1] ?? null
    const ageHours = (now - reportedTs) / 36e5
    const item: ActionListItem = {
      id: r.id,
      store_code: r.store_code,
      store_name: r.stores.name,
      brand: r.stores.brand,
      type: r.type,
      category: r.category,
      status: r.status,
      reported_at: r.reported_at,
      acknowledged_at: r.acknowledged_at,
      age_hours: ageHours,
      attempt_count: resolutions.length,
      resubmitted: returnCount > 0,
      latest_note: latestRes?.note ?? null,
    }

    if (r.status === "awaiting_ho") {
      if (reportedTs <= slaBreachCutoff) {
        bucketed.push({ item, bucket: "sla_breached", sort: reportedTs })
      } else {
        bucketed.push({ item, bucket: "awaiting", sort: reportedTs })
      }
    } else if (
      r.status === "new" &&
      r.acknowledged_at === null &&
      reportedTs <= staleNewCutoff
    ) {
      bucketed.push({ item, bucket: "stale_new", sort: reportedTs })
    }
  }

  // Oldest-first inside each bucket — the longer it's been waiting, the higher
  // it should sit. Bucket order: sla_breached → awaiting → stale_new.
  bucketed.sort((a, b) => {
    const bucketRank = { sla_breached: 0, awaiting: 1, stale_new: 2 } as const
    const ba = bucketRank[a.bucket]
    const bb = bucketRank[b.bucket]
    if (ba !== bb) return ba - bb
    return a.sort - b.sort
  })

  const list = bucketed.map((b) => ({ ...b.item, bucket: b.bucket }))

  const counts = {
    sla_breached: bucketed.filter((b) => b.bucket === "sla_breached").length,
    awaiting: bucketed.filter((b) => b.bucket === "awaiting").length,
    stale_new: bucketed.filter((b) => b.bucket === "stale_new").length,
    resubmitted: bucketed.filter((b) => b.item.resubmitted).length,
  }

  // Pre-build detail for EVERY list row, so client-side keyboard navigation
  // (J/K) flips between them instantly without a server round-trip. List is
  // bounded by the size of the action queue (~30 items at pilot scale), so
  // the payload stays cheap.
  const reportById = new Map<string, ReportRow>()
  for (const r of rawReports) reportById.set(r.id, r)

  const detailsById: Record<string, ActionDetail> = {}
  for (const item of list) {
    const r = reportById.get(item.id)
    if (!r) continue
    detailsById[item.id] = {
      id: r.id,
      store: {
        sap_code: r.stores.sap_code,
        name: r.stores.name,
        brand: r.stores.brand,
        city: r.stores.city,
        state: r.stores.state,
      },
      type: r.type,
      category: r.category,
      status: r.status,
      description: r.description,
      transcript: r.transcript,
      transcript_error: r.transcript_error,
      photo_url: r.photo_url,
      audio_url: r.audio_url,
      incident_datetime: r.incident_datetime,
      reported_at: r.reported_at,
      acknowledged_at: r.acknowledged_at,
      reporter_name: r.reporter_name,
      reporter_phone: r.reporter_phone,
      resolutions: resByReport.get(r.id) ?? [],
      history: (histByReport.get(r.id) ?? []).map((h) => ({
        id: h.id,
        action: h.action,
        rejection_reason: h.rejection_reason,
        acted_at: h.acted_at,
        actor_display_name: h.ho_users?.display_name ?? null,
      })),
    }
  }

  // Initial selection — from URL if it points at a row in the list, else the
  // first row.
  const requestedId = searchParams?.id ?? null
  const initialSelectedId =
    (requestedId && detailsById[requestedId] ? requestedId : list[0]?.id) ??
    null

  return (
    <ActionClient
      list={list}
      detailsById={detailsById}
      initialSelectedId={initialSelectedId}
      counts={counts}
      viewer={{ display_name: session.display_name }}
    />
  )
}
