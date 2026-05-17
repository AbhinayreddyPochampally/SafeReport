import type { Metadata } from "next"
import { ArrowRight, KeyRound, Languages, ShieldCheck, Store } from "lucide-react"
import Link from "next/link"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { StoreUnavailable } from "./store-unavailable"
import { ReporterIntro } from "@/components/reporter-intro"
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
      {/* Cinematic first-visit intro. Self-detects first visit via
          localStorage and overlays the rest of the page until dismissed.
          On return visits this renders nothing — the landing below shows
          immediately. */}
      <ReporterIntro />

      {/* Brand bar — APP icon (rounded indigo tile with white shield) on the
          left, discreet manager-login key on the right. The wordmark is
          dropped in favor of icon-only chrome; "SafeReport" is retained in
          aria-label for screen readers. */}
      <header className="flex items-center justify-between">
        <div
          aria-label="SafeReport"
          className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-indigo-700 text-white shadow-[0_2px_6px_rgba(67,56,202,0.25)]"
        >
          <ShieldCheck className="h-6 w-6" strokeWidth={2} aria-hidden />
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

      {/* Phase 10 facelift: landing is now intro overlay + brand bar + store
          card + Get started CTA. No name+phone form here — identity moved to
          /identity (Phase 4). No inline language picker — language has its own
          page /language with a small "Change language" link below the CTA.
          No PWA install nag — that lives on Confirm now. */}

      <div className="mt-8 flex flex-col gap-3">
        <Link
          href={`/r/${store.sap_code}/category`}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 px-6 text-[15px] font-semibold text-white shadow-[0_4px_14px_rgba(67,56,202,0.25)] transition hover:bg-indigo-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/40"
        >
          Get started
          <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden />
        </Link>
        <Link
          href={`/r/${store.sap_code}/language`}
          className="inline-flex items-center justify-center gap-1.5 self-center text-[13px] font-medium text-slate-600 underline-offset-2 hover:text-indigo-700 hover:underline"
        >
          <Languages className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden />
          Change language
        </Link>
      </div>

      <p className="mt-6 text-center text-[11px] uppercase tracking-wide text-slate-400">
        Anonymous to your store manager
      </p>

      {/* Fire-and-forget landing-visit beacon. Renders nothing — sends a
          single sendBeacon to /api/visits/log on mount so HO can see
          per-store traffic + QR-vs-direct split on the Analytics page.
          Server-side cookie throttle keeps refreshes from inflating counts. */}
      <VisitTracker sap_code={store.sap_code} source={visitSource} />
    </main>
  )
}
