import { notFound } from "next/navigation"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getManagerSession } from "@/lib/manager-auth"
import { ManagerLogin } from "./manager-login"
import { ManagerInbox } from "./manager-inbox"

/**
 * Manager landing — /m/[sap_code].
 *
 * Server component: decides on the server whether to render the PIN keypad
 * or the inbox, so a protected payload never ships to a logged-out browser.
 * The signed-in case hands off to <ManagerInbox /> (client) which polls
 * `/api/reports?sap_code=...` every 30 s.
 *
 * A store that doesn't exist, isn't active, or has no PIN hash on file is
 * treated as 404 — deliberately indistinguishable from a typo, so we're not
 * leaking store scaffolding through error copy.
 */

type StoreHeader = {
  sap_code: string
  name: string
  brand: string
  city: string
  state: string
  status: string
  has_pin: boolean
}

async function loadStore(sap_code: string): Promise<StoreHeader | null> {
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin
    .from("stores")
    .select(
      "sap_code, name, brand, city, state, status, manager_pin_hash",
    )
    .eq("sap_code", sap_code)
    .maybeSingle<{
      sap_code: string
      name: string
      brand: string
      city: string
      state: string
      status: string
      manager_pin_hash: string | null
    }>()
  if (error) {
    console.error("[/m/sap_code] store lookup failed", error)
    return null
  }
  if (!data) return null
  return {
    sap_code: data.sap_code,
    name: data.name,
    brand: data.brand,
    city: data.city,
    state: data.state,
    status: data.status,
    has_pin: Boolean(data.manager_pin_hash),
  }
}

export default async function ManagerLandingPage({
  params,
}: {
  params: { sap_code: string }
}) {
  const store = await loadStore(params.sap_code)
  if (!store || store.status !== "active" || !store.has_pin) {
    notFound()
  }

  const session = await getManagerSession(store.sap_code)
  if (!session) {
    return <ManagerLogin store={store} />
  }
  return <ManagerInbox store={store} />
}
