import { notFound } from "next/navigation"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getManagerSession } from "@/lib/manager-auth"
import { ManagerLogin } from "./manager-login"
import { ManagerInbox } from "./manager-inbox"
import { ManagerIosInstallMount } from "./install-mount"

/**
 * Manager landing — /m/[sap_code].
 *
 * Server component: decides on the server whether to render the login form
 * or the inbox, so a protected payload never ships to a logged-out browser.
 * The signed-in case hands off to <ManagerInbox /> (client) which polls
 * `/api/reports?sap_code=...` every 30 s.
 *
 * A store that doesn't exist, isn't active, or hasn't been provisioned with
 * a manager password is treated as 404 — deliberately indistinguishable from
 * a typo so we're not leaking store scaffolding through error copy.
 */

type StoreHeader = {
  sap_code: string
  name: string
  brand: string
  city: string
  state: string
  status: string
  /** True iff the store has both manager_email AND manager_phone set —
   * the two identifiers required for email+phone auth (mig 004). Either
   * being null means the manager can't sign in, so we 404 the URL. */
  has_credentials: boolean
}

async function loadStore(sap_code: string): Promise<StoreHeader | null> {
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin
    .from("stores")
    .select(
      "sap_code, name, brand, city, state, status, manager_email, manager_phone",
    )
    .eq("sap_code", sap_code)
    .maybeSingle<{
      sap_code: string
      name: string
      brand: string
      city: string
      state: string
      status: string
      manager_email: string | null
      manager_phone: string | null
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
    has_credentials: Boolean(data.manager_email) && Boolean(data.manager_phone),
  }
}

export default async function ManagerLandingPage({
  params,
}: {
  params: { sap_code: string }
}) {
  const store = await loadStore(params.sap_code)
  if (!store || store.status !== "active" || !store.has_credentials) {
    notFound()
  }

  const session = await getManagerSession(store.sap_code)
  if (!session) {
    return (
      <>
        <ManagerIosInstallMount />
        <ManagerLogin store={store} />
      </>
    )
  }
  return <ManagerInbox store={store} />
}
