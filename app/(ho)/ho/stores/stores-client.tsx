"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  QrCode,
  Search,
  Sparkles,
  Store as StoreIcon,
  Upload,
  X,
} from "lucide-react"

/**
 * HO store registry — client surface.
 *
 * Renders a searchable/filterable table of the full store roster plus:
 *   - "Add store" button (POST /api/ho-stores)
 *   - Inline edit modal (PATCH /api/ho-stores)
 *   - Password reset (replaces the old PIN — see migration 002)
 *   - Per-store QR download (GET /api/qr/[sap_code]?download=1)
 *   - "Download all QRs" bulk action (sequential per-store fetch)
 *   - "New" marker + filter for stores whose QR hasn't been distributed yet
 *   - CSV import (POST multipart /api/excel/stores)
 *
 * Two warning flags surface common pilot footguns:
 *   - `has_password === false` → manager cannot log in
 *   - `status !== 'active'`     → store hidden from most dashboards
 */

export type StoreStatus = "active" | "temporarily_closed" | "permanently_closed"

export type StoreRow = {
  sap_code: string
  name: string
  brand: string
  city: string
  state: string
  location: string | null
  manager_name: string | null
  manager_phone: string | null
  has_password: boolean
  status: StoreStatus
  opening_date: string | null
  report_count: number
  qr_downloaded_at: string | null
  created_at: string | null
}

const STATUS_OPTIONS: ReadonlyArray<"all" | StoreStatus> = [
  "all",
  "active",
  "temporarily_closed",
  "permanently_closed",
]

export function StoresClient({ rows }: { rows: StoreRow[] }) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [brandFilter, setBrandFilter] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<"all" | StoreStatus>("all")
  const [showNewOnly, setShowNewOnly] = useState(false)
  const [editing, setEditing] = useState<StoreRow | null>(null)
  const [adding, setAdding] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [bulkBusy, setBulkBusy] = useState<{ done: number; total: number } | null>(null)
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null)

  const brands = useMemo(
    () => Array.from(new Set(rows.map((r) => r.brand))).sort(),
    [rows],
  )

  const newCount = useMemo(
    () => rows.filter((r) => !r.qr_downloaded_at).length,
    [rows],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (brandFilter && r.brand !== brandFilter) return false
      if (statusFilter !== "all" && r.status !== statusFilter) return false
      if (showNewOnly && r.qr_downloaded_at) return false
      if (!q) return true
      return (
        r.sap_code.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.city.toLowerCase().includes(q) ||
        r.state.toLowerCase().includes(q) ||
        (r.manager_name ?? "").toLowerCase().includes(q) ||
        (r.manager_phone ?? "").toLowerCase().includes(q)
      )
    })
  }, [rows, query, brandFilter, statusFilter, showNewOnly])

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  function onSaved(ok: boolean, msg: string) {
    setEditing(null)
    setAdding(false)
    setToast({ kind: ok ? "ok" : "err", msg })
    if (ok) router.refresh()
  }

  function onImported(ok: boolean, msg: string) {
    setImportOpen(false)
    setToast({ kind: ok ? "ok" : "err", msg })
    if (ok) router.refresh()
  }

  /** Single-store poster download — server returns a printable A4 PDF with
   * the QR embedded into the user's poster template. */
  function downloadQr(sap: string) {
    const url = `/api/qr/${encodeURIComponent(sap)}?download=1`
    const a = document.createElement("a")
    a.href = url
    a.rel = "noopener"
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Give the server a beat to mark qr_downloaded_at, then refresh so the
    // "New" badge clears for this row.
    setTimeout(() => router.refresh(), 800)
  }

  /** Bulk poster download — single multi-page PDF, one A4 page per store.
   * Server picks scope=new (only stores without a QR yet) by default; if
   * none are new we send scope=all. */
  async function downloadAllQrs(targets: StoreRow[]) {
    if (targets.length === 0) return
    setBulkBusy({ done: 0, total: targets.length })
    try {
      // Send explicit codes so the bulk matches exactly what the user sees
      // (respects their current filter). Avoids server/client drift on what
      // counts as "new".
      const codes = targets.map((t) => t.sap_code).join(",")
      const url = `/api/qr/bulk?codes=${encodeURIComponent(codes)}&download=1`
      const res = await fetch(url)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = blobUrl
      a.download = `safereport-posters-${targets.length}-stores.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(blobUrl)
      setToast({
        kind: "ok",
        msg: `Downloaded ${targets.length} poster${targets.length === 1 ? "" : "s"} as a single PDF.`,
      })
    } catch (err) {
      setToast({
        kind: "err",
        msg: err instanceof Error ? err.message : "Bulk download failed.",
      })
    } finally {
      setBulkBusy(null)
      router.refresh()
    }
  }

  const totals = useMemo(() => {
    let active = 0
    let missingPassword = 0
    for (const r of rows) {
      if (r.status === "active") active += 1
      if (!r.has_password) missingPassword += 1
    }
    return { total: rows.length, active, missingPassword }
  }, [rows])

  return (
    <div className="max-w-[1400px] mx-auto px-8 py-8">
      {/* Page header --------------------------------------------------- */}
      <header className="mb-6">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Pilot · ABFRL
        </p>
        <div className="mt-1 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-[26px] font-semibold tracking-tight text-slate-900">
              Stores
            </h1>
            <p className="mt-1 text-[13px] text-slate-600">
              All {totals.total} pilot stores · {totals.active} active ·{" "}
              {totals.missingPassword === 0 ? (
                <span className="text-teal-700">all have manager passwords</span>
              ) : (
                <span className="text-orange-700">
                  {totals.missingPassword} missing password
                </span>
              )}
              {newCount > 0 && (
                <>
                  {" · "}
                  <span className="text-indigo-700 font-medium">
                    {newCount} new (QR not distributed)
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() =>
                downloadAllQrs(
                  showNewOnly || newCount > 0
                    ? rows.filter((r) => !r.qr_downloaded_at)
                    : rows,
                )
              }
              disabled={bulkBusy !== null}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              title={
                newCount > 0
                  ? `Download ${newCount} QR code(s) for stores without a distributed QR`
                  : "Download QR codes for all stores"
              }
            >
              {bulkBusy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {bulkBusy.done}/{bulkBusy.total}
                </>
              ) : (
                <>
                  <QrCode className="h-4 w-4" />
                  {newCount > 0
                    ? `Download ${newCount} new QR${newCount === 1 ? "" : "s"}`
                    : "Download all QRs"}
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
            >
              <Upload className="h-4 w-4" />
              Import CSV
            </button>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-700 hover:bg-indigo-800 px-3 py-2 text-[13px] font-semibold text-white"
            >
              <Plus className="h-4 w-4" />
              Add store
            </button>
          </div>
        </div>
      </header>

      {/* Filter bar --------------------------------------------------- */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[260px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search SAP code, store, city, manager, phone…"
              className="w-full h-9 pl-9 pr-3 text-[13.5px] border border-slate-300 rounded-md focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowNewOnly(!showNewOnly)}
            className={`inline-flex items-center gap-1.5 px-3 h-9 text-[12.5px] font-medium rounded-md border transition-colors ${
              showNewOnly
                ? "bg-indigo-700 text-white border-indigo-700"
                : "bg-white text-slate-700 border-slate-300 hover:border-indigo-400"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            New only
            {newCount > 0 && (
              <span
                className={`ml-1 inline-flex items-center justify-center rounded px-1.5 text-[10.5px] font-bold ${
                  showNewOnly
                    ? "bg-white text-indigo-700"
                    : "bg-indigo-100 text-indigo-700"
                }`}
              >
                {newCount}
              </span>
            )}
          </button>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap mt-3">
          <span className="text-[11px] text-slate-500 mr-1">Status:</span>
          {STATUS_OPTIONS.map((s) => (
            <FilterChip
              key={s}
              active={statusFilter === s}
              onClick={() => setStatusFilter(s)}
            >
              {s === "all" ? "All" : humanStatus(s)}
            </FilterChip>
          ))}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap mt-2">
          <span className="text-[11px] text-slate-500 mr-1">Brand:</span>
          <FilterChip
            active={brandFilter === null}
            onClick={() => setBrandFilter(null)}
          >
            All
          </FilterChip>
          {brands.map((b) => (
            <FilterChip
              key={b}
              active={brandFilter === b}
              onClick={() => setBrandFilter(b)}
            >
              {b}
            </FilterChip>
          ))}
        </div>
      </div>

      {/* Table ------------------------------------------------------- */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-slate-50 text-slate-500 text-[10.5px] uppercase tracking-wide font-bold">
            <tr>
              <th className="text-left px-4 py-2.5 w-[110px]">SAP code</th>
              <th className="text-left px-4 py-2.5">Store</th>
              <th className="text-left px-4 py-2.5 w-[120px]">Brand</th>
              <th className="text-left px-4 py-2.5 w-[150px]">City · State</th>
              <th className="text-left px-4 py-2.5 w-[200px]">Manager</th>
              <th className="text-left px-4 py-2.5 w-[120px]">Status</th>
              <th className="text-right px-4 py-2.5 w-[80px]">Reports</th>
              <th className="text-right px-4 py-2.5 w-[180px]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-12 text-center text-[13px] text-slate-500"
                >
                  No stores match the current filters.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.sap_code} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[12px] text-slate-800">
                        {r.sap_code}
                      </span>
                      {!r.qr_downloaded_at && (
                        <span
                          title="QR not yet downloaded — distribute to this store"
                          className="inline-flex items-center gap-0.5 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-700 border border-indigo-200"
                        >
                          <Sparkles className="h-2.5 w-2.5" />
                          New
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      <StoreIcon className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-slate-900 font-medium truncate">
                          {r.name}
                        </div>
                        {r.location && (
                          <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                            {r.location}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{r.brand}</td>
                  <td className="px-4 py-3 text-slate-700 text-[12.5px]">
                    {r.city} · {r.state}
                  </td>
                  <td className="px-4 py-3">
                    {r.manager_name ? (
                      <div>
                        <div className="text-slate-800 truncate">
                          {r.manager_name}
                        </div>
                        {r.manager_phone && (
                          <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                            {r.manager_phone}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-[11.5px] text-slate-400">—</span>
                    )}
                    {!r.has_password && (
                      <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-orange-700">
                        <AlertTriangle className="h-3 w-3" />
                        No password set
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                    {r.report_count}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => downloadQr(r.sap_code)}
                        title="Download QR poster"
                        className="inline-flex items-center gap-1 px-2 h-8 text-[11.5px] text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50"
                      >
                        <QrCode className="h-3.5 w-3.5" />
                        QR
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(r)}
                        className="inline-flex items-center gap-1 px-2 h-8 text-[11.5px] text-slate-700 border border-slate-300 rounded-md hover:bg-slate-50"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <StoreFormModal
          mode="edit"
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}

      {adding && (
        <StoreFormModal
          mode="create"
          onClose={() => setAdding(false)}
          onSaved={onSaved}
        />
      )}

      {importOpen && (
        <CsvImportModal
          onClose={() => setImportOpen(false)}
          onDone={onImported}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50">
          <div
            className={`inline-flex items-start gap-2 px-4 py-3 rounded-md shadow-lg border text-[13px] ${
              toast.kind === "ok"
                ? "bg-teal-50 border-teal-200 text-teal-900"
                : "bg-orange-50 border-orange-200 text-orange-900"
            }`}
          >
            {toast.kind === "ok" ? (
              <CheckCircle2 className="h-4 w-4 text-teal-700 mt-0.5" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-orange-700 mt-0.5" />
            )}
            <span>{toast.msg}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="ml-2 text-slate-500 hover:text-slate-700"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------- Store form modal ------------------------- */

function StoreFormModal({
  mode,
  row,
  onClose,
  onSaved,
}: {
  mode: "edit" | "create"
  row?: StoreRow
  onClose: () => void
  onSaved: (ok: boolean, msg: string) => void
}) {
  const [form, setForm] = useState({
    sap_code: row?.sap_code ?? "",
    name: row?.name ?? "",
    brand: row?.brand ?? "",
    city: row?.city ?? "",
    state: row?.state ?? "",
    location: row?.location ?? "",
    manager_name: row?.manager_name ?? "",
    manager_phone: row?.manager_phone ?? "",
    status: (row?.status ?? "active") as StoreStatus,
    new_password: "",
  })
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setError(null)
    if (mode === "create" && !/^[A-Z0-9][A-Z0-9-]{1,20}$/.test(form.sap_code.trim().toUpperCase())) {
      setError("SAP code must be uppercase letters/digits/dashes (e.g. PNT-MUM-047).")
      return
    }
    if (form.new_password && (form.new_password.length < 6 || form.new_password.length > 128)) {
      setError("Password must be 6–128 characters.")
      return
    }
    if (
      !form.name.trim() ||
      !form.brand.trim() ||
      !form.city.trim() ||
      !form.state.trim()
    ) {
      setError("Name, brand, city, and state are required.")
      return
    }
    if (mode === "create" && !form.new_password) {
      setError(
        "Set a manager password — without one the store can't accept logins.",
      )
      return
    }

    setBusy(true)
    try {
      const payload = {
        sap_code: mode === "create" ? form.sap_code.trim().toUpperCase() : row!.sap_code,
        name: form.name.trim(),
        brand: form.brand.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        location: form.location.trim() || null,
        manager_name: form.manager_name.trim() || null,
        manager_phone: form.manager_phone.trim() || null,
        status: form.status,
        ...(form.new_password ? { new_password: form.new_password } : {}),
      }
      const resp = await fetch("/api/ho-stores", {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        onSaved(false, body.error ?? `Save failed (${resp.status}).`)
        return
      }
      onSaved(
        true,
        mode === "create"
          ? `${payload.sap_code} added.`
          : `${payload.sap_code} updated.`,
      )
    } catch (e) {
      onSaved(false, e instanceof Error ? e.message : "Network error.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      onClose={onClose}
      title={mode === "create" ? "Add new store" : `Edit ${row!.sap_code}`}
    >
      <div className="space-y-4">
        {mode === "create" && (
          <Field label="SAP code">
            <input
              type="text"
              value={form.sap_code}
              onChange={(e) =>
                setForm({ ...form, sap_code: e.target.value.toUpperCase() })
              }
              placeholder="e.g. PNT-MUM-047"
              className={inputCls + " font-mono"}
              autoFocus
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Uppercase letters, digits, and dashes. Used in the QR poster URL.
            </p>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Store name">
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Brand">
            <input
              type="text"
              value={form.brand}
              onChange={(e) => setForm({ ...form, brand: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="City">
            <input
              type="text"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="State">
            <input
              type="text"
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
              className={inputCls}
            />
          </Field>
        </div>
        <Field label="Location / mall">
          <input
            type="text"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            className={inputCls}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Manager name">
            <input
              type="text"
              value={form.manager_name}
              onChange={(e) => setForm({ ...form, manager_name: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Manager phone">
            <input
              type="tel"
              value={form.manager_phone}
              onChange={(e) => setForm({ ...form, manager_phone: e.target.value })}
              className={inputCls}
            />
          </Field>
        </div>
        <Field label="Status">
          <select
            value={form.status}
            onChange={(e) =>
              setForm({ ...form, status: e.target.value as StoreStatus })
            }
            className={inputCls}
          >
            <option value="active">Active</option>
            <option value="temporarily_closed">Temporarily closed</option>
            <option value="permanently_closed">Permanently closed</option>
          </select>
        </Field>

        {/* Password reset / set */}
        <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
          <div className="flex items-center gap-2 mb-2">
            <KeyRound className="h-4 w-4 text-slate-500" />
            <span className="text-[13px] font-medium text-slate-700">
              {mode === "create"
                ? "Set manager password"
                : row?.has_password
                  ? "Reset manager password"
                  : "Set manager password"}
            </span>
          </div>
          <p className="text-[11.5px] text-slate-500 mb-2">
            {mode === "create"
              ? "Set the password the manager will use to sign in. Share it securely (call them, don't text)."
              : row?.has_password
                ? "Leave blank to keep the existing password. Enter a new value to replace it — the old password stops working immediately."
                : "Set the password so this store can accept manager logins."}
          </p>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={form.new_password}
              onChange={(e) => setForm({ ...form, new_password: e.target.value })}
              placeholder="6–128 characters"
              className={inputCls + " pr-10"}
              minLength={6}
              maxLength={128}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[11.5px] text-slate-500 hover:text-slate-700 px-1"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        {error && (
          <div className="text-[12.5px] text-orange-700 bg-orange-50 border border-orange-200 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-3 h-9 text-[13px] text-slate-700 hover:bg-slate-50 rounded-md"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 h-9 bg-indigo-700 hover:bg-indigo-800 text-white text-[13px] font-semibold rounded-md disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {mode === "create" ? "Create store" : "Save changes"}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* ------------------------------- CSV import ------------------------------ */

function CsvImportModal({
  onClose,
  onDone,
}: {
  onClose: () => void
  onDone: (ok: boolean, msg: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [prune, setPrune] = useState(false)
  const [result, setResult] = useState<{
    inserted: number
    updated: number
    skipped: number
    pruned: number
    errors: string[]
  } | null>(null)

  async function upload(file: File) {
    setBusy(true)
    setResult(null)
    try {
      const fd = new FormData()
      fd.append("file", file)
      if (prune) fd.append("prune", "1")
      const resp = await fetch("/api/excel/stores", {
        method: "POST",
        body: fd,
      })
      const body = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        onDone(false, body.error ?? `Import failed (${resp.status}).`)
        return
      }
      setResult({
        inserted: body.inserted ?? 0,
        updated: body.updated ?? 0,
        skipped: body.skipped ?? 0,
        pruned: body.pruned ?? 0,
        errors: body.errors ?? [],
      })
    } catch (e) {
      onDone(false, e instanceof Error ? e.message : "Network error.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose} title="Import stores from CSV">
      <div className="space-y-4">
        <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-[12px] text-slate-600 leading-relaxed">
          <div className="font-medium text-slate-800 mb-1">Expected columns</div>
          <code className="block font-mono text-[11px] text-slate-700">
            sap_code,name,brand,city,state,location,manager_name,manager_phone,password,status
          </code>
          <p className="mt-2">
            <strong>sap_code</strong> is the key — rows upsert by it.{" "}
            <strong>password</strong> (6–128 chars, plain) gets hashed
            server-side before storage.{" "}
            <strong>status</strong> must be <code>active</code>,{" "}
            <code>temporarily_closed</code>, or <code>permanently_closed</code>.
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) upload(f)
          }}
          className="hidden"
        />
        {!result && (
          <>
            <label className="flex items-start gap-2.5 cursor-pointer p-3 rounded-md border border-slate-200 bg-white hover:bg-slate-50">
              <input
                type="checkbox"
                checked={prune}
                onChange={(e) => setPrune(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-indigo-700"
                disabled={busy}
              />
              <div className="flex-1">
                <div className="text-[13px] font-medium text-slate-800">
                  Treat this CSV as the master list
                </div>
                <div className="text-[11.5px] text-slate-500 mt-0.5">
                  Active stores not in this CSV will be marked{" "}
                  <span className="font-medium">permanently closed</span>.
                  Reports stay intact for audit. Use this when the CSV is your
                  full pilot roster, not a partial update.
                </div>
              </div>
            </label>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="w-full h-28 border-2 border-dashed border-slate-300 rounded-md text-slate-600 hover:bg-slate-50 flex flex-col items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin text-indigo-700" />
                  <span className="text-[13px]">Processing…</span>
                </>
              ) : (
                <>
                  <Upload className="h-5 w-5" />
                  <span className="text-[13px]">Click to choose CSV</span>
                </>
              )}
            </button>
          </>
        )}
        {result && (
          <div className="space-y-2">
            <div className="grid grid-cols-4 gap-2">
              <ResultPill label="Inserted" value={result.inserted} tone="teal" />
              <ResultPill label="Updated" value={result.updated} tone="indigo" />
              <ResultPill label="Skipped" value={result.skipped} tone="slate" />
              <ResultPill label="Pruned" value={result.pruned} tone="orange" />
            </div>
            {result.errors.length > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-md p-3">
                <div className="text-[13px] font-medium text-orange-900 mb-1">
                  {result.errors.length} row{result.errors.length === 1 ? "" : "s"} skipped
                </div>
                <ul className="text-[11.5px] text-orange-800 space-y-0.5 list-disc pl-4 max-h-32 overflow-auto">
                  {result.errors.slice(0, 20).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          {result ? (
            <button
              type="button"
              onClick={() =>
                onDone(true, `${result.inserted + result.updated} stores imported.`)
              }
              className="px-4 h-9 bg-indigo-700 hover:bg-indigo-800 text-white text-[13px] font-semibold rounded-md"
            >
              Done
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="px-3 h-9 text-[13px] text-slate-700 hover:bg-slate-50 rounded-md"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

/* --------------------------- Small shared bits --------------------------- */

const inputCls =
  "w-full h-9 px-3 text-[13.5px] border border-slate-300 rounded-md focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"

function Modal({
  title,
  children,
  onClose,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-xl max-h-[calc(100vh-2rem)] overflow-auto"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 sticky top-0 bg-white">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-[11.5px] font-medium text-slate-600 mb-1">{label}</span>
      {children}
    </label>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "px-2.5 h-7 text-[11.5px] rounded-full border transition-colors " +
        (active
          ? "bg-indigo-700 border-indigo-700 text-white"
          : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50")
      }
    >
      {children}
    </button>
  )
}

function StatusPill({ status }: { status: StoreStatus }) {
  const cfg = {
    active: {
      label: "Active",
      cls: "bg-teal-50 text-teal-800 border-teal-200",
    },
    temporarily_closed: {
      label: "Temp. closed",
      cls: "bg-orange-50 text-orange-800 border-orange-200",
    },
    permanently_closed: {
      label: "Closed",
      cls: "bg-slate-100 text-slate-600 border-slate-200",
    },
  }[status]
  return (
    <span
      className={`inline-flex items-center px-2 h-6 text-[11px] rounded-md border ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  )
}

function ResultPill({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: "teal" | "indigo" | "slate" | "orange"
}) {
  const cls = {
    teal: "bg-teal-50 border-teal-200 text-teal-900",
    indigo: "bg-indigo-50 border-indigo-200 text-indigo-900",
    slate: "bg-slate-50 border-slate-200 text-slate-700",
    orange: "bg-orange-50 border-orange-200 text-orange-900",
  }[tone]
  return (
    <div className={`border rounded-md px-3 py-2 ${cls}`}>
      <div className="text-[11.5px]">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  )
}

function humanStatus(s: StoreStatus): string {
  switch (s) {
    case "active":
      return "Active"
    case "temporarily_closed":
      return "Temp. closed"
    case "permanently_closed":
      return "Closed"
  }
}
