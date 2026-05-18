import { createSupabaseServerClient } from "@/lib/supabase/server"
import { StoreUnavailable } from "../store-unavailable"
import { LanguagePicker } from "./language-picker"

/**
 * Language picker server wrapper.
 *
 * Used to be a "use client" page with no server-side data — the store
 * card was missing from this screen even though it appears on the
 * welcome landing. After the May 2026 user feedback ("include the
 * Store card on the language page"), this became a server component
 * that does the same v_store_public lookup the welcome landing does
 * and hands the store row to <LanguagePicker /> as a prop.
 *
 * The store-not-found fallback mirrors the welcome page exactly so a
 * stale or wrong SAP code surfaces the same explainer on either entry
 * point.
 */

export const dynamic = "force-dynamic"

type StoreRow = {
  sap_code: string
  name: string
  brand: string
  city: string
  state: string
  status: "active" | "temporarily_closed" | "permanently_closed"
}

export default async function LanguagePage({
  params,
}: {
  params: { sap_code: string }
}) {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from("v_store_public")
    .select("sap_code, name, brand, city, state, status")
    .eq("sap_code", params.sap_code)
    .maybeSingle<StoreRow>()

  if (error || !data || data.status !== "active") {
    return <StoreUnavailable sap_code={params.sap_code} />
  }

  const { sap_code, name, brand, city, state } = data
  return (
    <LanguagePicker
      store={{ sap_code, name, brand, city, state }}
    />
  )
}
