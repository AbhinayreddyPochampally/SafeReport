"use client"

import { ArrowLeft, Shield } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { PinKeypad } from "@/components/pin-keypad"

/**
 * PIN login screen for a specific store. Calls POST /api/auth/manager — on
 * success the server sets the sr_mgr cookie and we call router.refresh(),
 * which re-runs the server component and yields the inbox.
 */

type Store = {
  sap_code: string
  name: string
  brand: string
  city: string
  state: string
}

export function ManagerLogin({ store }: { store: Store }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [helper, setHelper] = useState<string | null>(null)

  async function submit(pin: string) {
    setBusy(true)
    setError(null)
    setHelper(null)
    try {
      const res = await fetch("/api/auth/manager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sap_code: store.sap_code, pin }),
      })
      let body: unknown = null
      try {
        body = await res.json()
      } catch {
        /* ignore */
      }
      if (res.ok) {
        router.refresh()
        return
      }

      // Error states: attempts_left, locked_for_ms, or just a generic message.
      const msg =
        body && typeof body === "object" && body !== null && "error" in body
          ? String((body as { error?: unknown }).error ?? "")
          : ""
      if (res.status === 429 && body && typeof body === "object") {
        const ms = Number(
          (body as { locked_for_ms?: unknown }).locked_for_ms ?? 0,
        )
        const mins = Math.max(1, Math.ceil(ms / 60_000))
        setError(`Too many attempts. Try again in ${mins} min.`)
      } else if (
        body &&
        typeof body === "object" &&
        "attempts_left" in body &&
        typeof (body as { attempts_left?: unknown }).attempts_left === "number"
      ) {
        const left = (body as { attempts_left: number }).attempts_left
        setError(
          `${msg || "Invalid store or PIN."} — ${left} attempt${left === 1 ? "" : "s"} left`,
        )
      } else {
        setError(msg || "Something went wrong. Please try again.")
      }
    } catch {
      setError("Network error. Try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col px-6 py-8">
      <Link
        href={`/r/${store.sap_code}`}
        className="inline-flex w-fit items-center gap-1 text-[13px] font-medium text-slate-700 hover:text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.8} aria-hidden />
        Back to store
      </Link>

      <div className="mt-10 flex flex-col items-center">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100 text-indigo-700"
          aria-hidden
        >
          <Shield className="h-8 w-8" strokeWidth={1.8} />
        </div>
        <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-slate-500">
          {store.brand} · {store.city}
        </p>
        <h1 className="mt-1 text-center font-display text-[26px] font-bold leading-8 text-slate-900">
          {store.name}
        </h1>
        <p className="mt-3 text-center text-[13px] leading-5 text-slate-600">
          Enter your store PIN to open the safety inbox.
        </p>
      </div>

      <div className="mt-8 flex justify-center">
        <PinKeypad
          busy={busy}
          error={error}
          helper={helper}
          onSubmit={submit}
        />
      </div>

      <p className="mt-10 text-center text-[11px] uppercase tracking-wide text-slate-400">
        Store manager access · {store.sap_code}
      </p>
    </main>
  )
}
