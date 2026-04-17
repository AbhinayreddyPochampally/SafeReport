import Link from "next/link"
import { ShieldCheck, Store, ArrowRight } from "lucide-react"
import { createSupabaseServerClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

type StoreRow = {
  sap_code: string
  name: string
  brand: string
  city: string
  state: string
  status: "active" | "temporarily_closed" | "permanently_closed"
}

function StoreUnavailable({ sap_code }: { sap_code: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-5 px-6 py-16">
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-600">
        Store not found
      </p>
      <h1 className="font-display text-[28px] font-bold leading-9 text-slate-900">
        We couldn&apos;t find that store.
      </h1>
      <p className="text-[15px] leading-6 text-slate-600">
        The code{" "}
        <span className="font-mono text-slate-900">{sap_code}</span> is not in
        the SafeReport registry, or the store is currently inactive. If you
        believe this is wrong, please show this screen to your manager.
      </p>
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-[13px] leading-5 text-slate-600">
        Tip: the QR poster on your back-of-house notice board has the correct
        link for your store.
      </div>
    </main>
  )
}

export default async function ReporterLandingPage({
  params,
}: {
  params: { sap_code: string }
}) {
  const supabase = createSupabaseServerClient()

  // NB: we query the v_store_public VIEW, not the stores table, because the
  // reporter page is unauthenticated (no PIN, no login). The view exposes only
  // non-sensitive columns (sap_code, name, brand, city, state, status) and is
  // granted SELECT to the anon role in supabase/rls.sql. The stores table
  // itself is locked down to HO users — querying it here returns no rows
  // under RLS and the page renders "Store not found."
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
      {/* Brand bar */}
      <header className="flex items-center gap-2 text-indigo-900">
        <ShieldCheck className="h-6 w-6" strokeWidth={2} aria-hidden />
        <span className="font-display text-[18px] font-bold tracking-tight">
          SafeReport
        </span>
      </header>

      {/* Store card */}
      <section className="mt-10 rounded-lg border border-slate-200 bg-white p-5">
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

      {/* Intro copy */}
      <section className="mt-8 space-y-3">
        <h2 className="font-display text-[20px] font-bold leading-7 text-slate-900">
          Report a safety issue
        </h2>
        <p className="text-[15px] leading-6 text-slate-700">
          Saw something unsafe, or had a close call? Tell us in your own voice,
          in your own language. It takes under a minute.
        </p>
        <p className="text-[13px] leading-5 text-slate-600">
          Your name is visible only to Head Office, never to the store manager.
        </p>
      </section>

      {/* CTA */}
      <div className="mt-auto pt-10">
        <Link
          href={`/r/${store.sap_code}/category`}
          className="flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-indigo-700 px-6 text-[15px] font-medium text-white transition hover:bg-indigo-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/40"
        >
          Continue
          <ArrowRight className="h-4 w-4" strokeWidth={1.8} aria-hidden />
        </Link>
        <p className="mt-3 text-center text-[11px] uppercase tracking-wide text-slate-400">
          Anonymous to store manager
        </p>
      </div>
    </main>
  )
}
