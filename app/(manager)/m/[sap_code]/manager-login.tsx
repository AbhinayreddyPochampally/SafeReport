"use client"

import { ArrowLeft, Eye, EyeOff, Loader2, LogIn, Phone, Shield } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

/**
 * Phone + password login screen for a specific store.
 *
 * Flow: manager opens /m/[sap_code] → sees this form → enters phone (the
 * number HO has on file) and password (set by HO from the Stores page).
 * On submit we POST /api/auth/manager; success sets the sr_mgr cookie and
 * router.refresh() re-runs the server component, yielding the inbox.
 *
 * Migrated from PIN auth in Phase migrate/002. The SAP-coded URL is
 * preserved so existing QR posters keep working — only the input changes.
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
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmedPhone = phone.trim()
  const canSubmit =
    !busy && trimmedPhone.length >= 7 && password.length >= 6

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/auth/manager", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sap_code: store.sap_code,
          phone: trimmedPhone,
          password,
        }),
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
          `${msg || "Invalid phone or password."} — ${left} attempt${left === 1 ? "" : "s"} left`,
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
          Sign in with your phone number and password to open the safety inbox.
        </p>
      </div>

      <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
        <div>
          <label
            htmlFor="mgr-phone"
            className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-600"
          >
            Phone number
          </label>
          <div className="relative">
            <Phone
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
              strokeWidth={1.8}
              aria-hidden
            />
            <input
              id="mgr-phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="98200 11234"
              className="block w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-[15px] text-slate-900 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/30"
              disabled={busy}
              required
            />
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            The phone number Head Office has on file for this store.
          </p>
        </div>

        <div>
          <label
            htmlFor="mgr-password"
            className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-600"
          >
            Password
          </label>
          <div className="relative">
            <input
              id="mgr-password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Set by Head Office"
              className="block w-full rounded-xl border border-slate-200 bg-white py-3 px-3 pr-11 text-[15px] text-slate-900 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/30"
              disabled={busy}
              required
              minLength={6}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              aria-label={showPassword ? "Hide password" : "Show password"}
              disabled={busy}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" strokeWidth={1.8} />
              ) : (
                <Eye className="h-4 w-4" strokeWidth={1.8} />
              )}
            </button>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-[12.5px] font-medium text-orange-800"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="mt-2 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-indigo-700 px-6 text-[15px] font-semibold text-white transition hover:bg-indigo-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/40 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogIn className="h-4 w-4" strokeWidth={2} />
          )}
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <p className="mt-1 text-center text-[11px] text-slate-500">
          Forgot your password? Ask your Head Office contact to reset it from
          the store registry.
        </p>
      </form>

      <p className="mt-10 text-center text-[11px] uppercase tracking-wide text-slate-400">
        Store manager access · {store.sap_code}
      </p>
    </main>
  )
}
