"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Lock, Mail } from "lucide-react"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"

/**
 * HO login form.
 *
 * Uses the browser Supabase client directly so @supabase/ssr can write the
 * auth cookies into the response. On success we push to `nextPath` (which the
 * server page has already sanitised to a same-origin /ho path) — we use
 * router.replace rather than push so the login entry doesn't clutter history.
 *
 * Errors are surfaced inline; we deliberately don't echo back the password
 * field on failure, and we normalise Supabase's auth error codes into a pair
 * of friendly strings rather than leaking the raw message.
 */
export function HoLoginForm({
  nextPath,
  initialError = null,
}: {
  nextPath: string
  initialError?: string | null
}) {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  // Seed with any message the server page passed in (e.g. "not_authorized"
  // after the middleware signed out a non-ho_users user). The message clears
  // as soon as the user starts typing a new attempt.
  const [error, setError] = useState<string | null>(initialError)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    setError(null)

    const trimmedEmail = email.trim()
    if (!trimmedEmail || !password) {
      setError("Enter your email and password to continue.")
      return
    }

    setBusy(true)
    const supabase = createSupabaseBrowserClient()
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    })

    if (authError) {
      // Supabase returns "Invalid login credentials" for both bad email and
      // bad password — we keep that opacity deliberately.
      setBusy(false)
      setPassword("")
      if (authError.message.toLowerCase().includes("invalid")) {
        setError("That email and password combination didn't match.")
      } else {
        setError("Sign in failed. Please try again in a moment.")
      }
      return
    }

    // Use refresh() then push so the server component re-runs with the new
    // cookie and we don't end up in a bounce loop if the middleware hasn't
    // observed the cookie yet.
    router.replace(nextPath)
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-indigo-700 text-white mb-4">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
            SafeReport Head Office
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Sign in to review incident reports and manage stores.
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-5"
          noValidate
        >
          <div className="space-y-1.5">
            <label
              htmlFor="ho-email"
              className="text-sm font-medium text-slate-800"
            >
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                id="ho-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                disabled={busy}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-md text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50"
                placeholder="you@abfrl.example"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="ho-password"
              className="text-sm font-medium text-slate-800"
            >
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                id="ho-password"
                type="password"
                autoComplete="current-password"
                required
                disabled={busy}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-md text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-slate-50"
              />
            </div>
          </div>

          {error ? (
            <div
              role="alert"
              className="rounded-md bg-orange-50 border border-orange-200 px-3 py-2 text-sm text-orange-700"
            >
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-indigo-700 hover:bg-indigo-800 active:bg-indigo-900 text-white font-medium py-2.5 text-sm disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in&hellip;
              </>
            ) : (
              "Sign in"
            )}
          </button>

          <p className="text-xs text-slate-500 text-center pt-1">
            Access is limited to authorised Head Office users.
          </p>
        </form>
      </div>
    </div>
  )
}
