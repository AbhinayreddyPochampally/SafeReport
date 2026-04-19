"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LogOut, Loader2 } from "lucide-react"

/**
 * Sign-out button used in the HO header.
 *
 * Posts to /api/auth/ho to clear the Supabase auth cookie server-side, then
 * navigates to /ho/login. We intentionally don't do optimistic UI here — the
 * round-trip is fast and we want to be sure the cookie is gone before we
 * redirect (otherwise middleware might bounce us back to /ho).
 */
export function HoSignOutButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function onClick() {
    if (busy) return
    setBusy(true)
    try {
      await fetch("/api/auth/ho", { method: "POST" })
    } catch {
      // Non-fatal — the cookie clear happens server-side on the response of
      // that fetch. If the network drops we still fall through to redirect.
    }
    router.replace("/ho/login")
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60 transition-colors"
      aria-label="Sign out"
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <LogOut className="h-4 w-4" />
      )}
      <span className="hidden sm:inline">Sign out</span>
    </button>
  )
}
