import type { Metadata } from "next"
import { KeyRound, ShieldCheck, Store } from "lucide-react"
import Link from "next/link"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { ReporterForm } from "./reporter-form"
import { StoreUnavailable } from "./store-unavailable"
import { PwaInstallPrompt } from "@/components/pwa-install-prompt"
import { VisitTracker } from "@/components/visit-tracker"

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

export default async function ReporterLandingPage({
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

  const store = data

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-6 py-10">
      {/* Brand bar - SafeReport logo on the left, discreet manager-login button on the right */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-indigo-900">
          <ShieldCheck className="h-6 w-6" strokeWidth={2} aria-hidden />
          <span className="font-display text-[18px] font-bold tracking-tight">
            SafeReport
          </span>
        </div>
        <Link
          href={`/m/${params.sap_code}`}
          aria-label="Manager login"
          title="Manager login"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-indigo-500 hover:text-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-500/40"
        >
          <KeyRound className="h-4 w-4" strokeWidth={1.8} aria-hidden />
        </Link>
      </header>

      {/* Store card - store identity stays in source language; safe to leave
          unlocalised because the brand name + city + SAP code are universal. */}
      <section className="mt-8 rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 text-slate-600">
          <Store className="h-5 w-5" strokeWidth={1.8} aria-hidden />
          <span className="text-[11px] font-bold uppercase tracking-wide">
            {store.brand}
          </span>
        </div>
        <h1 className="mt-2 font-display text-[28px] font-bold leading-9 text-slate-900">
          {store.name}
        </h1>
        <p className="mt-1 text-[13px] text-slate-600">
          {store.city}, {store.state} &middot;{" "}
          <span className="font-mono">{store.sap_code}</span>
        </p>
      </section>

      {/* PWA setup nag - persistent until both notifications and home-screen
          install are done. Re-shows on every fresh visit if either is still
          missing, even though the reporter may have been here before. */}
      <PwaInstallPrompt />

      {/* Reporter form - owns the localised intro + name+phone form so the
          language toggle inside it can re-render everything below it. */}
      <ReporterForm sap_code={store.sap_code} />

      {/* Fire-and-forget landing-visit beacon. Renders nothing — sends a
          single sendBeacon to /api/visits/log on mount so HO can see
          per-store traffic + QR-vs-direct split on the Analytics page.
          Server-side cookie throttle keeps refreshes from inflating counts. */}
      <VisitTracker sap_code={store.sap_code} source={visitSource} />
    </main>
  )
}
