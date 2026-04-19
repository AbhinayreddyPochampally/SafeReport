/**
 * Reporter-side client state for the six-screen flow.
 *
 * Two surfaces:
 *   1. Reporter PROFILE (name + phone) — persists across sessions in
 *      localStorage under `sr_reporter_profile`. Autofilled on repeat visits.
 *      Role classification was intentionally removed — the reporter is
 *      anonymous to the store manager regardless of employment status.
 *   2. Report DRAFT (category, event_at, voice blob, photo blob) — lives
 *      only for the current tab. The serializable bits go to sessionStorage;
 *      Blobs are stashed in a module-level Map keyed by a short draft id that
 *      IS serialized. Closing the tab wipes the blobs entirely.
 *
 * Server components never import this module — it's client-only.
 */

export type ReporterProfile = {
  name: string
  phone: string
}

export type ReportCategory =
  | "near_miss"
  | "unsafe_act"
  | "unsafe_condition"
  | "first_aid_case"
  | "medical_treatment_case"
  | "restricted_work_case"
  | "lost_time_injury"
  | "fatality"

export type DraftBlobs = {
  audio?: Blob
  photo?: Blob
}

export type ReportDraft = {
  draftId: string
  sap_code: string
  category?: ReportCategory
  /** ISO 8601, selected via the wheel picker on screen 4. */
  event_at?: string
  /**
   * Free-text fallback entered on the Evidence screen. Counts toward the
   * submit rule "photo + (voice OR text)" — 20–500 chars when present.
   */
  description_text?: string
}

const PROFILE_KEY = "sr_reporter_profile"
const DRAFT_KEY = "sr_report_draft"

// Per-tab in-memory blob store. Survives soft navigations, dies with the tab.
const blobStore = new Map<string, DraftBlobs>()

export function isBrowser() {
  return typeof window !== "undefined"
}

// ---- Profile (localStorage) ---------------------------------------------

export function readProfile(): ReporterProfile | null {
  if (!isBrowser()) return null
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed.name === "string" &&
      typeof parsed.phone === "string"
    ) {
      return { name: parsed.name, phone: parsed.phone }
    }
    return null
  } catch {
    return null
  }
}

export function writeProfile(p: ReporterProfile) {
  if (!isBrowser()) return
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(p))
}

export function clearProfile() {
  if (!isBrowser()) return
  window.localStorage.removeItem(PROFILE_KEY)
}

// ---- Draft (sessionStorage + in-memory blobs) ----------------------------

function newDraftId() {
  // 12 hex chars is plenty; draft is client-only and never hits the DB.
  return Math.random().toString(16).slice(2, 14)
}

export function readDraft(): ReportDraft | null {
  if (!isBrowser()) return null
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (
      parsed &&
      typeof parsed.draftId === "string" &&
      typeof parsed.sap_code === "string"
    ) {
      return parsed as ReportDraft
    }
    return null
  } catch {
    return null
  }
}

export function writeDraft(patch: Partial<ReportDraft> & { sap_code: string }) {
  if (!isBrowser()) return null as unknown as ReportDraft
  const existing = readDraft()
  const next: ReportDraft =
    existing && existing.sap_code === patch.sap_code
      ? { ...existing, ...patch }
      : { draftId: newDraftId(), ...patch }
  window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next))
  return next
}

export function clearDraft() {
  if (!isBrowser()) return
  const existing = readDraft()
  if (existing) blobStore.delete(existing.draftId)
  window.sessionStorage.removeItem(DRAFT_KEY)
}

// ---- Blobs (in-memory) ---------------------------------------------------

export function setDraftAudio(draftId: string, blob: Blob) {
  const bucket = blobStore.get(draftId) ?? {}
  bucket.audio = blob
  blobStore.set(draftId, bucket)
}

export function setDraftPhoto(draftId: string, blob: Blob) {
  const bucket = blobStore.get(draftId) ?? {}
  bucket.photo = blob
  blobStore.set(draftId, bucket)
}

export function getDraftBlobs(draftId: string): DraftBlobs {
  return blobStore.get(draftId) ?? {}
}
