import type { LucideIcon } from "lucide-react"
import {
  Accessibility,
  AlertTriangle,
  Bandage,
  CalendarX2,
  Cross,
  HardHat,
  PackageOpen,
  Ribbon,
} from "lucide-react"
import type { ReportCategory } from "./reporter-state"

export type CategoryKind = "observation" | "incident"

export type CategoryDef = {
  key: ReportCategory
  kind: CategoryKind
  icon: LucideIcon
  /** Short label, English only (the pilot dropped Hindi/Marathi labels). */
  label: string
  /** Optional acronym shown after the label, e.g. "(FAC)". */
  acronym?: string
  /** One-line description shown below the label. */
  blurb: string
}

// Icon choices track the team's reference imagery:
//   Near Miss         → PackageOpen  (box with motion lines / falling box)
//   Unsafe Act        → HardHat      (person in safety gear — hat proxy)
//   Unsafe Condition  → AlertTriangle (caution triangle)
//   First Aid Case    → Bandage
//   Medical Treatment → Cross        (medical plus)
//   Restricted Work   → Accessibility (movement-limited figure)
//   Lost Time Injury  → CalendarX2   (days off work)
//   Fatality          → Ribbon       (mourning ribbon)
//
// Lucide renders all of these at a single stroke-weight, which keeps the
// visual rhythm of the vertical list consistent.
export const CATEGORIES: readonly CategoryDef[] = [
  // Observations — no injury occurred (Slate 600 accent)
  {
    key: "near_miss",
    kind: "observation",
    icon: PackageOpen,
    label: "Near Miss",
    blurb: "An event with potential for harm, but no injury occurred.",
  },
  {
    key: "unsafe_act",
    kind: "observation",
    icon: HardHat,
    label: "Unsafe Act",
    blurb: "A deviation from safety procedures by an individual.",
  },
  {
    key: "unsafe_condition",
    kind: "observation",
    icon: AlertTriangle,
    label: "Unsafe Condition",
    blurb: "An environmental hazard that could cause harm.",
  },
  // Incidents — injury occurred (Amber 700 accent)
  {
    key: "first_aid_case",
    kind: "incident",
    icon: Bandage,
    label: "First Aid Case",
    acronym: "FAC",
    blurb: "Minor injury, treated on-site.",
  },
  {
    key: "medical_treatment_case",
    kind: "incident",
    icon: Cross,
    label: "Medical Treatment",
    acronym: "MTC",
    blurb: "Requires professional medical care.",
  },
  {
    key: "restricted_work_case",
    kind: "incident",
    icon: Accessibility,
    label: "Restricted Work",
    acronym: "RWC",
    blurb: "Injury limits work duties.",
  },
  {
    key: "lost_time_injury",
    kind: "incident",
    icon: CalendarX2,
    label: "Lost Time Injury",
    acronym: "LTI",
    blurb: "Results in days away from work.",
  },
  {
    key: "fatality",
    kind: "incident",
    icon: Ribbon,
    label: "Fatality",
    blurb: "Resulting in death.",
  },
] as const

/**
 * Legacy helper retained for any callers still referencing a localised label.
 * English-only now; just returns `label`. Safe to remove when all callers
 * have been migrated.
 * @deprecated use `cat.label` directly
 */
export function localLabel(cat: CategoryDef): string {
  return cat.label
}

export type { ReportCategory }
