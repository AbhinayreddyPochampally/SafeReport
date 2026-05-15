import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"

/**
 * Per-store web app manifest.
 *
 * Why a dynamic per-store manifest instead of the global one at
 * `app/manifest.ts`?
 *
 * The QR poster carries a store-specific URL (e.g. `/r/PNT-MUM-047`).
 * When a reporter installs the PWA from that page, we want the home-screen
 * icon to re-open *that* store's landing — not the developer-only root page
 * at `/`. A single global manifest can't know which store the user installed
 * from. So each `/r/[sap_code]` landing advertises its own manifest whose
 * `start_url` is bound to that SAP code.
 *
 * Browsers treat each unique manifest `id` as a distinct installable app,
 * so a manager who covers two stores can install both icons side-by-side
 * and they don't fight over the same install slot.
 *
 * The route is unauthenticated (the reporter page itself is) — we hit the
 * `v_store_public` view, never the underlying `stores` table.
 */

export const dynamic = "force-dynamic"

// SAP codes are uppercase letters / digits / dashes, per CLAUDE.md. Validate
// here so we don't issue manifests for clearly bogus paths.
const SAP_CODE_RE = /^[A-Z0-9-]{1,32}$/

export async function GET(
  _req: Request,
  { params }: { params: { sap_code: string } },
) {
  const sap_code = params.sap_code

  if (!SAP_CODE_RE.test(sap_code)) {
    return new NextResponse("Not found", { status: 404 })
  }

  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from("v_store_public")
    .select("sap_code, status")
    .eq("sap_code", sap_code)
    .maybeSingle<{ sap_code: string; status: string }>()

  if (error || !data || data.status !== "active") {
    return new NextResponse("Not found", { status: 404 })
  }

  const startUrl = `/r/${sap_code}`

  const manifest = {
    // Keep the `name` generic — pilot reporters install at one store, and a
    // store-specific name on the launcher tile would expose the SAP code in
    // a place where it adds no value.
    name: "SafeReport",
    short_name: "SafeReport",
    description:
      "Workplace safety incident reporting for ABF retail stores.",
    // The pair that actually does the work: each store gets its own start_url
    // (so the icon opens that store's landing) and its own `id` (so two
    // installs from two different stores live as two separate apps).
    start_url: startUrl,
    id: startUrl,
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F8FAFC", // slate-50
    theme_color: "#4338CA", // indigo-700
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      // Short cache — the store row could go inactive, and we want the next
      // visit to honour that. 5 minutes is enough to spare us a DB hit on
      // every poll while staying responsive to admin changes.
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  })
}
