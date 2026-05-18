import type { Metadata } from "next"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { StoreUnavailable } from "./store-unavailable"
import { ReporterLanding } from "./reporter-landing"
import { VisitTracker } from "@/components/visit-tracker"

/**
 * Reporter root page at /r/[sap_code].
 *
 * Server wrapper: looks up the store row, falls back to <StoreUnavailable />
 * if the SAP code is unknown / inactive, and hands the store data to the
 * <ReporterLanding /> client component (store card + language picker +
 * cinematic intro overlay).
 *
 * The standalone /language and /welcome screens were merged into this one
 * after the user feedback "we do not need separate welcome page as there
 * is intro; so combine language and store card". The flow now is:
 *   Scan QR → /r/[sap_code] (intro overlay + store card + language tiles)
 *   → pick language → /r/[sap_code]/category (Triage)
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

// Per-store metadata.
//
// The manifest link is the load-bearing bit here. It points Chromium at
// /r/[sap_code]/manifest.webmanifest, whose start_url reopens this exact
// store when the reporter taps the installed home-screen icon. Without
// this override the install would inherit the root /manifest.webmanifest
// (start_url "/") and land users on the developer-only root page.
//
// icons.apple is split out because iOS Safari doesn't use the manifest
// for the home-screen icon -- it reads the apple-touch-icon link tag
// separately.
type MetadataProps = { params: { sap_code: string } }

export function generateMetadata(props: MetadataProps): Metadata {
  return {
    manifest: `/r/${props.params.sap_code}/manifest.webmanifest`,
    icons: {
      apple: "/apple-touch-icon.png",
    },
  }
}

export default async function ReporterRootPage({
  params,
  searchParams,
}: {
  params: { sap_code: string }
  searchParams: { [key: string]: string | string[] | undefined }
}) {
  // QR posters embed `?src=qr` in the URL the printed code resolves to,
  // so a scan-originated visit carries that tag through to the page.
  // Anything else (direct paste, bookmark, internal link) reads as 'direct'.
  const srcParam = searchParams.src
  const visitSource: "qr" | "direct" =
    (Array.isArray(srcParam) ? srcParam[0] : srcParam) === "qr"
      ? "qr"
      : "direct"
  const supabase = createSupabaseServerClient()

  // NB: we query the v_store_public VIEW, not the stores table, because the
  // reporter page is unauthenticated. The view exposes only non-sensitive
  // columns and is granted SELECT to anon in supabase/rls.sql.
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
    <>
      <ReporterLanding store={{ sap_code, name, brand, city, state }} />
      {/* Fire-and-forget landing-visit beacon. Renders nothing — sends a
          single sendBeacon to /api/visits/log on mount so HO can see
          per-store traffic + QR-vs-direct split on the Analytics page.
          Server-side cookie throttle keeps refreshes from inflating counts. */}
      <VisitTracker sap_code={sap_code} source={visitSource} />
    </>
  )
}
