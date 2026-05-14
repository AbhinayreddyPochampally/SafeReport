/**
 * Shared visual tokens for report status + category surfaces.
 *
 * Why this exists: pill colours for status (New / Acknowledged /
 * Awaiting HO / Returned / Closed / Voided) and category (observation
 * tones vs incident tones) were being re-declared in five different
 * places — Reports table, Manager inbox row, queue cards on Overview,
 * Analytics chart fills, HO report detail badge. The five copies drifted:
 * some used `bg-orange-50`, others `bg-orange-100`, the manager card
 * was `text-orange-700` while the HO card was `text-orange-800`, etc.
 *
 * One source. One palette. Import from here; do not roll your own.
 *
 * Palette rules (from CLAUDE.md):
 *  - Observation tones → Slate family
 *  - Incident tones → Amber family
 *  - Status colours fixed:
 *      new          → Slate 600  → slate pill
 *      in_progress  → Indigo 700 → indigo pill ("Acknowledged")
 *      awaiting_ho  → Sky 700    → sky pill
 *      returned     → Orange 700 → orange pill
 *      closed       → Teal 700   → teal pill ("Closed", not green)
 *      voided       → Slate 600  → slate pill (muted variant)
 *
 * No green-*, no red-*, no rose-*, no crimson-* — guardrails enforce.
 */

export type ReportStatus =
  | "new"
  | "in_progress"
  | "awaiting_ho"
  | "returned"
  | "closed"
  | "voided"

export const STATUS_LABEL: Record<ReportStatus, string> = {
  new: "New",
  in_progress: "Acknowledged",
  awaiting_ho: "Awaiting HO",
  returned: "Returned",
  closed: "Closed",
  voided: "Voided",
}

/** Pill — bordered chip suitable for table cells, list rows, filter
 * controls. Uses the lightest tonal background so the pill reads as
 * an indicator without competing with the row's content. */
export const STATUS_PILL: Record<ReportStatus, string> = {
  new: "bg-slate-50 text-slate-700 border-slate-200",
  in_progress: "bg-indigo-50 text-indigo-700 border-indigo-200",
  awaiting_ho: "bg-sky-50 text-sky-700 border-sky-200",
  returned: "bg-orange-50 text-orange-700 border-orange-200",
  closed: "bg-teal-50 text-teal-700 border-teal-200",
  voided: "bg-slate-100 text-slate-600 border-slate-300",
}

/** Solid fill — for chart bars, donut segments, etc. Hex strings
 * because recharts and inline SVG don't read Tailwind classes. */
export const STATUS_FILL_HEX: Record<ReportStatus, string> = {
  new: "#475569", // slate-600
  in_progress: "#4338CA", // indigo-700
  awaiting_ho: "#0369A1", // sky-700
  returned: "#C2410C", // orange-700
  closed: "#0F766E", // teal-700
  voided: "#94A3B8", // slate-400 — muted, distinguished from new
}

/** Canonical sort order — top of the funnel to terminal states. */
export const STATUS_ORDER: readonly ReportStatus[] = [
  "new",
  "in_progress",
  "awaiting_ho",
  "returned",
  "closed",
  "voided",
]

/* ----------------------------- Categories ------------------------------- */

/** Categories split into two kinds. Observations get slate tones,
 * incidents get amber. Mirrors the CLAUDE.md palette rule. */
export type CategoryKind = "observation" | "incident"

export const CATEGORY_KIND_PILL: Record<CategoryKind, string> = {
  observation: "bg-slate-100 text-slate-700 border-slate-200",
  incident: "bg-amber-50 text-amber-800 border-amber-200",
}

export const CATEGORY_KIND_ACTIVE_PILL: Record<CategoryKind, string> = {
  observation: "bg-slate-700 text-white border-slate-700",
  incident: "bg-amber-700 text-white border-amber-700",
}

/** Marker dot used in compact contexts (queue rows, today strip on
 * Overview). Same family as the pills. */
export const CATEGORY_KIND_DOT: Record<CategoryKind, string> = {
  observation: "bg-slate-400",
  incident: "bg-amber-700",
}

/* -------------------------------- Panels -------------------------------- */

/**
 * Glass-panel background — for any card, table, or section that would
 * otherwise have been pure `bg-white`. Light gradient with a darker
 * lower-right corner gives the surface a soft frosted-glass feel,
 * which is what was missing from the all-white look the user kept
 * calling out. Pair with `border border-slate-200 shadow-sm` for the
 * canonical card chrome, or use PANEL_FULL which bundles both.
 *
 * Two intensities:
 *   GLASS_PANEL       — the everyday card. Subtle gradient that still
 *                       reads clearly as a coloured surface against
 *                       the page background.
 *   GLASS_PANEL_DEEP  — for hero panels (queue cards, attention panel
 *                       on Stores, the leaderboard). Pronounced enough
 *                       that the surface stands out from a row of
 *                       siblings.
 */
export const GLASS_PANEL =
  "bg-gradient-to-br from-white via-slate-50 to-slate-100 border border-slate-200 shadow-sm"

export const GLASS_PANEL_DEEP =
  "bg-gradient-to-br from-white via-slate-100 to-slate-200 border border-slate-200 shadow-sm"
