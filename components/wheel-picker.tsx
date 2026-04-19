"use client"

/**
 * Apple-style wheel-picker primitives for Screen 4 of the reporter flow.
 *
 * A <Wheel /> is one column: five visible rows, 40px tall, the centre row
 * is the current selection. <DateTimeWheel /> composes four independent
 * <Wheel /> columns (Day · Hour · Minute · AM/PM) into a single control.
 *
 * Interaction:
 *   - Touch: vertical drag with momentum; snaps to the nearest row on release
 *   - Mouse wheel: one notch = one row
 *   - Keyboard: ArrowUp/Down = ±1 row, PageUp/Down = ±3 rows, Home/End = ends
 *   - Haptics: navigator.vibrate(5) on selection change when supported
 *
 * Accessibility: each column exposes role="spinbutton" with
 * aria-valuenow/min/max/text. Respects prefers-reduced-motion (no
 * snap-back animation, instantaneous settle).
 *
 * The picker is client-only — it uses framer-motion + window.matchMedia.
 */

import { motion, useMotionValue, type PanInfo } from "framer-motion"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type WheelEvent,
} from "react"

const ROW_HEIGHT = 40
const VISIBLE_ROWS = 5 // must be odd so there's a single centre row
const CENTRE_OFFSET = Math.floor(VISIBLE_ROWS / 2) // 2

// ---- Single wheel column -------------------------------------------------

type WheelProps = {
  /** Static list of row labels. */
  options: readonly string[]
  /** Current selected index (0-based). */
  value: number
  /** Called when the user snaps to a new index. */
  onChange: (next: number) => void
  /** Accessible name for screen readers. */
  label: string
  /** Relative width for flex layout. */
  className?: string
}

function Wheel({ options, value, onChange, label, className }: WheelProps) {
  const y = useMotionValue(-value * ROW_HEIGHT)
  const dragStartY = useRef(0)
  const [reduceMotion, setReduceMotion] = useState(false)

  // Track prefers-reduced-motion so we can skip the snap-back animation.
  useEffect(() => {
    if (typeof window === "undefined") return
    const m = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReduceMotion(m.matches)
    const onChange = (e: MediaQueryListEvent) => setReduceMotion(e.matches)
    m.addEventListener("change", onChange)
    return () => m.removeEventListener("change", onChange)
  }, [])

  // Keep the motion value in sync if `value` changes from outside (e.g.
  // initial hydration, or the parent clamping a cross-column dependency).
  useEffect(() => {
    y.set(-value * ROW_HEIGHT)
  }, [value, y])

  const clamp = useCallback(
    (idx: number) => Math.max(0, Math.min(options.length - 1, idx)),
    [options.length],
  )

  const commit = useCallback(
    (nextIdx: number) => {
      const clamped = clamp(nextIdx)
      if (clamped === value) return
      onChange(clamped)
      // Haptic tick on iOS/Android where supported.
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.vibrate === "function"
      ) {
        try {
          navigator.vibrate(5)
        } catch {
          // Some browsers throw on user-gesture requirements; ignore.
        }
      }
    },
    [clamp, onChange, value],
  )

  function onDragStart() {
    dragStartY.current = y.get()
  }

  function onDragEnd(_: unknown, info: PanInfo) {
    // Project a bit further than the raw offset based on velocity so a
    // flick feels like a flick rather than a stop-short.
    const projected =
      dragStartY.current + info.offset.y + info.velocity.y * 0.15
    // Convert y-offset back to an index; snap to nearest row.
    const idx = Math.round(-projected / ROW_HEIGHT)
    commit(idx)
  }

  function onWheel(e: WheelEvent<HTMLDivElement>) {
    // One notch = one row. Horizontal-dominant wheels ignored.
    if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return
    e.preventDefault()
    commit(value + (e.deltaY > 0 ? 1 : -1))
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    switch (e.key) {
      case "ArrowUp":
        e.preventDefault()
        commit(value - 1)
        break
      case "ArrowDown":
        e.preventDefault()
        commit(value + 1)
        break
      case "PageUp":
        e.preventDefault()
        commit(value - 3)
        break
      case "PageDown":
        e.preventDefault()
        commit(value + 3)
        break
      case "Home":
        e.preventDefault()
        commit(0)
        break
      case "End":
        e.preventDefault()
        commit(options.length - 1)
        break
    }
  }

  const containerHeight = ROW_HEIGHT * VISIBLE_ROWS

  // Drag is constrained so rows can't fly past the first / last option.
  const dragMin = -(options.length - 1) * ROW_HEIGHT
  const dragMax = 0

  return (
    <div
      role="spinbutton"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={options.length - 1}
      aria-valuenow={value}
      aria-valuetext={options[value]}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onWheel={onWheel}
      className={`relative select-none overflow-hidden rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/50 ${
        className ?? ""
      }`}
      style={{ height: containerHeight }}
    >
      {/* Centre row bracket — purely decorative, pointer-events: none. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 z-10 rounded-[3px] border border-indigo-500 bg-indigo-100/60"
        style={{
          top: CENTRE_OFFSET * ROW_HEIGHT,
          height: ROW_HEIGHT,
        }}
      />

      {/* Soft fade masks at the top and bottom so out-of-focus rows blur out. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-20 h-10 bg-gradient-to-b from-white to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-10 bg-gradient-to-t from-white to-transparent"
      />

      <motion.ul
        drag="y"
        dragConstraints={{ top: dragMin, bottom: dragMax }}
        dragElastic={0.12}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        style={{
          y,
          // Offset so that the first option aligns with the centre row.
          paddingTop: CENTRE_OFFSET * ROW_HEIGHT,
          paddingBottom: CENTRE_OFFSET * ROW_HEIGHT,
        }}
        animate={{ y: -value * ROW_HEIGHT }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { type: "tween", ease: [0.2, 0.9, 0.3, 1], duration: 0.18 }
        }
        className="m-0 list-none touch-none"
      >
        {options.map((opt, idx) => {
          const distance = Math.abs(idx - value)
          const tone =
            distance === 0
              ? "font-bold text-indigo-900 text-[14pt]"
              : distance === 1
                ? "text-slate-600 text-[11pt]"
                : "text-slate-400 text-[9.5pt]"
          return (
            <li
              key={opt}
              className={`flex items-center justify-center ${tone}`}
              style={{ height: ROW_HEIGHT }}
            >
              {opt}
            </li>
          )
        })}
      </motion.ul>
    </div>
  )
}

// ---- Four-column date/time wheel ----------------------------------------

/** Labels for the day column — today, yesterday, 2..6 days ago. */
const DAY_LABELS = [
  "Today",
  "Yesterday",
  "2 days ago",
  "3 days ago",
  "4 days ago",
  "5 days ago",
  "6 days ago",
] as const

const HOUR_LABELS = Array.from({ length: 12 }, (_, i) => String(i + 1)) // "1".."12"
const MINUTE_LABELS = ["00", "15", "30", "45"] as const
const AMPM_LABELS = ["AM", "PM"] as const

export type DateTimeValue = {
  dayIndex: number // 0 = today, 6 = 6 days ago
  hour12: number // 1..12
  minute: number // 0 | 15 | 30 | 45
  ampm: "AM" | "PM"
}

/**
 * Build an ISO 8601 string for the user's selection, using the local
 * timezone (event_at is reporter-local — the DB stores as timestamptz).
 */
export function toISO(v: DateTimeValue, now: Date = new Date()): string {
  const d = new Date(now)
  d.setDate(d.getDate() - v.dayIndex)
  let h = v.hour12 % 12 // 12 AM → 0, 12 PM → 12
  if (v.ampm === "PM") h += 12
  d.setHours(h, v.minute, 0, 0)
  return d.toISOString()
}

/** Default selection: today, current hour rounded down to the nearest 15. */
export function defaultValue(now: Date = new Date()): DateTimeValue {
  const raw = now.getHours()
  const ampm: "AM" | "PM" = raw >= 12 ? "PM" : "AM"
  let h12 = raw % 12
  if (h12 === 0) h12 = 12
  const m = now.getMinutes()
  const snapped = m < 15 ? 0 : m < 30 ? 15 : m < 45 ? 30 : 45
  return { dayIndex: 0, hour12: h12, minute: snapped, ampm }
}

type DateTimeWheelProps = {
  value: DateTimeValue
  onChange: (next: DateTimeValue) => void
}

export function DateTimeWheel({ value, onChange }: DateTimeWheelProps) {
  const hourIdx = value.hour12 - 1 // "1" is index 0
  const minuteIdx = useMemo(
    () => MINUTE_LABELS.indexOf(String(value.minute).padStart(2, "0") as "00"),
    [value.minute],
  )
  const ampmIdx = value.ampm === "AM" ? 0 : 1

  return (
    <div className="mx-auto flex w-full max-w-sm items-stretch gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <Wheel
        label="Day"
        options={DAY_LABELS}
        value={value.dayIndex}
        onChange={(next) => onChange({ ...value, dayIndex: next })}
        className="flex-[1.6]"
      />
      <Wheel
        label="Hour"
        options={HOUR_LABELS}
        value={hourIdx}
        onChange={(next) => onChange({ ...value, hour12: next + 1 })}
        className="flex-1"
      />
      <Wheel
        label="Minute"
        options={MINUTE_LABELS}
        value={minuteIdx < 0 ? 0 : minuteIdx}
        onChange={(next) =>
          onChange({ ...value, minute: Number(MINUTE_LABELS[next]) })
        }
        className="flex-1"
      />
      <Wheel
        label="AM or PM"
        options={AMPM_LABELS}
        value={ampmIdx}
        onChange={(next) =>
          onChange({ ...value, ampm: AMPM_LABELS[next] as "AM" | "PM" })
        }
        className="flex-1"
      />
    </div>
  )
}

// ---- Helpers exported for consumers -------------------------------------

export const DAY_LABELS_EXPORT = DAY_LABELS
export const HOUR_LABELS_EXPORT = HOUR_LABELS
export const MINUTE_LABELS_EXPORT = MINUTE_LABELS
export const AMPM_LABELS_EXPORT = AMPM_LABELS
