import type { ReportCategory } from "@/lib/reporter-state"

/**
 * Map a SafeReport category onto the higher-level "observation" or
 * "incident" type. Three categories are observations (no injury
 * occurred), the other five are incidents (someone got hurt).
 *
 * The taxonomy lives in code rather than the database so we can
 * adjust the split without a schema migration — the schema's
 * report_type enum just has the two slugs.
 *
 * Used in two places:
 *   - /api/ho-actions when HO confirms a category, to derive the
 *     `type` column for the row.
 *   - Anywhere that needs to colour or filter by observation vs
 *     incident from a category alone.
 */

const OBSERVATION_KEYS: ReadonlySet<ReportCategory> = new Set<ReportCategory>([
  "near_miss",
  "unsafe_act",
  "unsafe_condition",
])

export type ReportType = "observation" | "incident"

export function typeForCategory(cat: ReportCategory): ReportType {
  return OBSERVATION_KEYS.has(cat) ? "observation" : "incident"
}

/**
 * Hard rule from the AI Classification design doc: Fatality and LTI
 * always require an explicit HO dropdown selection — single-button
 * "confirm AI's pick" is disabled when the final category is one of
 * these two. The asymmetry argument: undercounting a fatality has
 * legal + insurance consequences much larger than the cost of a
 * single extra dropdown click.
 */
const SEVERITY_FLOOR: ReadonlySet<ReportCategory> = new Set<ReportCategory>([
  "lost_time_injury",
  "fatality",
])

export function isSeverityFloor(cat: ReportCategory): boolean {
  return SEVERITY_FLOOR.has(cat)
}
