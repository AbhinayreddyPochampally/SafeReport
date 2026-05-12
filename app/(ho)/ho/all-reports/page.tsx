import { requireHoSession } from "@/lib/ho-auth"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { CATEGORIES } from "@/lib/categories"
import type { ReportCategory } from "@/lib/reporter-state"
import { AllReportsClient } from "./all-reports-client"
import type {
  AllReportsRow,
  ReportStatus,
  StatusFilter,
} from "./all-reports-client"

export const dynamic = "force-dynamic"

/**
 * Reports tab — /ho/all-reports.
 *
 * Comprehensive browser over every report in the system regardless of
 * status. Server resolves the URL filters (status, category, brand, q, from,
 * to, page) so the URL is shareable and refreshing keeps your view; the
 * client component owns the interactive filter UI and pushes new searchParams
 * back via router.replace.
 *
 * Pagination: 50 rows per page, server-paged so we never ship the whole
 * pilot dataset to the browser.
 */

const PAGE_SIZE = 50

type SP = Record<string, string | string[] | undefined>

function readMulti(sp: SP, key: string): string[] {
  const raw = sp[key]
  if (raw === undefined) return []
  if (Array.isArray(raw)) return raw.flatMap((s) => s.split(","))
  return raw.split(",").filter(Boolean)
}

function readSingle(sp: SP, key: string): string | undefined {
  const raw = sp[key]
  if (raw === undefined) return undefined
  return Array.isArray(raw) ? raw[0] : raw
}

const ALL_STATUSES: ReportStatus[] = [
  "new",
  "in_progress",
  "awaiting_ho",
  "returned",
  "closed",
  "voided",
]
const OPEN_STATUSES: ReportStatus[] = [
  "new",
  "in_progress",
  "awaiting_ho",
  "returned",
]

function resolveStatusFilter(sp: SP): StatusFilter {
  // Two convenience aliases supported in URLs from the Overview "View all"
  // links: ?status=open and ?status=awaiting_ho. Otherwise treat status= as
  // a comma-separated list.
  const single = readSingle(sp, "status")
  if (single === "open") return { kind: "preset", value: "open" }
  if (single === "all" || single === undefined) {
    const multi = readMulti(sp, "status").filter((s) =>
      (ALL_STATUSES as string[]).includes(s),
    ) as ReportStatus[]
    return multi.length > 0
      ? { kind: "multi", values: multi }
      : { kind: "preset", value: "all" }
  }
  if ((ALL_STATUSES as string[]).includes(single)) {
    return { kind: "multi", values: [single as ReportStatus] }
  }
  return { kind: "preset", value: "all" }
}

function statusesFor(filter: StatusFilter): ReportStatus[] {
  if (filter.kind === "multi") return filter.values
  if (filter.value === "open") return OPEN_STATUSES
  return ALL_STATUSES
}

export default async function AllReportsPage({
  searchParams,
}: {
  searchParams: SP
}) {
  await requireHoSession("/ho/all-reports")

  const statusFilter = resolveStatusFilter(searchParams)
  const categoryFilter = readMulti(searchParams, "category").filter((c) =>
    CATEGORIES.some((cat) => cat.key === c),
  ) as ReportCategory[]
  const brandFilter = readMulti(searchParams, "brand")
  const search = (readSingle(searchParams, "q") ?? "").trim()
  const from = readSingle(searchParams, "from") ?? ""
  const to = readSingle(searchParams, "to") ?? ""
  const pageRaw = parseInt(readSingle(searchParams, "page") ?? "1", 10)
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1
  const offset = (page - 1) * PAGE_SIZE

  const admin = createSupabaseAdminClient()

  // Build the query incrementally so the chain stays readable.
  let query = admin
    .from("reports")
    .select(
      "id, store_code, category, status, reported_at, transcript, description, stores!inner(name, brand)",
      { count: "exact" },
    )
    .in("status", statusesFor(statusFilter))
    .order("reported_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1)

  if (categoryFilter.length > 0) query = query.in("category", categoryFilter)
  if (brandFilter.length > 0) query = query.in("stores.brand", brandFilter)
  if (from) {
    // Treat the date input as IST (the reporting locale). A naive
    // `new Date("2026-05-12")` parses as UTC midnight, which drops the
    // 00:00–05:30 IST window of that local date. Build the ISO with an
    // explicit +05:30 offset.
    const fromIso = istBoundary(from, "00:00:00.000")
    if (fromIso) query = query.gte("reported_at", fromIso)
  }
  if (to) {
    const toIso = istBoundary(to, "23:59:59.999")
    if (toIso) query = query.lte("reported_at", toIso)
  }
  if (search) {
    // PostgREST's .or() expression is comma-delimited and dot-delimited
    // (column.op.value). A user search containing any of those characters
    // — or quotes — would either break the query or rewrite the filter
    // expression. Reject any unsafe character and the search becomes a
    // pure literal contains-match on the whitelisted columns.
    const safe = sanitizeSearch(search)
    if (safe) {
      query = query.or(
        `id.ilike.%${safe}%,store_code.ilike.%${safe}%,transcript.ilike.%${safe}%,description.ilike.%${safe}%`,
      )
    }
  }

  const { data, count, error } = await query

  if (error) {
    console.error("[ho/all-reports] query failed", error)
  }

  const rows: AllReportsRow[] = (data ?? []).map((r) => {
    const s = (r as unknown as {
      stores: { name: string; brand: string }
    }).stores
    const transcript = (r.transcript as string | null)?.trim() ?? ""
    const description = (r.description as string | null)?.trim() ?? ""
    const headline = (transcript || description).slice(0, 140) || null
    return {
      id: r.id as string,
      store_code: r.store_code as string,
      store_name: s?.name ?? "—",
      brand: s?.brand ?? "—",
      category: r.category as ReportCategory,
      status: r.status as ReportStatus,
      reported_at: r.reported_at as string,
      headline,
    }
  })

  // Per-status counts (across the same filter set, ignoring status filter).
  const allStatusCounts = await fetchStatusCounts(
    admin,
    categoryFilter,
    brandFilter,
    from,
    to,
    search,
  )

  // Distinct brand list for the filter chips.
  const { data: brandsRaw } = await admin
    .from("stores")
    .select("brand")
    .eq("status", "active")
  const brands = Array.from(
    new Set((brandsRaw ?? []).map((r) => r.brand as string)),
  ).sort()

  return (
    <AllReportsClient
      rows={rows}
      total={count ?? 0}
      page={page}
      pageSize={PAGE_SIZE}
      filters={{
        status: statusFilter,
        categories: categoryFilter,
        brands: brandFilter,
        from,
        to,
        q: search,
      }}
      statusCounts={allStatusCounts}
      availableBrands={brands}
    />
  )
}

/* -------------------------- Status count helper -------------------------- */

type AdminClient = ReturnType<typeof createSupabaseAdminClient>

async function fetchStatusCounts(
  admin: AdminClient,
  categoryFilter: ReportCategory[],
  brandFilter: string[],
  from: string,
  to: string,
  search: string,
): Promise<Record<ReportStatus, number>> {
  const counts: Record<ReportStatus, number> = {
    new: 0,
    in_progress: 0,
    awaiting_ho: 0,
    returned: 0,
    closed: 0,
    voided: 0,
  }

  // One round-trip: fetch status column for the filtered set, count locally.
  // Cheaper than 6 round-trips and the column is small.
  let q = admin
    .from("reports")
    .select("status, stores!inner(brand)", { head: false })
    .limit(10_000)

  if (categoryFilter.length > 0) q = q.in("category", categoryFilter)
  if (brandFilter.length > 0) q = q.in("stores.brand", brandFilter)
  if (from) {
    const fromIso = istBoundary(from, "00:00:00.000")
    if (fromIso) q = q.gte("reported_at", fromIso)
  }
  if (to) {
    const toIso = istBoundary(to, "23:59:59.999")
    if (toIso) q = q.lte("reported_at", toIso)
  }
  if (search) {
    const safe = sanitizeSearch(search)
    if (safe) {
      q = q.or(
        `id.ilike.%${safe}%,store_code.ilike.%${safe}%,transcript.ilike.%${safe}%,description.ilike.%${safe}%`,
      )
    }
  }

  const { data } = await q
  for (const row of data ?? []) {
    const s = row.status as ReportStatus
    if (s in counts) counts[s] += 1
  }
  return counts
}

/* ---------------------- Filter sanitization helpers ---------------------- */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Convert a YYYY-MM-DD URL param into an ISO 8601 timestamp pinned to IST.
 * Returns null for malformed input so the query simply skips that bound
 * instead of forwarding garbage to Postgres (which silently 500's the page).
 */
function istBoundary(date: string, time: string): string | null {
  if (!ISO_DATE_RE.test(date)) return null
  const candidate = `${date}T${time}+05:30`
  const ms = Date.parse(candidate)
  if (!Number.isFinite(ms)) return null
  return new Date(ms).toISOString()
}

/**
 * Strip characters that have meaning in PostgREST's `.or()` expression
 * grammar — `,` separates terms, `.` delimits column.op.value, parentheses
 * group, and quotes change the parse mode. Also drops `%`/`_` so the
 * resulting string is a literal contains-match, never a wildcard. Returns
 * empty string when nothing usable is left.
 */
function sanitizeSearch(s: string): string {
  return s.replace(/[,()."'%_*\\]/g, "").trim()
}
