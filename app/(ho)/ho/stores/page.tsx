import { requireHoSession } from "@/lib/ho-auth"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { StoresClient, type StoreRow } from "./stores-client"

export const dynamic = "force-dynamic"

/**
 * HO store registry — /ho/stores.
 *
 * Server component: guards the session, loads the full store roster with
 * a per-store report count, and hands it off to the client for table
 * interaction (search, filter chips, inline edit, add store, CSV import,
 * QR code download).
 *
 * Surfaces `has_password` and `qr_downloaded_at` so the client can flag
 * stores without a manager password (cannot accept logins) and stores
 * whose QR poster hasn't been distributed yet.
 */

type StoresRow = {
  sap_code: string
  name: string
  brand: string
  city: string
  state: string
  location: string | null
  manager_name: string | null
  manager_phone: string | null
  manager_password_hash: string | null
  status: "active" | "temporarily_closed" | "permanently_closed"
  opening_date: string | null
  qr_downloaded_at: string | null
  created_at: string | null
}

export default async function HoStoresPage() {
  await requireHoSession("/ho/stores")

  const admin = createSupabaseAdminClient()

  // Pull stores and a distinct-report-count alongside. Reports table is
  // small in the pilot — fetching the report_id+store_code pairs and
  // tallying in Node is cheaper than a per-row aggregate round trip.
  const [storesResp, reportCountResp] = await Promise.all([
    admin
      .from("stores")
      .select(
        "sap_code, name, brand, city, state, location, manager_name, manager_phone, manager_password_hash, status, opening_date, qr_downloaded_at, created_at",
      )
      .order("brand", { ascending: true })
      .order("city", { ascending: true })
      .order("name", { ascending: true }),
    admin.from("reports").select("store_code"),
  ])

  if (storesResp.error) {
    console.error("[ho/stores] stores query failed", storesResp.error)
    return (
      <div className="max-w-3xl mx-auto p-10">
        <h1 className="text-xl font-semibold text-slate-900">
          Store registry unavailable
        </h1>
        <p className="text-slate-600 mt-2 text-sm">
          Could not load the store list. Try refreshing. If this persists, the
          Supabase service role key may be out of date.
        </p>
      </div>
    )
  }

  const countByStore = new Map<string, number>()
  for (const r of reportCountResp.data ?? []) {
    const code = r.store_code as string
    countByStore.set(code, (countByStore.get(code) ?? 0) + 1)
  }

  const rows: StoreRow[] = (storesResp.data as StoresRow[] | null ?? []).map(
    (s) => ({
      sap_code: s.sap_code,
      name: s.name,
      brand: s.brand,
      city: s.city,
      state: s.state,
      location: s.location,
      manager_name: s.manager_name,
      manager_phone: s.manager_phone,
      has_password: Boolean(s.manager_password_hash),
      status: s.status,
      opening_date: s.opening_date,
      report_count: countByStore.get(s.sap_code) ?? 0,
      qr_downloaded_at: s.qr_downloaded_at,
      created_at: s.created_at,
    }),
  )

  return <StoresClient rows={rows} />
}
