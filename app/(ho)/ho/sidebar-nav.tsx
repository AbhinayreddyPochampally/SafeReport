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
 * Overview / Reports / Analytics / Stores. No Notifications, no Settings,
 * no Help — those would be empty surfaces in the pilot.
 *
 * Optional `count` lets the server pass per-tab counters (e.g. how many
 * reports are awaiting HO action) so the sidebar can render a numeric badge
 * next to the label without the client having to re-query.
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
  {
    href: "/ho",
    label: "Overview",
    icon: LayoutDashboard,
    countKey: "overview",
  },
  {
    href: "/ho/action",
    label: "Action",
    icon: AlertCircle,
    countKey: "action",
    urgentKey: "action_breached",
    matchPrefix: "/ho/action",
  },
  {
    href: "/ho/all-reports",
    label: "Reports",
    icon: FileText,
    countKey: "reports",
    matchPrefix: "/ho/all-reports",
  },
  { href: "/ho/analytics", label: "Analytics", icon: BarChart3 },
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
    <nav className="px-3 py-2" aria-label="Primary">
      <p className="px-3 pt-1 pb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-indigo-600/80">
        Pilot
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
                // Active state: full indigo wash + left accent bar, so the
                // current tab reads as branded rather than a slate-grey fill.
                // Hover state on inactive items: soft indigo lift, telling
                // the eye "this is interactive" with colour rather than
                // monochrome grey.
                className={`group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] transition-colors relative ${
                  active
                    ? "bg-gradient-to-r from-indigo-100 to-indigo-50 text-indigo-900 font-semibold ring-1 ring-indigo-200/80 shadow-sm"
                    : "text-slate-700 hover:bg-indigo-50/60 hover:text-indigo-900"
                }`}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-indigo-600"
                  />
                )}
                <item.icon
                  className={`h-4 w-4 shrink-0 ${
                    active
                      ? "text-indigo-700"
                      : urgent
                        ? "text-orange-700"
                        : "text-indigo-500/80 group-hover:text-indigo-700"
                  }`}
                  strokeWidth={1.8}
                  aria-hidden
                />
                <span className="flex-1 truncate">{item.label}</span>
                {typeof count === "number" && count > 0 && (
                  <span
                    className={`inline-flex items-center justify-center rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums ${
                      urgent
                        ? "bg-orange-100 text-orange-800 ring-1 ring-orange-200"
                        : active
                          ? "bg-white text-indigo-700 ring-1 ring-indigo-200"
                          : "bg-indigo-100/70 text-indigo-700"
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
