"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  AlertCircle,
  BarChart3,
  FileText,
  LayoutDashboard,
  Store,
  type LucideIcon,
} from "lucide-react"

/**
 * Sidebar navigation for /ho/* routes.
 *
 * Active-state styling is driven by `usePathname()` so the highlight tracks
 * client navigation without a refresh. We deliberately keep the nav lean —
 * Overview / Action / Reports / Analytics / Stores. No Notifications, no
 * Settings, no Help — those would be empty surfaces in the pilot.
 *
 * Optional `count` lets the server pass per-tab counters (e.g. how many
 * reports are awaiting HO action) so the sidebar can render a numeric badge
 * next to the label without the client having to re-query.
 *
 * REDESIGN (May 2026):
 *   Light-rail variant — paired with the white sidebar shell in layout.tsx.
 *   Active row: indigo-50 fill, indigo-900 text, indigo-700 numeric badge.
 *   Urgent (Action with breached count > 0): orange-700 fill on the badge
 *   only — the label stays slate so the row still reads as a normal nav
 *   item, the badge does the alert work. The old dark-bg gradient active
 *   state and white-on-navy badges are gone with the navy sidebar.
 */

export type SidebarCounts = {
  overview?: number
  reports?: number
  stores?: number
  action?: number
  action_breached?: number
}

type Item = {
  href: string
  label: string
  icon: LucideIcon
  /** Used for activity badges. Falsy = no badge rendered. */
  countKey?: keyof SidebarCounts
  /** When pathname starts with this (in addition to exact match), treat as active. */
  matchPrefix?: string
  /** When true and the badge count > 0, tint the badge orange to signal urgency. */
  urgentKey?: keyof SidebarCounts
}

const ITEMS: Item[] = [
  // No count on Overview — it's a dashboard, not an inbox. Earlier rev
  // surfaced the awaiting_ho count here which conflated "things to act
  // on" with "snapshot of the program" and the user reported the
  // number as meaningless ("what is the 10th number on the sidebar tab
  // for overview?").
  {
    href: "/ho",
    label: "Overview",
    icon: LayoutDashboard,
  },
  // Action IS an inbox — keep the count + the breach-flag tint.
  {
    href: "/ho/action",
    label: "Action",
    icon: AlertCircle,
    countKey: "action",
    urgentKey: "action_breached",
    matchPrefix: "/ho/action",
  },
  // No count on Reports either — the page renders the full roster under
  // filters; a single number next to the label would either disagree with
  // the visible row count (when filters are on) or duplicate it (when
  // they're off). Both options were wrong.
  {
    href: "/ho/all-reports",
    label: "Reports",
    icon: FileText,
    matchPrefix: "/ho/all-reports",
  },
  { href: "/ho/analytics", label: "Analytics", icon: BarChart3 },
  // Stores keeps its count — it's an authoritative "how many active
  // stores in the pilot" number and matches what HO would re-derive
  // from the table below.
  {
    href: "/ho/stores",
    label: "Stores",
    icon: Store,
    countKey: "stores",
    matchPrefix: "/ho/stores",
  },
]

export function SidebarNav({ counts }: { counts: SidebarCounts }) {
  const pathname = usePathname()

  function isActive(item: Item): boolean {
    if (item.matchPrefix && pathname.startsWith(item.matchPrefix)) return true
    return pathname === item.href
  }

  return (
    // Light-rail navigation. Slate text on white bg, hover lifts to slate-100,
    // active item gets an indigo-50 wash + indigo-900 text. No left accent
    // bar — the indigo fill carries the active read cleanly without competing
    // with the row content.
    <nav className="px-2.5 py-2" aria-label="Primary">
      <p className="px-2.5 pt-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
        Workspace
      </p>
      <ul className="space-y-0.5">
        {ITEMS.map((item) => {
          const active = isActive(item)
          const count = item.countKey ? counts[item.countKey] : undefined
          const urgent =
            item.urgentKey && (counts[item.urgentKey] ?? 0) > 0
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                // Eager prefetch the four primary HO tabs. Each one is a
                // dynamic server-rendered page and the cold-fetch round
                // trip is the dominant slowness the user feels on tab
                // switch. Prefetching on mount + hover lets the RSC
                // payload be ready in cache by the time the user clicks.
                prefetch
                className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors ${
                  active
                    ? "bg-indigo-50 text-indigo-900 font-semibold"
                    : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <item.icon
                  className={`h-4 w-4 shrink-0 ${
                    active
                      ? "text-indigo-700"
                      : urgent
                        ? "text-orange-700"
                        : "text-slate-500 group-hover:text-slate-700"
                  }`}
                  strokeWidth={1.8}
                  aria-hidden
                />
                <span className="flex-1 truncate">{item.label}</span>
                {typeof count === "number" && count > 0 && (
                  <span
                    className={`inline-flex items-center justify-center rounded-full px-[7px] py-[1px] text-[11px] font-semibold tabular-nums min-w-[22px] ${
                      urgent
                        ? "bg-orange-700 text-white"
                        : active
                          ? "bg-indigo-700 text-white"
                          : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
