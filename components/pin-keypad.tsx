"use client"

import { Delete, Loader2 } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Four-digit PIN keypad, phone-sized.
 *
 * Renders a 3×4 numeric keypad (1-9, backspace, 0) and a row of four
 * filled/empty dots showing progress. The PIN auto-submits the instant
 * the fourth digit is typed — no separate enter tap, matching the
 * iOS / Android screen-lock PIN pattern managers already know.
 *
 * We render our own keypad instead of relying on `<input inputmode="numeric">`
 * because:
 *   - The browser keyboard would obscure half the screen on a phone
 *   - We need to enforce digits-only and a fixed length visually
 *   - The large touch targets (68×68) are much easier on-site than a
 *     numeric OSK with the built-in phone handling
 */

const PIN_LENGTH = 4

type Props = {
  busy?: boolean
  error?: string | null
  onSubmit: (pin: string) => void
  /** Extra copy shown above the dots — e.g. "3 attempts left". */
  helper?: string | null
}

export function PinKeypad({ busy, error, onSubmit, helper }: Props) {
  const [pin, setPin] = useState("")
  const submittedRef = useRef(false)

  // On a fresh `error` flash, wipe the PIN so the user retries fresh.
  useEffect(() => {
    if (error) {
      setPin("")
      submittedRef.current = false
    }
  }, [error])

  const press = useCallback(
    (d: string) => {
      if (busy) return
      if (submittedRef.current) return
      setPin((p) => {
        if (p.length >= PIN_LENGTH) return p
        const next = p + d
        if (next.length === PIN_LENGTH && !submittedRef.current) {
          // React Strict Mode double-invokes the updater in dev; the
          // !submittedRef guard keeps us from queueing onSubmit twice.
          submittedRef.current = true
          // Defer so the final dot paints before we go busy.
          queueMicrotask(() => onSubmit(next))
        }
        return next
      })
    },
    [busy, onSubmit],
  )

  const backspace = useCallback(() => {
    if (busy) return
    if (submittedRef.current) return
    setPin((p) => p.slice(0, -1))
  }, [busy])

  // Keyboard support for desktop QA — numbers and backspace. No Enter key:
  // submission is automatic on the fourth digit.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (busy) return
      if (e.key >= "0" && e.key <= "9") {
        press(e.key)
        return
      }
      if (e.key === "Backspace") {
        backspace()
        return
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [press, backspace, busy])

  const dots = Array.from({ length: PIN_LENGTH }, (_, i) => {
    const filled = i < pin.length
    return (
      <span
        key={i}
        aria-hidden
        className={`h-3 w-3 rounded-full border ${
          filled
            ? "border-indigo-700 bg-indigo-700"
            : "border-indigo-300 bg-transparent"
        }`}
      />
    )
  })

  return (
    <div className="flex flex-col items-center">
      <div
        className="flex items-center gap-3"
        role="status"
        aria-live="polite"
        aria-label={`PIN: ${pin.length} of ${PIN_LENGTH} digits entered`}
      >
        {busy ? (
          <Loader2
            className="h-5 w-5 animate-spin text-indigo-700"
            strokeWidth={1.8}
            aria-hidden
          />
        ) : (
          dots
        )}
      </div>

      {helper && !error && (
        <p className="mt-3 text-[12px] text-slate-500">{helper}</p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-3 rounded-md bg-orange-100 px-3 py-1.5 text-[12px] font-medium text-orange-700"
        >
          {error}
        </p>
      )}

      <div className="mt-7 grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <Key key={d} disabled={busy} onPress={() => press(d)}>
            {d}
          </Key>
        ))}
        {/* Bottom-left slot is intentionally empty — 4-digit PINs don't need
         * a dedicated "clear" beyond backspace, and a blank cell keeps the
         * grid balanced around the 0 key. */}
        <span aria-hidden className="h-[68px] w-[68px]" />
        <Key disabled={busy} onPress={() => press("0")}>
          0
        </Key>
        <Key disabled={busy} onPress={backspace} aria-label="Backspace">
          <Delete className="h-5 w-5" strokeWidth={1.8} />
        </Key>
      </div>
    </div>
  )
}

function Key({
  children,
  onPress,
  disabled,
  ...aria
}: {
  children: React.ReactNode
  onPress: () => void
  disabled?: boolean
} & React.AriaAttributes) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      className="flex h-[68px] w-[68px] items-center justify-center rounded-2xl border border-slate-200 bg-white text-[24px] font-medium text-slate-900 transition hover:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-50"
      {...aria}
    >
      {children}
    </button>
  )
}
