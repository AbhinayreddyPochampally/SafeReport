"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { memo } from "react"

/**
 * Recharts-dependent bar charts for the Analytics page.
 *
 * Why this lives in its own file: Recharts is ~70KB gzipped and pulls in
 * d3 internals. The KPI tiles and filter card at the top of the Analytics
 * page don't need any of it. Keeping the bars in a separate module lets
 * the parent `analytics-client.tsx` import them via `next/dynamic`, so the
 * main analytics chunk paints (header, filters, KPI tiles, leaderboard)
 * before Recharts has finished downloading. On a cold mobile connection
 * that's typically a 200–400 ms improvement in time-to-interactive.
 *
 * The chart components are also wrapped in `memo` so re-renders driven by
 * filter chip clicks or info-popover hovers don't re-run Recharts' layout
 * pass when the data hasn't changed.
 */

export type BucketedStatus = {
  date: string
  new: number
  in_progress: number
  awaiting_ho: number
  returned: number
  closed: number
  voided: number
}

export type BucketedCategory = { date: string } & Record<string, number | string>

const STATUS_FILL: Record<keyof Omit<BucketedStatus, "date">, string> = {
  new: "#475569",
  in_progress: "#4338CA",
  awaiting_ho: "#0369A1",
  returned: "#C2410C",
  closed: "#0F766E",
  voided: "#94A3B8",
}

const STATUS_LABEL: Record<keyof Omit<BucketedStatus, "date">, string> = {
  new: "New",
  in_progress: "Acknowledged",
  awaiting_ho: "Awaiting HO",
  returned: "Returned",
  closed: "Closed",
  voided: "Voided",
}

const STATUS_ORDER: readonly (keyof Omit<BucketedStatus, "date">)[] = [
  "closed",
  "awaiting_ho",
  "returned",
  "in_progress",
  "new",
  "voided",
]

const CATEGORY_STACK_ORDER: ReadonlyArray<{
  key: string
  fill: string
  label: string
}> = [
  { key: "near_miss", fill: "#475569", label: "Near miss" },
  { key: "unsafe_act", fill: "#64748B", label: "Unsafe act" },
  { key: "unsafe_condition", fill: "#94A3B8", label: "Unsafe condition" },
  { key: "first_aid_case", fill: "#FEF3C7", label: "First aid" },
  { key: "medical_treatment_case", fill: "#F59E0B", label: "Medical" },
  { key: "restricted_work_case", fill: "#D97706", label: "Restricted work" },
  { key: "lost_time_injury", fill: "#B45309", label: "Lost time" },
  { key: "fatality", fill: "#7C2D12", label: "Fatality" },
]

function tickDateFmt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    })
  } catch {
    return iso
  }
}

function prettyDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
  } catch {
    return iso
  }
}

function EmptyChartState({ label }: { label: string }) {
  return (
    <div className="h-[240px] flex items-center justify-center text-sm text-slate-400">
      {label}
    </div>
  )
}

export const StatusBars = memo(StatusBarsImpl)
function StatusBarsImpl({ rows }: { rows: BucketedStatus[] }) {
  if (rows.length === 0) {
    return <EmptyChartState label="No reports in range." />
  }
  return (
    <div className="h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
          <XAxis
            dataKey="date"
            tickFormatter={tickDateFmt}
            fontSize={11}
            stroke="#94A3B8"
          />
          <YAxis
            allowDecimals={false}
            fontSize={11}
            stroke="#94A3B8"
            width={28}
          />
          <Tooltip
            labelFormatter={(v) => prettyDate(v as string)}
            contentStyle={{
              fontSize: 12,
              borderRadius: 6,
              border: "1px solid #E2E8F0",
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            formatter={(value) =>
              STATUS_LABEL[value as keyof typeof STATUS_LABEL] ?? value
            }
          />
          {STATUS_ORDER.map((s) => (
            <Bar key={s} dataKey={s} stackId="a" fill={STATUS_FILL[s]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export const CategoryBars = memo(CategoryBarsImpl)
function CategoryBarsImpl({ rows }: { rows: BucketedCategory[] }) {
  if (rows.length === 0) {
    return <EmptyChartState label="No reports in range." />
  }
  return (
    <div className="h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
          <XAxis
            dataKey="date"
            tickFormatter={tickDateFmt}
            fontSize={11}
            stroke="#94A3B8"
          />
          <YAxis
            allowDecimals={false}
            fontSize={11}
            stroke="#94A3B8"
            width={28}
          />
          <Tooltip
            labelFormatter={(v) => prettyDate(v as string)}
            contentStyle={{
              fontSize: 12,
              borderRadius: 6,
              border: "1px solid #E2E8F0",
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {CATEGORY_STACK_ORDER.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="b"
              fill={s.fill}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
