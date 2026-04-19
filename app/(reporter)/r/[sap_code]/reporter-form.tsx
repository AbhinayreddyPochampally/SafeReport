"use client"

import { ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import {
  clearProfile,
  readProfile,
  writeProfile,
  type ReporterProfile,
} from "@/lib/reporter-state"

type Props = { sap_code: string }

export function ReporterForm({ sap_code }: Props) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [existing, setExisting] = useState<ReporterProfile | null>(null)

  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    setExisting(readProfile())
    setMounted(true)
  }, [])

  function validate(): ReporterProfile | null {
    const n = name.trim()
    const p = phone.trim()
    if (n.length < 2) {
      setErr("Please enter your full name.")
      return null
    }
    if (!/^[+0-9\s()-]{7,}$/.test(p)) {
      setErr("Please enter a valid phone number.")
      return null
    }
    setErr(null)
    return { name: n, phone: p }
  }

  function onContinueExisting() {
    router.push(`/r/${sap_code}/category`)
  }

  function onSwitch() {
    clearProfile()
    setExisting(null)
    setName("")
    setPhone("")
    setErr(null)
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const p = validate()
    if (!p) return
    writeProfile(p)
    router.push(`/r/${sap_code}/category`)
  }

  // Avoid a hydration flicker: wait until we know whether a profile exists.
  if (!mounted) {
    return (
      <div className="mt-6 h-[52px] rounded-xl border border-slate-200 bg-white" aria-hidden />
    )
  }

  if (existing) {
    return (
      <div className="mt-6 space-y-3">
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-[13px] leading-5">
          <div>
            <p className="text-slate-600">Reporting as</p>
            <p className="text-slate-900">
              <span className="font-medium">{existing.name}</span>
              <span className="text-slate-400"> · {existing.phone}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onSwitch}
            className="text-[13px] font-medium text-indigo-700 underline hover:text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          >
            Not you? Switch
          </button>
        </div>
        <button
          type="button"
          onClick={onContinueExisting}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 px-6 text-[15px] font-medium text-white transition hover:bg-indigo-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/40"
        >
          Continue
          <ArrowRight className="h-4 w-4" strokeWidth={1.8} aria-hidden />
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
      <div>
        <label
          htmlFor="sr-name"
          className="block text-[13px] font-medium text-slate-900"
        >
          Your name
        </label>
        <input
          id="sr-name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 block w-full min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-[15px] text-slate-900 outline-none focus:ring-4 focus:ring-indigo-500/40"
          placeholder="Full name"
          required
        />
      </div>

      <div>
        <label
          htmlFor="sr-phone"
          className="block text-[13px] font-medium text-slate-900"
        >
          Phone number
        </label>
        <input
          id="sr-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="mt-1 block w-full min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-[15px] text-slate-900 outline-none focus:ring-4 focus:ring-indigo-500/40"
          placeholder="+91 98xxx xxxxx"
          required
        />
      </div>

      {err && (
        <p className="rounded-md bg-orange-100 px-3 py-2 text-[13px] text-orange-700">
          {err}
        </p>
      )}

      <button
        type="submit"
        className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-700 px-6 text-[15px] font-medium text-white transition hover:bg-indigo-900 focus:outline-none focus:ring-4 focus:ring-indigo-500/40"
      >
        Continue
        <ArrowRight className="h-4 w-4" strokeWidth={1.8} aria-hidden />
      </button>

      <p className="text-center text-[11px] uppercase tracking-wide text-slate-400">
        Anonymous to store manager
      </p>
    </form>
  )
}
